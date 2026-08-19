import { Loader2, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import type {
  DownloadItem,
  DownloadProgressPayload,
  LauncherVersion,
} from '@/ipc';
import { cn } from '@/lib/utils';

export type DownloadPhase =
  | 'idle'
  | 'preparing'
  | 'confirm'
  | 'downloading'
  | 'done'
  | 'error';

export interface DownloadState {
  phase: DownloadPhase;
  error: string | null;
  message: string | null;
  items: DownloadItem[];
  launcherVersion: LauncherVersion | null;
  progress: Record<string, DownloadProgressPayload>;
}

interface DownloadDialogProps {
  download: DownloadState;
  speeds: Record<string, number>;
  backgrounded: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onBackground: () => void;
}

export const formatSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

export const formatSpeed = (bytesPerSecond: number): string =>
  `${formatSize(bytesPerSecond)}/s`;

function DownloadList({
  items,
  progress,
  speeds,
}: {
  items: DownloadItem[];
  progress: Record<string, DownloadProgressPayload>;
  speeds: Record<string, number>;
}) {
  return (
    <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
      {items.map((item) => {
        const current = progress[item.fileName];
        const percent = current?.percent ?? 0;
        const error = current?.error;
        const total = current?.total ?? 0;
        const speed = current && !current.done ? (speeds[item.fileName] ?? 0) : 0;
        return (
          <li
            key={item.url}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate" title={item.fileName}>
                {item.fileName}
              </span>
              {error ? (
                <span className="shrink-0 text-destructive">失败</span>
              ) : current && !current.done ? (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {percent}%
                </span>
              ) : current?.done ? (
                <span className="shrink-0 text-emerald-600 dark:text-emerald-500">
                  完成
                </span>
              ) : null}
            </div>
            {!error && (
              <>
                {total > 0 && (
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{formatSize(total)}</span>
                    {speed > 0 && (
                      <span className="tabular-nums">
                        {formatSpeed(speed)}
                      </span>
                    )}
                  </div>
                )}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DownloadDialog({
  download,
  speeds,
  backgrounded,
  onCancel,
  onConfirm,
  onBackground,
}: DownloadDialogProps) {
  const { phase, error, message, items, launcherVersion, progress } = download;
  if (phase === 'idle' || backgrounded) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-medium">下载确认</h2>

        {phase === 'preparing' && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在检查本地文件…
          </p>
        )}

        {phase === 'confirm' && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              以下 {items.length} 个文件需要下载
              {launcherVersion
                ? `（启动器版本：${launcherVersion.name}）`
                : ''}
              ：
            </p>
            <DownloadList items={items} progress={progress} speeds={speeds} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                取消
              </Button>
              <Button onClick={onConfirm}>确认下载</Button>
            </div>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">正在下载…</p>
            <DownloadList items={items} progress={progress} speeds={speeds} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                取消下载
              </Button>
              <Button variant="outline" onClick={onBackground}>
                后台下载
              </Button>
            </div>
          </>
        )}

        {(phase === 'done' || phase === 'error') && (
          <>
            <p
              className={cn(
                'mt-3 text-sm',
                phase === 'error'
                  ? 'text-destructive'
                  : 'text-foreground',
              )}
            >
              {phase === 'error' ? error : (message ?? '操作完成')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                关闭
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DownloadProgressBar({
  download,
  speeds,
  onExpand,
  onCancel,
}: {
  download: DownloadState;
  speeds: Record<string, number>;
  onExpand: () => void;
  onCancel: () => void;
}) {
  const { phase, items, progress } = download;
  const { state, isMobile } = useSidebar();
  if (phase === 'idle') {
    return null;
  }
  const barLeft = isMobile
    ? 0
    : state === 'collapsed'
      ? 'var(--sidebar-width-icon)'
      : 'var(--sidebar-width)';

  const total = items.reduce(
    (sum, item) => sum + (progress[item.fileName]?.total ?? 0),
    0,
  );
  const received = items.reduce(
    (sum, item) => sum + (progress[item.fileName]?.received ?? 0),
    0,
  );
  const percent = total > 0 ? Math.round((received / total) * 100) : 0;
  const doneCount = items.filter((item) => progress[item.fileName]?.done).length;
  const current =
    items.find((item) => !progress[item.fileName]?.done) ?? items[items.length - 1];
  const speed =
    current && !progress[current.fileName]?.done
      ? (speeds[current.fileName] ?? 0)
      : 0;

  const text =
    phase === 'done'
      ? '下载完成'
      : phase === 'error'
        ? `下载失败：${download.error ?? '未知错误'}`
        : `正在下载 ${current?.fileName ?? ''}（${doneCount}/${items.length}）`;

  return (
    <div
      className="fixed bottom-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-1.5 backdrop-blur"
      style={{ left: barLeft }}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {text}
        </span>
        <div className="h-1.5 w-44 shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {percent}%
        </span>
        {speed > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatSpeed(speed)}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="恢复下载窗口"
          onClick={onExpand}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="取消下载"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}