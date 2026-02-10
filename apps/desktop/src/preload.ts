import { contextBridge, ipcRenderer } from 'electron';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'not_available'; version?: string }
  | { status: 'downloading'; percent?: number }
  | { status: 'downloaded'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'error'; message: string };

contextBridge.exposeInMainWorld('MissionControlDesktop', {
  getVersion: () => ipcRenderer.invoke('mc:getVersion') as Promise<string>,
  getRuntimeInfo: () =>
    ipcRenderer.invoke('mc:getRuntimeInfo') as Promise<{ platform: string; arch: string }>,
  getUpdateState: () => ipcRenderer.invoke('mc:getUpdateState') as Promise<UpdateState>,
  getUpdateAuth: () => ipcRenderer.invoke('mc:getUpdateAuth') as Promise<{ githubTokenConfigured: boolean }>,
  setGithubToken: (token: string) =>
    ipcRenderer.invoke('mc:setGithubToken', { token }) as Promise<{ ok: boolean; configured?: boolean; error?: string }>,
  clearGithubToken: () => ipcRenderer.invoke('mc:clearGithubToken') as Promise<{ ok: boolean; error?: string }>,
  checkForUpdates: () => ipcRenderer.invoke('mc:checkForUpdates') as Promise<{ ok: boolean; error?: string }>,
  downloadUpdate: () => ipcRenderer.invoke('mc:downloadUpdate') as Promise<{ ok: boolean; error?: string }>,
  quitAndInstall: () => ipcRenderer.invoke('mc:quitAndInstall') as Promise<{ ok: boolean; error?: string }>,
  onUpdate: (cb: (state: UpdateState) => void) => {
    const listener = (_: unknown, state: UpdateState) => cb(state);
    ipcRenderer.on('mc:update', listener);
    return () => ipcRenderer.off('mc:update', listener);
  },
});
