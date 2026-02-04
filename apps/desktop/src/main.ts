import { app, BrowserWindow, ipcMain } from 'electron';
import updaterPkg from 'electron-updater';
import log from 'electron-log';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// electron-updater is CommonJS; default import gives us module.exports.
const { autoUpdater } = updaterPkg as unknown as { autoUpdater: typeof import('electron-updater').autoUpdater };

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'not_available'; version?: string }
  | { status: 'downloading'; percent?: number }
  | { status: 'downloaded'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'error'; message: string };

const RESTART_EXIT_CODE = 42;

let pbProc: ChildProcess | null = null;
let webProc: ChildProcess | null = null;
let workerProc: ChildProcess | null = null;

let mainWindow: BrowserWindow | null = null;
let updateState: UpdateState = { status: 'idle' };
let updaterTokenConfigured = false;
let currentWebPort: number | null = null;
let starting: Promise<void> | null = null;

type UpdaterConfig = { githubToken?: string };

process.on('uncaughtException', (err) => {
  log.error('[desktop] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('[desktop] unhandledRejection', reason);
});

function isPlaceholderSecret(value: string | undefined) {
  if (!value) return true;
  const s = value.trim().toLowerCase();
  return s === 'change-me' || s === 'changeme';
}

function parseEnvFile(contents: string) {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;
    // Basic .env parsing (handles "quoted values").
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function readFileIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function repoRootFromDistDir() {
  // apps/desktop/dist -> repo root is ../../..
  return path.resolve(THIS_DIR, '../../..');
}

function appResourceRoot() {
  // In packaged builds, extraResources are placed under process.resourcesPath.
  return app.isPackaged ? process.resourcesPath : repoRootFromDistDir();
}

function dataRoot() {
  // Keep all mutable state under userData so the app is "install-and-go".
  return path.join(app.getPath('userData'), 'data');
}

function updaterConfigPath() {
  return path.join(dataRoot(), 'updater.json');
}

async function loadUpdaterConfig(): Promise<UpdaterConfig> {
  const raw = await readFileIfExists(updaterConfigPath());
  if (!raw) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json?.githubToken === 'string') return { githubToken: json.githubToken };
    return {};
  } catch {
    return {};
  }
}

async function saveUpdaterConfig(next: UpdaterConfig) {
  await fs.mkdir(dataRoot(), { recursive: true });
  const payload = JSON.stringify({ githubToken: next.githubToken || '' }, null, 2);
  await fs.writeFile(updaterConfigPath(), payload, 'utf8');
  // Best-effort: tighten perms (macOS/Linux).
  try {
    await fs.chmod(updaterConfigPath(), 0o600);
  } catch {
    // ignore
  }
}

async function loadEffectiveEnv() {
  const root = appResourceRoot();
  const envExamplePath = path.join(root, '.env.example');
  const example = await readFileIfExists(envExamplePath);
  const base = example ? parseEnvFile(example) : {};

  const envPath = path.join(dataRoot(), '.env');
  const envFile = await readFileIfExists(envPath);
  const override = envFile ? parseEnvFile(envFile) : {};

  return { envPath, env: { ...base, ...override } };
}

function needsSetup(env: Record<string, string>) {
  return (
    isPlaceholderSecret(env.MC_ADMIN_PASSWORD) ||
    isPlaceholderSecret(env.PB_ADMIN_PASSWORD) ||
    isPlaceholderSecret(env.PB_SERVICE_PASSWORD)
  );
}

async function ensureExecutable(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    // eslint-disable-next-line no-bitwise
    const mode = stat.mode | 0o111;
    await fs.chmod(filePath, mode);
  } catch {
    // best-effort
  }
}

async function waitForOk(url: string, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnNode(scriptPath: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; name: string }) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: opts.cwd,
    env: {
      ...opts.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `[${opts.name}]`;
  child.stdout?.on('data', (d) => log.info(prefix, String(d).trimEnd()));
  child.stderr?.on('data', (d) => log.error(prefix, String(d).trimEnd()));
  child.on('error', (err) => log.error(prefix, err));
  return child;
}

async function stopStack() {
  for (const proc of [webProc, workerProc, pbProc]) {
    if (!proc) continue;
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }
  webProc = null;
  workerProc = null;
  pbProc = null;
}

