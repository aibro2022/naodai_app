export const IpcChannels = {
  ping: 'ipc:ping',
  getAppInfo: 'ipc:get-app-info',
  getSystemInfo: 'ipc:get-system-info',
  push: 'ipc:push',
} as const;

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
  uptime: number;
}

export interface GpuInfo {
  vendor: string;
  model: string;
  vram: number | null;
}

export interface SystemInfo {
  gpus: GpuInfo[];
  cpuModel: string;
  cpuCores: number;
  memoryTotal: number;
  gpuVendor: string;
  gpuVram: number;
  osArch: string;
}

export interface PushPayload {
  source: string;
  message: string;
}

export interface NaodaiApi {
  ping: (message: string) => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  getSystemInfo: () => Promise<SystemInfo>;
  onPush: (listener: (payload: PushPayload) => void) => () => void;
}