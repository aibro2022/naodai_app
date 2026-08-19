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
  launcherVersionsFilter: 'ipc:launcher-versions-filter',
  prepareDownload: 'ipc:prepare-download',
  startDownload: 'ipc:start-download',
  downloadProgress: 'ipc:download-progress',
  cancelDownload: 'ipc:cancel-download',
  runModel: 'ipc:run-model',
  stopModel: 'ipc:stop-model',
  modelLogRead: 'ipc:model-log-read',
  modelExit: 'ipc:model-exit',
  modelReady: 'ipc:model-ready',
  openModelWeb: 'ipc:open-model-web',
  localModelsRead: 'ipc:local-models-read',
  scanLocalModels: 'ipc:scan-local-models',
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

export interface LauncherVersion {
  id: number;
  name: string;
  version?: string;
  platform?: number;
  osArch?: number;
  gpu?: number;
  cuda?: string | number;
  launcherId: number;
  downloadAddress?: string;
  extraDownloadAddress?: string;
}

export interface LauncherVersionFilterParams {
  launcherId?: number;
  platform?: number;
  osArch?: number;
  gpu?: number;
  cuda?: number;
}

export interface DownloadItem {
  url: string;
  fileName: string;
  targetDir: string;
  /** 文件大小（字节），已知时才用于判断是否启用分片多线程下载 */
  size?: number;
}

export interface PrepareDownloadParams {
  model: Model;
  weightFile: WeightFile;
}

export interface PrepareDownloadResult {
  items: DownloadItem[];
  launcherVersion: LauncherVersion;
}

export interface DownloadProgressPayload {
  fileName: string;
  index: number;
  totalItems: number;
  received: number;
  total: number;
  percent: number;
  done: boolean;
  error?: string;
}

/** modelFolder/config.json 里 downloads 数组中的一条下载记录。 */
export type LocalFileKind = 'quantized' | 'mmproj' | 'draft';

export interface LocalDownloadRecord {
  /** 唯一标识：`${modelId}-${weightId}` */
  id: string;
  downloadedAt: string;
  launcherId: number;
  launcherName: string;
  launcherVersionId: number;
  launcherVersionName: string;
  launcherPath?: string;
  modelId: number;
  modelName: string;
  modelType?: number;
  contextWindows?: string;
  weightId: number;
  weightName: string;
  files: { url: string; name: string; path: string; type?: LocalFileKind }[];
}

export interface RunModelParams {
  launcherPath: string;
  modelPath: string;
  mmprojPath?: string;
  draftPath?: string;
  context: number;
  tools: boolean;
  customParams?: string;
}

export interface RunModelResult {
  pid: number;
  logPath: string;
  command: string;
}

export interface ModelLogChunk {
  content: string;
  endOffset: number;
}

export interface ModelReadyPayload {
  pid: number;
  url: string;
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
  fetchLauncherVersionsFilter: (
    params: LauncherVersionFilterParams,
  ) => Promise<LauncherVersion[]>;
  prepareDownload: (params: PrepareDownloadParams) => Promise<PrepareDownloadResult>;
  startDownload: (items: DownloadItem[]) => Promise<void>;
  cancelDownload: () => Promise<void>;
  runModel: (params: RunModelParams) => Promise<RunModelResult>;
  stopModel: (pid: number) => Promise<void>;
  readModelLog: (logPath: string, offset: number) => Promise<ModelLogChunk>;
  onModelExit: (listener: (pid: number) => void) => () => void;
  onModelReady: (listener: (payload: ModelReadyPayload) => void) => () => void;
  openModelWeb: (pid: number) => Promise<void>;
  readLocalModels: () => Promise<LocalDownloadRecord[]>;
  scanLocalModels: () => Promise<LocalDownloadRecord[]>;
  onDownloadProgress: (
    listener: (payload: DownloadProgressPayload) => void,
  ) => () => void;
  onPush: (listener: (payload: PushPayload) => void) => () => void;
}