async function startStack() {
  const root = appResourceRoot();
  const dataDir = dataRoot();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.join(dataDir, 'pb', 'pb_data'), { recursive: true });

  const { envPath, env } = await loadEffectiveEnv();
  if (!(await readFileIfExists(envPath))) {
    // First launch: seed .env from .env.example so Setup can patch in-place.
    const raw = await readFileIfExists(path.join(root, '.env.example'));
    if (raw) await fs.writeFile(envPath, raw, 'utf8');
  }

  const webPort = Number.parseInt(env.MC_WEB_PORT || env.PORT || '4010', 10) || 4010;
  const pbUrl = env.PB_URL || 'http://127.0.0.1:8090';
  const pbPort = Number.parseInt(new URL(pbUrl).port || '8090', 10) || 8090;

  const pbBin = process.platform === 'win32' ? path.join(root, 'pb', 'pocketbase.exe') : path.join(root, 'pb', 'pocketbase');
  await ensureExecutable(pbBin);
  const pbDataDir = path.join(dataDir, 'pb', 'pb_data');
  const pbMigrationsDir = path.join(root, 'pb', 'pb_migrations');
  const pbLog = path.join(dataDir, 'pb', 'pocketbase.log');
  await fs.mkdir(path.dirname(pbLog), { recursive: true });

  log.info('[desktop] starting pocketbase', { pbPort, pbDataDir });
  pbProc = spawn(pbBin, ['serve', '--dir', pbDataDir, '--migrationsDir', pbMigrationsDir, '--http', `127.0.0.1:${pbPort}`], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pbOut = await fs.open(pbLog, 'a').catch(() => null);
  pbProc.stdout?.on('data', (d) => {
    const s = String(d);
    log.info('[pb]', s.trimEnd());
    void pbOut?.appendFile(s).catch(() => {});
  });
  pbProc.stderr?.on('data', (d) => {
    const s = String(d);
    log.error('[pb]', s.trimEnd());
    void pbOut?.appendFile(s).catch(() => {});
  });

  await waitForOk(`http://127.0.0.1:${pbPort}/api/health`, 20_000);

  const envForChildren: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    PORT: String(webPort),
    MC_WEB_PORT: String(webPort),
    MC_BIND_HOST: '127.0.0.1',
    HOSTNAME: '127.0.0.1',
    MC_AUTO_RESTART: '1',
    MC_RESTART_EXIT_CODE: String(RESTART_EXIT_CODE),
    MC_APP_DIR: root,
    MC_DATA_DIR: dataDir,
  };

  const webRoot = app.isPackaged
    ? path.join(root, 'web', 'apps', 'web')
    : path.join(root, 'apps', 'web', '.next', 'standalone', 'apps', 'web');
  const webServer = path.join(webRoot, 'server.js');
  log.info('[desktop] starting web', { webPort, webServer });
  webProc = spawnNode(webServer, [], { cwd: webRoot, env: envForChildren, name: 'web' });
  webProc.on('exit', (code) => {
    log.warn('[desktop] web exited', code);
    if (code === RESTART_EXIT_CODE) {
      void restartStack();
    }
  });

  await waitForOk(`http://127.0.0.1:${webPort}/api/health`, 25_000).catch(() => {});

  if (!needsSetup(env)) {
    const workerEntry = app.isPackaged ? path.join(root, 'worker', 'index.js') : path.join(root, 'apps', 'worker', 'dist', 'index.js');
    log.info('[desktop] starting worker', { workerEntry });
    workerProc = spawnNode(workerEntry, [], { cwd: root, env: envForChildren, name: 'worker' });
  }

  return { webPort };
}

async function restartStack() {
  await stopStack();
  const { webPort } = await startStack();
  currentWebPort = webPort;
  if (mainWindow) {
    const { env } = await loadEffectiveEnv();
    const target = needsSetup(env) ? `/setup` : `/`;
    void mainWindow.loadURL(`http://127.0.0.1:${webPort}${target}`);
  }
}

function broadcastUpdateState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('mc:update', updateState);
}

function setUpdateState(next: UpdateState) {
  updateState = next;
  broadcastUpdateState();
}

function setupAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;

  // Private GitHub repos require auth to download release assets.
  // We keep this optional to avoid complicating first-run setup.
  void loadUpdaterConfig().then((cfg) => {
    const token = cfg.githubToken?.trim();
    updaterTokenConfigured = Boolean(token);
    if (token) {
      autoUpdater.requestHeaders = { Authorization: `token ${token}` };
    }
  });

  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    setUpdateState({
      status: 'available',
      version: info.version,
      releaseName: (info as any).releaseName,
      releaseNotes: typeof (info as any).releaseNotes === 'string' ? (info as any).releaseNotes : undefined,
    })
  );
  autoUpdater.on('update-not-available', (info) => setUpdateState({ status: 'not_available', version: info.version }));
  autoUpdater.on('download-progress', (p) => setUpdateState({ status: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) =>
    setUpdateState({
      status: 'downloaded',
      version: info.version,
      releaseName: (info as any).releaseName,
      releaseNotes: typeof (info as any).releaseNotes === 'string' ? (info as any).releaseNotes : undefined,
    })
  );
  autoUpdater.on('error', (err) => setUpdateState({ status: 'error', message: err?.message || String(err) }));

  ipcMain.handle('mc:getVersion', () => app.getVersion());
  ipcMain.handle('mc:getUpdateState', () => updateState);
  ipcMain.handle('mc:getUpdateAuth', () => ({ githubTokenConfigured: updaterTokenConfigured }));
  ipcMain.handle('mc:setGithubToken', async (_evt, payload: { token: string }) => {
    const token = String(payload?.token || '').trim();
    await saveUpdaterConfig({ githubToken: token });
    updaterTokenConfigured = Boolean(token);
    autoUpdater.requestHeaders = token ? { Authorization: `token ${token}` } : {};
    return { ok: true, configured: updaterTokenConfigured };
  });
  ipcMain.handle('mc:clearGithubToken', async () => {
    await saveUpdaterConfig({ githubToken: '' });
    updaterTokenConfigured = false;
    autoUpdater.requestHeaders = {};
    return { ok: true };
  });
  ipcMain.handle('mc:checkForUpdates', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err: any) {
      setUpdateState({ status: 'error', message: err?.message || String(err) });
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('mc:downloadUpdate', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err: any) {
      setUpdateState({ status: 'error', message: err?.message || String(err) });
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('mc:quitAndInstall', async () => {
    autoUpdater.quitAndInstall();
    return { ok: true };
  });
}

async function createMainWindow(webPort: number) {
  const preloadPath = path.join(THIS_DIR, 'preload.js');
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: '#101010',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  // If something prevents ready-to-show from firing, still show a window.
  setTimeout(() => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 1500);

  // Auto-supply Basic Auth credentials from the current .env so the desktop app
  // feels like a native login (no browser prompt).
  win.webContents.on('login', async (event, _request, authInfo, callback) => {
    if (authInfo.isProxy) return;
    if (authInfo.scheme !== 'basic') return;
    const { env } = await loadEffectiveEnv();
    if (!env.MC_ADMIN_USER || !env.MC_ADMIN_PASSWORD) return;
    if (isPlaceholderSecret(env.MC_ADMIN_PASSWORD)) return;
    event.preventDefault();
    callback(env.MC_ADMIN_USER, env.MC_ADMIN_PASSWORD);
  });

  const { env } = await loadEffectiveEnv();
  const target = needsSetup(env) ? `/setup` : `/`;
  const url = `http://127.0.0.1:${webPort}${target}`;
  try {
    await win.loadURL(url);
  } catch (err) {
    log.error('[desktop] failed to load URL', { url, err });
  }
  return win;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function createErrorWindow(title: string, body: string) {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    backgroundColor: '#101010',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif; background: #0b0b0b; color: #f2f2f2; }
      .wrap { padding: 28px; }
      h1 { margin: 0 0 10px; font-size: 22px; letter-spacing: -0.02em; }
      p { margin: 0 0 12px; color: #cfcfcf; line-height: 1.45; }
      pre { margin: 14px 0 0; background: #121212; border: 1px solid #222; border-radius: 10px; padding: 14px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: #e6e6e6; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
      .hint { margin-top: 16px; padding: 12px 14px; border-radius: 10px; border: 1px solid #2a2a2a; background: #0f0f0f; }
      .hint b { color: #fff; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      <div class="hint">
        <p><b>Common causes:</b> another copy of Mission Control is already running, or ports <code>4010</code>/<code>8090</code> are in use.</p>
        <p><b>Logs:</b> <code>${escapeHtml(path.join(app.getPath('home'), 'Library/Logs/@mission-control/desktop/main.log'))}</code></p>
      </div>
    </div>
  </body>
</html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
  win.focus();
  return win;
}

async function ensureMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return;
  }

  if (currentWebPort == null) {
    const { webPort } = await startStack();
    currentWebPort = webPort;
  }

  mainWindow = await createMainWindow(currentWebPort);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function main() {
  log.info('[desktop] starting Mission Control desktop', { version: app.getVersion(), packaged: app.isPackaged });
  setupAutoUpdater();

  await ensureMainWindow();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void stopStack();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    void ensureMainWindow();
  });
}

app.on('activate', () => {
  void ensureMainWindow();
});

app
  .whenReady()
  .then(() => {
    if (!starting) starting = main();
    return starting;
  })
  .catch((err) => {
    log.error('[desktop] failed to start', err);
    void createErrorWindow('Mission Control failed to start', err?.message || String(err)).catch(() => {});
  });
