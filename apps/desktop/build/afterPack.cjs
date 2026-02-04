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

function pbArchFromElectronBuilderArch(arch) {
  // electron-builder Arch enum:
  // 1 = x64, 3 = arm64 (others unused in our mac builds).
  if (arch === 3) return 'arm64';
  return 'amd64';
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const pbArch = pbArchFromElectronBuilderArch(context.arch);
  const desktopDir = context.packager.projectDir; // .../apps/desktop
  const repoRoot = path.resolve(desktopDir, '../..'); // .../mission-control

  const preferred = path.join(repoRoot, 'pb', `pocketbase-darwin-${pbArch}`);
  const fallback = path.join(repoRoot, 'pb', 'pocketbase');
  const source = (await exists(preferred)) ? preferred : fallback;

  if (!(await exists(source))) {
    throw new Error(`[afterPack] PocketBase binary not found. Expected ${preferred} or ${fallback}`);
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const dest = path.join(context.appOutDir, appName, 'Contents', 'Resources', 'pb', 'pocketbase');

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  // Best-effort: ensure it's executable.
  try {
    await fs.chmod(dest, 0o755);
  } catch {
    // ignore
  }
};

