import { useState } from 'react';
import {
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
import type { Model, SystemInfo, WeightedModel } from '@/ipc';
import type { ModelsCatalog } from '@/lib/models-store';
import { cn } from '@/lib/utils';

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
  const vramBytes =
    systemInfo && systemInfo.gpuVram > 0
      ? systemInfo.gpuVram * 1024 * 1024
      : null;

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
            title="刷新"
            onClick={models.refresh}
            className={cn('w-6 h-6', models.loading ? 'animate-spin' : '')}
          >
            <RefreshCw className={models.loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        <TabsContent value="local">
          <p className="py-8 text-center text-sm text-muted-foreground">
            本地模型开发中…
          </p>
        </TabsContent>

        <TabsContent value="optional" className="mt-4">
          <OptionalModels models={models} vramBytes={vramBytes} />
        </TabsContent>

        <TabsContent value="remote">
          <p className="py-8 text-center text-sm text-muted-foreground">
            云端模型开发中…
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OptionalModels({
  models,
  vramBytes,
}: {
  models: ModelsCatalog;
  vramBytes: number | null;
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
          <ModelCard key={model.id} model={model} vramBytes={vramBytes} />
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
}: {
  model: Model;
  vramBytes: number | null;
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
        <p className="text-xs text-muted-foreground">
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
                    {group.items.map((item) => (
                      <span
                        key={item.weightFile.id}
                        title={`${item.weightFile.name} · ${formatGb(item.weightFile.size)}`}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs',
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
                      </span>
                    ))}
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