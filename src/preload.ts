import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IpcChannels,
  type NaodaiApi,
  type PushPayload,
} from './ipc';

const api: NaodaiApi = {
  ping: (message) => ipcRenderer.invoke(IpcChannels.ping, message),
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  getSystemInfo: (force) =>
    ipcRenderer.invoke(IpcChannels.getSystemInfo, force),
  getMaxCudaVersion: () => ipcRenderer.invoke(IpcChannels.getMaxCudaVersion),
  selectFolder: () => ipcRenderer.invoke(IpcChannels.selectFolder),
  getConfig: () => ipcRenderer.invoke(IpcChannels.getConfig),
  updateConfig: (patch) => ipcRenderer.invoke(IpcChannels.updateConfig, patch),
  onPush: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: PushPayload) => {
      listener(payload);
    };
    ipcRenderer.on(IpcChannels.push, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.push, handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);