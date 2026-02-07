const fs = require('node:fs/promises');
const path = require('node:path');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function statOrNull(p) {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}

function pbArchFromElectronBuilderArch(arch) {
  // electron-builder Arch enum:
  // 1 = x64, 3 = arm64 (others unused in our mac builds).
  if (arch === 3) return 'arm64';
  return 'amd64';
}

function pbOsFromElectronPlatform(platform) {
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'windows';
  return platform;
}

function pbCandidates({ repoRoot, pbOs, pbArch }) {
  if (pbOs === 'windows') {
    return [
      path.join(repoRoot, 'pb', `pocketbase-windows-${pbArch}.exe`),
      path.join(repoRoot, 'pb', 'pocketbase.exe'),
    ];
  }
  return [
    path.join(repoRoot, 'pb', `pocketbase-${pbOs}-${pbArch}`),
    path.join(repoRoot, 'pb', 'pocketbase'),
  ];
}

function resourceRootForPlatform({ platform, appOutDir, productFilename }) {
  if (platform === 'darwin') {
    const appName = `${productFilename}.app`;
    return path.join(appOutDir, appName, 'Contents', 'Resources');
  }
  // win32 + linux packages use an app dir with a `resources/` folder.
  return path.join(appOutDir, 'resources');
}

async function materializeDir({ src, dest, label }) {
  if (!(await exists(src))) {
    throw new Error(`[afterPack] Missing ${label} at ${src}. Did the web build run (pnpm -r build)?`);
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  const st = await statOrNull(dest);
  // Next standalone uses absolute symlinks for `public` and `.next/static` on macOS.
  // Those are not portable (and can break Windows packaging). Replace with real dirs.
  if (!st) {
    await fs.cp(src, dest, { recursive: true });
    return;
  }

  if (st.isSymbolicLink() || st.isDirectory() || st.isFile()) {
    try {
      await fs.rm(dest, { recursive: true, force: true });
    } catch {
      // ignore; we'll try to overwrite with cp below
    }
  }
  await fs.cp(src, dest, { recursive: true });
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const pbOs = pbOsFromElectronPlatform(platform);
  const pbArch = pbArchFromElectronBuilderArch(context.arch);
  const desktopDir = context.packager.projectDir; // .../apps/desktop
  const repoRoot = path.resolve(desktopDir, '../..'); // .../mission-control

  const candidates = pbCandidates({ repoRoot, pbOs, pbArch });
  let source = '';
  for (const c of candidates) {
    if (await exists(c)) {
      source = c;
      break;
    }
  }
  if (!source) {
    const hint =
      pbOs === 'windows'
        ? `PB_OS=windows PB_ARCH=${pbArch} PB_BIN_PATH=pb/pocketbase-windows-${pbArch}.exe bash scripts/pb_install.sh`
        : `PB_OS=${pbOs} PB_ARCH=${pbArch} PB_BIN_PATH=pb/pocketbase-${pbOs}-${pbArch} bash scripts/pb_install.sh`;
    throw new Error(`[afterPack] PocketBase binary not found for ${pbOs}/${pbArch}. Tried:\n- ${candidates.join('\n- ')}\n\nFetch it with:\n${hint}`);
  }

  const resourcesRoot = resourceRootForPlatform({
    platform,
    appOutDir: context.appOutDir,
    productFilename: context.packager.appInfo.productFilename,
  });
  const destName = pbOs === 'windows' ? 'pocketbase.exe' : 'pocketbase';
  const dest = path.join(resourcesRoot, 'pb', destName);

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  // Best-effort: ensure it's executable (macOS/Linux).
  if (pbOs !== 'windows') {
    try {
      await fs.chmod(dest, 0o755);
    } catch {
      // ignore
    }
  }

  // Fix Next.js standalone absolute symlinks by materializing `public` + `.next/static`
  // into the packaged resources. This prevents cross-platform build issues and ensures
  // desktop installs are "install-and-go" without relying on build machine paths.
  const packagedWebRoot = path.join(resourcesRoot, 'web', 'apps', 'web');
  await materializeDir({
    src: path.join(repoRoot, 'apps', 'web', 'public'),
    dest: path.join(packagedWebRoot, 'public'),
    label: 'web/public',
  });
  await materializeDir({
    src: path.join(repoRoot, 'apps', 'web', '.next', 'static'),
    dest: path.join(packagedWebRoot, '.next', 'static'),
    label: 'web/.next/static',
  });
};
