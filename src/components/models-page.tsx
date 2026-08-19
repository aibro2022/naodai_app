import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  HardDrive,
  Cloud,
  CloudDownload,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DownloadDialog,
  DownloadProgressBar,
  type DownloadState,
} from '@/components/download-dialog';
import { RunDialog, RunStatusBar, type RunSession } from '@/components/run-dialog';
import type {
  LocalDownloadRecord,
  Model,
  SystemInfo,
  WeightedModel,
  WeightFile,
} from '@/ipc';
import type { ModelsCatalog } from '@/lib/models-store';
import { cn, formatErrorMessage } from '@/lib/utils';

const tabs = [
  { value: 'local', label: '本地模型', icon: HardDrive, description: '本地可运行模型' },
  { value: 'optional', label: '可选模型', icon: CloudDownload, description: '可下载运行模型' },
  { value: 'remote', label: '云端模型', icon: Cloud, description: '云端模型服务' },
];

const MODEL_TYPES = [
  { value: 1, label: 'Image-Text-to-Text' },
  { value: 2, label: 'Image-Text-to-Video' },
];

// 接口返回的 size 单位是 GB（可能为字符串），这里转为字节用于与显存比较。
const sizeToBytes = (size: number | string): number => {
  const value = Number(size);
  return Number.isFinite(value) && value > 0 ? value * 1024 ** 3 : 0;
};

const formatGb = (size: number | string): string => {
  const value = Number(size);
  if (!Number.isFinite(value) || value < 0) {
    return 'N/A';
  }
  return `${value.toFixed(2)} GB`;
};

const typeLabel = (type: number): string =>
  MODEL_TYPES.find((item) => item.value === type)?.label ?? '未知类型';

const isTrue = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

const qbitKey = (qbit: number | string | null | undefined): string =>
  qbit === null || qbit === undefined ? '原始' : String(qbit);

// 与显存对比的适配状态：
// fits=比显存多出 2G 以上余量（绿）；close=余量 0~2G（黄）；exceeds=超过显存（红）。
type VramFit = 'fits' | 'close' | 'exceeds' | 'unknown';

const vramFit = (
  sizeBytes: number,
  vramBytes: number | null,
): VramFit => {
  if (vramBytes == null) {
    return 'unknown';
  }
  const marginGb = (vramBytes - sizeBytes) / 1024 ** 3;
  if (marginGb < 0) {
    return 'exceeds';
  }
  if (marginGb <= 2) {
    return 'close';
  }
  return 'fits';
};

const fitClasses = (fit: VramFit): string => {
  switch (fit) {
    case 'fits':
      return 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300';
    case 'close':
      return 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300';
    case 'exceeds':
      return 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
};

interface QuantGroup {
  key: string;
  qbit: number | string | null;
  items: WeightedModel[];
}

const groupQuantized = (items: WeightedModel[] | undefined): QuantGroup[] => {
  if (!items) {
    return [];
  }
  const map = new Map<string, WeightedModel[]>();
  const order: string[] = [];
  for (const item of items) {
    if (!item?.weightFile) {
      continue;
    }
    const key = qbitKey(item.weightFile.qbit);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const list = map.get(key) ?? [];
    return {
      key,
      qbit: list[0]?.weightFile.qbit ?? null,
      items: list
        .slice()
        .sort((a, b) => sizeToBytes(a.weightFile.size) - sizeToBytes(b.weightFile.size)),
    };
  });
};

// 量化信息 = 权重文件名去掉扩展名后，去掉模型名前缀的剩余部分。
// 例如模型名 Muse-Glimmer-30B，文件 Muse-Glimmer-30B-UD-IQ2_XXS.gguf → UD-IQ2_XXS。
const quantLabel = (
  fileName: string,
  modelName: string,
  qbit: number | string | null,
): string => {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const lowerBase = base.toLowerCase();
  const lowerModel = modelName.toLowerCase();
  if (lowerBase.startsWith(lowerModel)) {
    const rest = base.slice(lowerModel.length).replace(/^[-_.\s]+/, '');
    if (rest) {
      return rest;
    }
  }
  return qbitKey(qbit);
};

