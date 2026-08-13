export const IpcChannels = {
  ping: 'ipc:ping',
  getAppInfo: 'ipc:get-app-info',
  push: 'ipc:push',
} as const;

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
  uptime: number;
}

export interface PushPayload {
  source: string;
  message: string;
}

export interface NaodaiApi {
  ping: (message: string) => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  onPush: (listener: (payload: PushPayload) => void) => () => void;
}