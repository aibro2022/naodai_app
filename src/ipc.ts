export const IpcChannels = {
  ping: 'ipc:ping',
  getAppInfo: 'ipc:get-app-info',
  getSystemInfo: 'ipc:get-system-info',
  getMaxCudaVersion: 'ipc:get-max-cuda-version',
  selectFolder: 'ipc:select-folder',
  getConfig: 'ipc:get-config',
  updateConfig: 'ipc:update-config',
  push: 'ipc:push',
  authLogin: 'ipc:auth-login',
  authLogout: 'ipc:auth-logout',
  authProfile: 'ipc:auth-profile',
  authRegister: 'ipc:auth-register',
  modelsPaged: 'ipc:models-paged',
  modelsCacheRead: 'ipc:models-cache-read',
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

export interface Account {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
  createdAt?: string;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  account: Account;
}

export interface RegisterPayload {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
}

export interface WeightFile {
  id: number;
  name: string;
  size: string | number;
  hashType?: string;
  downloadAddress?: string;
  fileHash?: string;
  qbit: number | null;
  isSplit?: boolean;
  type?: number;
}

export interface WeightedModel {
  id: number;
  modelId: number;
  weightFileId: number;
  weightFile: WeightFile;
}

export interface ModelCreator {
  id: number;
  name: string;
  countryId: number | null;
}

export interface ModelLauncher {
  id: number;
  name: string;
  icon?: string | null;
}

export interface ModelAdmin {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
}

export interface Model {
  id: number;
  name: string;
  type: number;
  parameter?: string;
  contextWindows?: string;
  hasDraft: boolean;
  hasMmproj: boolean;
  hasDiffusion: boolean;
  creatorId?: number;
  qorId?: number;
  launcherId?: number;
  adminId?: number;
  createdAt?: string;
  updatedAt?: string;
  creator?: ModelCreator | null;
  qor?: ModelCreator | null;
  launcher?: ModelLauncher | null;
  admin?: ModelAdmin | null;
  mmprojs?: WeightedModel[];
  draftModels?: WeightedModel[];
  diffusionModels?: WeightedModel[];
  quantizedModels?: WeightedModel[];
}

export interface ModelsPagedParams {
  page?: number;
  pageSize?: number;
  name?: string;
  type?: number;
}

export interface ModelsPagedResult {
  list: Model[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AppConfig {
  systemInfo?: SystemInfo;
  modelFolder?: string;
  contextSizeBytes?: number;
  apiBaseUrl?: string;
  auth?: AuthSession;
}

export interface NaodaiApi {
  ping: (message: string) => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  getSystemInfo: (force?: boolean) => Promise<SystemInfo>;
  getMaxCudaVersion: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  getConfig: () => Promise<AppConfig>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  login: (username: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  getProfile: () => Promise<Account>;
  register: (payload: RegisterPayload) => Promise<void>;
  fetchModelsPaged: (params: ModelsPagedParams) => Promise<ModelsPagedResult>;
  readModelsCache: () => Promise<ModelsPagedResult | null>;
  onPush: (listener: (payload: PushPayload) => void) => () => void;
}