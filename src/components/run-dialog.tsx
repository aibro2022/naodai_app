import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Play, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSidebar } from '@/components/ui/sidebar';
import { getContextSizeBytes } from '@/lib/settings-store';
import { formatErrorMessage } from '@/lib/utils';
import type { LocalDownloadRecord, RunModelResult } from '@/ipc';

interface RunDialogProps {
  record: LocalDownloadRecord | null;
  backgrounded: boolean;
  onBackground: () => void;
  onClose: () => void;
  onSessionChange: (session: RunSession) => void;
}

export interface RunSession {
  record: LocalDownloadRecord;
  pid: number;
  running: boolean;
  serverUrl?: string;
}

const contextMax = (record: LocalDownloadRecord | null): number | null => {
  if (!record?.contextWindows) {
    return null;
  }
  const value = Number(record.contextWindows);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const isLlamaCpp = (record: LocalDownloadRecord | null): boolean =>
  !!record?.launcherName?.toLowerCase().includes('llama');

const POLL_INTERVAL = 500;

export function RunDialog({
  record,
  backgrounded,
  onBackground,
  onClose,
  onSessionChange,
}: RunDialogProps) {
  const [mmprojPath, setMmprojPath] = useState('');
  const [draftPath, setDraftPath] = useState('');
  const [context, setContext] = useState<number>(4096);
  const [customParams, setCustomParams] = useState('');
  const [tools, setTools] = useState(false);
  const [result, setResult] = useState<RunModelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [running, setRunning] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const logOffsetRef = useRef(0);
  const logBoxRef = useRef<HTMLPreElement>(null);
  const resultRef = useRef<RunModelResult | null>(null);
  resultRef.current = result;
  const recordRef = useRef<LocalDownloadRecord | null>(null);
  recordRef.current = record;

  useEffect(() => {
    if (!record) {
      return;
    }
    const max = contextMax(record);
    getContextSizeBytes().then((saved) => {
      setContext(max != null ? Math.min(saved, max) : saved);
    });
  }, [record]);

  useEffect(() => {
    const unsubscribe = window.api.onModelExit((pid) => {
      if (resultRef.current?.pid === pid) {
        setRunning(false);
        setStopping(false);
        if (recordRef.current) {
          onSessionChange({
            record: recordRef.current,
            pid,
            running: false,
            serverUrl: serverUrlRef.current ?? undefined,
          });
        }
      }
    });
    return unsubscribe;
  }, [onSessionChange]);

  // 检测到 "listening on http:" 时记录网页地址。
  const serverUrlRef = useRef<string | null>(null);
  serverUrlRef.current = serverUrl;
  useEffect(() => {
    const unsubscribe = window.api.onModelReady((payload) => {
      if (resultRef.current?.pid === payload.pid) {
        setServerUrl(payload.url);
        if (recordRef.current) {
          onSessionChange({
            record: recordRef.current,
            pid: payload.pid,
            running: true,
            serverUrl: payload.url,
          });
        }
      }
    });
    return unsubscribe;
  }, [onSessionChange]);

  // 运行期间定时读取日志追加输出（tail -f）。
  useEffect(() => {
    if (!result || !running) {
      return;
    }
    const interval = setInterval(async () => {
      const chunk = await window.api.readModelLog(result.logPath, logOffsetRef.current);
      if (chunk.content) {
        setLogContent((prev) => prev + chunk.content);
      }
      logOffsetRef.current = chunk.endOffset;
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [result, running]);

  // 进程退出后补读一次，确保尾部输出完整落盘。
  useEffect(() => {
    if (!result || running) {
      return;
    }
    const timer = setTimeout(async () => {
      const chunk = await window.api.readModelLog(result.logPath, logOffsetRef.current);
      if (chunk.content) {
        setLogContent((prev) => prev + chunk.content);
      }
      logOffsetRef.current = chunk.endOffset;
    }, 300);
    return () => clearTimeout(timer);
  }, [result, running]);

  // 自动滚动到底部。
  useEffect(() => {
    const box = logBoxRef.current;
    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [logContent]);

  // 停止失败时兜底：强制结束运行状态。
  useEffect(() => {
    if (!stopping) {
      return;
    }
    const timer = setTimeout(() => {
      setRunning(false);
      setStopping(false);
      if (resultRef.current && recordRef.current) {
        onSessionChange({
          record: recordRef.current,
          pid: resultRef.current.pid,
          running: false,
        });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [stopping, onSessionChange]);

  if (!record || backgrounded) {
    return null;
  }

  const modelPath =
    record.files.find((file) => file.type === 'quantized')?.path ??
    record.files.find((file) => file.name === record.weightName)?.path ??
    '';
  const mmprojFiles = record.files.filter((file) => file.type === 'mmproj');
  const draftFiles = record.files.filter((file) => file.type === 'draft');
  const max = contextMax(record);
  const llama = isLlamaCpp(record);
  const clampContext = (value: number): number => {
    if (max != null && value > max) {
      return max;
    }
    return value;
  };

  const handleLaunch = async () => {
    if (!record) {
      return;
    }
    setError(null);
    setResult(null);
    setLogContent('');
    setServerUrl(null);
    logOffsetRef.current = 0;
    setStarting(true);
    try {
      const outcome = await window.api.runModel({
        launcherPath: record.launcherPath ?? '',
        modelPath,
        mmprojPath: mmprojPath || undefined,
        draftPath: draftPath || undefined,
        context,
        tools,
        customParams: customParams.trim() || undefined,
      });
      setResult(outcome);
      setRunning(true);
      onSessionChange({ record, pid: outcome.pid, running: true });
    } catch (err) {
      setError(formatErrorMessage(err, '启动失败'));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!result) {
      return;
    }
    setStopping(true);
    try {
      await window.api.stopModel(result.pid);
    } catch {
      // 忽略停止请求本身的错误
    }
  };

  const busy = starting || stopping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[32rem] max-h-[85vh] w-[28rem] max-w-[90vw] min-h-[24rem] min-w-[24rem] resize flex-col overflow-auto rounded-lg border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-medium">运行 {record.weightName}</h2>

        {!llama && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-500">
            当前仅支持 llama.cpp 启动器（当前：{record.launcherName || '未知'}）
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {mmprojFiles.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              多模态投影器
              <select
                value={mmprojPath}
                disabled={running}
                onChange={(event) => setMmprojPath(event.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">不使用</option>
                {mmprojFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {draftFiles.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              草稿模型
              <select
                value={draftPath}
                disabled={running}
                onChange={(event) => setDraftPath(event.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">不使用</option>
                {draftFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            上下文大小
            <Input
              type="number"
              min={1}
              max={max ?? undefined}
              disabled={running}
              value={context}
              onChange={(event) =>
                setContext(clampContext(Number(event.target.value)))
              }
            />
            {max != null && (
              <span className="text-[10px]">
                最大不能超过模型上下文：{max}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            自定义参数
            <Input
              value={customParams}
              disabled={running}
              onChange={(event) => setCustomParams(event.target.value)}
              placeholder="例如：--threads 8 --temp 0.7"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={tools}
              disabled={running}
              onChange={(event) => setTools(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            开启Tools
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="mt-3 flex min-h-0 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              日志文件：<span className="break-all">{result.logPath}</span>
            </span>
            <pre
              ref={logBoxRef}
              className="h-36 max-h-[40vh] min-h-24 resize-y overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words"
            >
              {logContent || '等待输出…'}
            </pre>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={running || busy}>
            关闭
          </Button>
          {running ? (
            <>
              {serverUrl && (
                <Button
                  variant="outline"
                  onClick={() => window.api.openModelWeb(result?.pid ?? 0)}
                  title={serverUrl}
                >
                  <ExternalLink className="size-4" />
                  打开网页
                </Button>
              )}
              <Button variant="outline" onClick={onBackground}>
                后台
              </Button>
              <Button variant="outline" onClick={handleStop} disabled={busy}>
                {stopping ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4 fill-current" />
                )}
                停止
              </Button>
            </>
          ) : (
            <Button
              onClick={handleLaunch}
              disabled={!llama || starting || !modelPath}
            >
              {starting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              运行
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RunStatusBar({
  session,
  onExpand,
  onStop,
  onDismiss,
}: {
  session: RunSession | null;
  onExpand: () => void;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const barLeft = isMobile
    ? 0
    : state === 'collapsed'
      ? 'var(--sidebar-width-icon)'
      : 'var(--sidebar-width)';

  if (!session) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-1.5 backdrop-blur"
      style={{ left: barLeft }}
    >
      <div className="flex items-center gap-3">
        {session.running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs text-muted-foreground">已停止</span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {session.record.weightName}
        </span>
        {session.running && session.serverUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title="打开网页"
            onClick={() => window.api.openModelWeb(session.pid)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="恢复运行窗口"
          onClick={onExpand}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        {session.running ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title="停止运行"
            onClick={onStop}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title="关闭"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}