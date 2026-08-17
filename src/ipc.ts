export const IpcChannels = {
  ping: 'ipc:ping',
  getAppInfo: 'ipc:get-app-info',
  getSystemInfo: 'ipc:get-system-info',
  getMaxCudaVersion: 'ipc:get-max-cuda-version',
  selectFolder: 'ipc:select-folder',
  getConfig: 'ipc:get-config',
  updateConfig: 'ipc:update-config',
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
  processors: number;
  memoryTotal: number;
  gpuVendor: string;
  gpuVram: number;
  cudaVersion: string;
  cudaCapability: string;
  osArch: string;
  platform: string;
}

export interface PushPayload {
  source: string;
  message: string;
}

export interface AppConfig {
  systemInfo?: SystemInfo;
  modelFolder?: string;
  contextSizeBytes?: number;
}

export interface NaodaiApi {
  ping: (message: string) => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  getSystemInfo: (force?: boolean) => Promise<SystemInfo>;
  getMaxCudaVersion: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  getConfig: () => Promise<AppConfig>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  onPush: (listener: (payload: PushPayload) => void) => () => void;
}