export function ModelsPage({
  models,
  systemInfo,
}: {
  models: ModelsCatalog;
  systemInfo: SystemInfo | null;
}) {
  const [activeTab, setActiveTab] = useState('local');
  const [download, setDownload] = useState<DownloadState>({
    phase: 'idle',
    error: null,
    message: null,
    items: [],
    launcherVersion: null,
    progress: {},
  });
  const [localModels, setLocalModels] = useState<LocalDownloadRecord[]>([]);
  const [localScanning, setLocalScanning] = useState(false);
  const [runRecord, setRunRecord] = useState<LocalDownloadRecord | null>(null);
  const [runBackgrounded, setRunBackgrounded] = useState(false);
  const [runSession, setRunSession] = useState<RunSession | null>(null);
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const speedRef = useRef<Record<string, { received: number; time: number }>>({});
  const cancelRequestedRef = useRef(false);
  const [backgrounded, setBackgrounded] = useState(false);
  const vramBytes =
    systemInfo && systemInfo.gpuVram > 0
      ? systemInfo.gpuVram * 1024 * 1024
      : null;

  useEffect(() => {
    window.api.readLocalModels().then((records) => {
      setLocalModels(records);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((payload) => {
      setDownload((prev) => ({
        ...prev,
        progress: { ...prev.progress, [payload.fileName]: payload },
      }));
      const prevPoint = speedRef.current[payload.fileName];
      const now = Date.now();
      if (
        prevPoint &&
        now - prevPoint.time >= 200 &&
        payload.received >= prevPoint.received
      ) {
        const dt = (now - prevPoint.time) / 1000;
        if (dt > 0) {
          const speed = (payload.received - prevPoint.received) / dt;
          setSpeeds((prevSpeeds) => ({
            ...prevSpeeds,
            [payload.fileName]: speed,
          }));
        }
      }
      speedRef.current[payload.fileName] = {
        received: payload.received,
        time: now,
      };
    });
    return unsubscribe;
  }, []);

  const handleDownloadClick = async (
    model: Model,
    weightFile: WeightFile,
  ) => {
    cancelRequestedRef.current = false;
    setBackgrounded(false);
    setDownload({
      phase: 'preparing',
      error: null,
      message: null,
      items: [],
      launcherVersion: null,
      progress: {},
    });
    try {
      const result = await window.api.prepareDownload({ model, weightFile });
      if (result.items.length === 0) {
        setDownload({
          phase: 'done',
          error: null,
          message: '所有文件已就绪，无需下载',
          items: [],
          launcherVersion: result.launcherVersion,
          progress: {},
        });
        return;
      }
      setDownload({
        phase: 'confirm',
        error: null,
        message: null,
        items: result.items,
        launcherVersion: result.launcherVersion,
        progress: {},
      });
    } catch (err) {
      setDownload({
        phase: 'error',
        error: formatErrorMessage(err, '准备下载失败'),
        message: null,
        items: [],
        launcherVersion: null,
        progress: {},
      });
    }
  };

  const handleCancelDownload = async () => {
    if (download.phase === 'downloading') {
      cancelRequestedRef.current = true;
      try {
        await window.api.cancelDownload();
      } catch {
        // 忽略取消请求本身的错误
      }
    }
    setBackgrounded(false);
    setDownload({
      phase: 'idle',
      error: null,
      message: null,
      items: [],
      launcherVersion: null,
      progress: {},
    });
  };

  const handleConfirmDownload = async () => {
    cancelRequestedRef.current = false;
    setDownload((prev) => ({ ...prev, phase: 'downloading', progress: {} }));
    try {
      await window.api.startDownload(download.items);
      setDownload((prev) => ({ ...prev, phase: 'done', message: '下载完成' }));
      window.api.readLocalModels().then(setLocalModels);
    } catch (err) {
      if (cancelRequestedRef.current) {
        return;
      }
      setDownload((prev) => ({
        ...prev,
        phase: 'error',
        error: formatErrorMessage(err, '下载失败'),
      }));
    }
  };

  const handleOpenRun = (record: LocalDownloadRecord) => {
    setRunRecord(record);
    setRunBackgrounded(false);
    setRunSession(null);
  };

  const handleRefresh = async () => {
    if (activeTab !== 'local') {
      models.refresh();
      return;
    }
    setLocalScanning(true);
    try {
      const records = await window.api.scanLocalModels();
      setLocalModels(records);
    } catch {
      setLocalModels([]);
    } finally {
      setLocalScanning(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-center gap-2">
          <TabsList className="flex w-fit">
            {tabs.map((tab) => (
              <Tooltip key={tab.value}>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value={tab.value}
                    className={cn(
                      'gap-1.5',
                      activeTab === tab.value && 'font-medium shadow-sm',
                    )}
                    style={
                      activeTab === tab.value
                        ? {
                            backgroundColor: 'var(--primary)',
                            color: 'var(--primary-foreground)',
                          }
                        : undefined
                    }
                  >
                    <tab.icon />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>{tab.description}</TooltipContent>
              </Tooltip>
            ))}
          </TabsList>
          <Button
            variant="outline"
            size="icon"
            title={activeTab === 'local' ? '扫描本地模型' : '刷新'}
            onClick={handleRefresh}
            className={cn(
              'w-6 h-6',
              (models.loading || localScanning) ? 'animate-spin' : '',
            )}
          >
            <RefreshCw
              className={models.loading || localScanning ? 'animate-spin' : ''}
            />
          </Button>
        </div>

        <TabsContent value="local">
          <LocalModels records={localModels} onRun={handleOpenRun} />
        </TabsContent>

        <TabsContent value="optional" className="mt-4">
          <OptionalModels
            models={models}
            vramBytes={vramBytes}
            localRecords={localModels}
            onDownloadClick={handleDownloadClick}
          />
        </TabsContent>

        <TabsContent value="remote">
          <p className="py-8 text-center text-sm text-muted-foreground">
            云端模型开发中…
          </p>
        </TabsContent>
      </Tabs>

      <DownloadDialog
        download={download}
        speeds={speeds}
        backgrounded={backgrounded}
        onCancel={handleCancelDownload}
        onConfirm={handleConfirmDownload}
        onBackground={() => setBackgrounded(true)}
      />

      {backgrounded && (
        <DownloadProgressBar
          download={download}
          speeds={speeds}
          onExpand={() => setBackgrounded(false)}
          onCancel={handleCancelDownload}
        />
      )}

      <RunDialog
        record={runRecord}
        backgrounded={runBackgrounded}
        onBackground={() => setRunBackgrounded(true)}
        onClose={() => {
          setRunRecord(null);
          setRunBackgrounded(false);
        }}
        onSessionChange={setRunSession}
      />

      {runBackgrounded && runSession && (
        <RunStatusBar
          session={runSession}
          onExpand={() => setRunBackgrounded(false)}
          onStop={async () => {
            try {
              await window.api.stopModel(runSession.pid);
            } catch {
              // 忽略停止请求本身的错误
            }
          }}
          onDismiss={() => {
            setRunSession(null);
            setRunRecord(null);
            setRunBackgrounded(false);
          }}
        />
      )}
    </div>
  );
}

function LocalModels({
  records,
  onRun,
}: {
  records: LocalDownloadRecord[];
  onRun: (record: LocalDownloadRecord) => void;
}) {
  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        暂无本地模型，去“可选模型”下载后会自动出现在这里
      </p>
    );
  }

  const groups = groupLocalModels(records);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div
          key={group.modelId}
          className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium">{group.modelName}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                启动器：{group.launcherName}
                {group.launcherVersionName &&
                  `（版本 ${group.launcherVersionName}）`}
                {group.launcherPath && ` · 路径：${group.launcherPath}`}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {group.modelType === undefined
                ? '未知类型'
                : typeLabel(group.modelType)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {group.records.map((record) => (
              <div
                key={`${record.modelId}-${record.weightId}`}
                className="flex flex-col gap-1 rounded border border-border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="min-w-0 truncate text-xs font-medium"
                    title={record.weightName}
                  >
                    {record.weightName}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {record.files.map((file) => (
                    <li
                      key={`${file.path}-${file.name}`}
                      className="truncate text-[11px] text-muted-foreground"
                      title={file.path}
                    >
                      {file.name}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onRun(record)}
                  >
                    运行
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface LocalModelGroup {
  modelId: number;
  modelName: string;
  launcherName: string;
  launcherVersionName: string;
  latestDownloadedAt: string;
  modelType?: number;
  launcherPath?: string;
  records: LocalDownloadRecord[];
}

const groupLocalModels = (records: LocalDownloadRecord[]): LocalModelGroup[] => {
  const map = new Map<number, LocalModelGroup>();
  for (const record of records) {
    let group = map.get(record.modelId);
    if (!group) {
      group = {
        modelId: record.modelId,
        modelName: record.modelName,
        launcherName: record.launcherName,
        launcherVersionName: record.launcherVersionName,
        latestDownloadedAt: record.downloadedAt,
        modelType: record.modelType,
        launcherPath: record.launcherPath,
        records: [],
      };
      map.set(record.modelId, group);
    }
    group.records.push(record);
    if (record.launcherName) {
      group.launcherName = record.launcherName;
    }
    if (record.launcherVersionName) {
      group.launcherVersionName = record.launcherVersionName;
    }
    if (record.downloadedAt > group.latestDownloadedAt) {
      group.latestDownloadedAt = record.downloadedAt;
    }
  }
  return Array.from(map.values());
};

function OptionalModels({
  models,
  vramBytes,
  localRecords,
  onDownloadClick,
}: {
  models: ModelsCatalog;
  vramBytes: number | null;
  localRecords: LocalDownloadRecord[];
  onDownloadClick: (model: Model, weightFile: WeightFile) => void;
}) {
  const currentPage = models.result?.page ?? 1;
  const totalPages = models.result?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="按名称过滤"
          value={models.name}
          onChange={(event) => models.setName(event.target.value)}
          className="w-56"
        />
        <select
          value={models.type === undefined ? '' : String(models.type)}
          onChange={(event) =>
            models.setType(
              event.target.value === '' ? undefined : Number(event.target.value),
            )
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">全部类型</option>
          {MODEL_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {models.error && (
        <p className="text-sm text-destructive">{models.error}</p>
      )}

      {models.loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          正在刷新…
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-3',
          models.loading && 'opacity-60',
        )}
      >
        {models.result?.list.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            vramBytes={vramBytes}
            localRecords={localRecords}
            onDownloadClick={onDownloadClick}
          />
        ))}
        {!models.loading && models.result && models.result.list.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            没有找到相关模型
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1 || models.loading}
          onClick={() => models.goToPage(currentPage - 1)}
        >
          上一页
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          第 {currentPage} / {totalPages} 页 · 共 {models.result?.total ?? 0} 条
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages || models.loading}
          onClick={() => models.goToPage(currentPage + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function ModelCard({
  model,
  vramBytes,
  localRecords,
  onDownloadClick,
}: {
  model: Model;
  vramBytes: number | null;
  localRecords: LocalDownloadRecord[];
  onDownloadClick: (model: Model, weightFile: WeightFile) => void;
}) {
  const groups = groupQuantized(model.quantizedModels);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const group of groups) {
      const minSize = Math.min(
        ...group.items.map((item) => sizeToBytes(item.weightFile.size)),
      );
      const fits = vramBytes != null && minSize <= vramBytes;
      init[group.key] = vramBytes == null || fits;
    }
    return init;
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const metaParts = [
    typeLabel(model.type),
    model.parameter && `参数：${model.parameter}`,
    model.contextWindows && `上下文：${model.contextWindows}`,
  ].filter(Boolean) as string[];

  const relationParts = [
    model.creator?.name && `创作者：${model.creator.name}`,
    model.qor?.name && `Qor：${model.qor.name}`,
    model.launcher?.name && `启动器：${model.launcher.name}`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{model.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {metaParts.join(' · ')}
          </p>
        </div>
        {isTrue(model.hasDraft) ||
        isTrue(model.hasMmproj) ||
        isTrue(model.hasDiffusion) ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {isTrue(model.hasDraft) && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Draft
              </span>
            )}
            {isTrue(model.hasMmproj) && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                MMProj
              </span>
            )}
            {isTrue(model.hasDiffusion) && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Diffusion
              </span>
            )}
          </div>
        ) : null}
      </div>

      {relationParts.length > 0 && (
        <p className="-mt-2.25 text-xs text-muted-foreground">
          {relationParts.join(' · ')}
        </p>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const isOpen = openGroups[group.key];
            const minSize = Math.min(
              ...group.items.map((item) => sizeToBytes(item.weightFile.size)),
            );
            const fits = vramBytes != null && minSize <= vramBytes;
            return (
              <div key={group.key} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 transition-transform',
                      isOpen && 'rotate-90',
                    )}
                  />
                  <span>
                    {group.qbit != null ? `Q${group.qbit}` : '原始'}
                  </span>
                  {!fits && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-500">
                      显存不足
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 pl-5">
                    {group.items.map((item) => {
                      const isLocal = localRecords.some(
                        (record) =>
                          record.modelId === model.id &&
                          (record.weightId === item.weightFile.id ||
                            record.weightName === item.weightFile.name),
                      );
                      return (
                        <div
                          key={item.weightFile.id}
                          className="relative"
                        >
                          <button
                            type="button"
                            title={`${item.weightFile.name} · ${formatGb(item.weightFile.size)} · 点击下载`}
                            onClick={() => onDownloadClick(model, item.weightFile)}
                            className={cn(
                              'rounded-md border px-2 py-1 text-xs transition-transform hover:scale-105',
                              fitClasses(
                                vramFit(
                                  sizeToBytes(item.weightFile.size),
                                  vramBytes,
                                ),
                              ),
                            )}
                          >
                            {quantLabel(
                              item.weightFile.name,
                              model.name,
                              item.weightFile.qbit,
                            )}
                          </button>
                          {isLocal && (
                            <span
                              className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white"
                              title="已下载"
                            >
                              <Check className="size-3" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}