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

function pbOsFromElectronPlatformName(platformName) {
  // electronPlatformName: "darwin" | "linux" | "win32"
  if (platformName === 'win32') return 'windows';
  return platformName;
}

function pbArchFromElectronBuilderArch(arch) {
  // electron-builder Arch enum:
  // 1 = x64, 3 = arm64 (others unused in our mac builds).
  if (arch === 3) return 'arm64';
  return 'amd64';
}

exports.default = async function afterPack(context) {
  const pbOs = pbOsFromElectronPlatformName(context.electronPlatformName);
  if (!['darwin', 'linux', 'windows'].includes(pbOs)) return;

  const pbArch = pbArchFromElectronBuilderArch(context.arch);
  const desktopDir = context.packager.projectDir; // .../apps/desktop
  const repoRoot = path.resolve(desktopDir, '../..'); // .../mission-control

  const isWindows = pbOs === 'windows';
  const ext = isWindows ? '.exe' : '';

  const preferred = path.join(repoRoot, 'pb', `pocketbase-${pbOs}-${pbArch}${ext}`);
  const fallback = path.join(repoRoot, 'pb', `pocketbase${ext}`);
  const source = (await exists(preferred)) ? preferred : fallback;

  if (!(await exists(source))) {
    throw new Error(`[afterPack] PocketBase binary not found. Expected ${preferred} or ${fallback}`);
  }

  let dest;
  if (context.electronPlatformName === 'darwin') {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    dest = path.join(context.appOutDir, appName, 'Contents', 'Resources', 'pb', 'pocketbase');
  } else if (context.electronPlatformName === 'linux') {
    dest = path.join(context.appOutDir, 'resources', 'pb', 'pocketbase');
  } else if (context.electronPlatformName === 'win32') {
    dest = path.join(context.appOutDir, 'resources', 'pb', 'pocketbase.exe');
  }
  if (!dest) return;

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  // Best-effort: ensure it's executable (macOS/Linux).
  if (!isWindows) {
    try {
      await fs.chmod(dest, 0o755);
    } catch {
      // ignore
    }
  }
};
