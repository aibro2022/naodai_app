import { useState } from 'react';
import { FolderOpen, Info, LogOut, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  CONTEXT_SIZE_VALUES,
  formatContextSize,
  useContextSize,
  useModelFolder,
  validateModelFolder,
} from '@/lib/settings-store';
import { UserAvatar } from '@/components/user-avatar';
import type { Account } from '@/ipc';

interface SettingsPageProps {
  user: Account | null;
  onLogout: () => void;
}

export function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const { folder, setFolder } = useModelFolder();
  const { value: contextSize, setValue: setContextSize } = useContextSize();
  const [error, setError] = useState<string | null>(null);

  const contextIndex = CONTEXT_SIZE_VALUES.indexOf(contextSize);

  const applyValue = (value: string) => {
    setFolder(value);
    setError(validateModelFolder(value));
  };

  const handlePick = async () => {
    const selected = await window.api.selectFolder();
    if (selected) {
      applyValue(selected);
    }
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="model-folder"
          className="text-sm font-medium leading-none select-none"
        >
          程序与模型文件夹
        </label>
        <div className="flex gap-2">
          <Input
            id="model-folder"
            className="min-w-0 flex-1"
            placeholder="选择或输入存放程序与模型文件夹路径"
            value={folder}
            onChange={(event) => applyValue(event.target.value)}
          />
          <Button variant="outline" onClick={handlePick} className="shrink-0">
            <FolderOpen />
            浏览
          </Button>
        </div>
        {error ? (
          <p className="flex items-start gap-1.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : (
          folder && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              已选择：{folder}
            </p>
          )
        )}
        <p className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-500">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          提示：模型文件体积较大，请确保该文件夹所在磁盘至少预留几十 GB 的可用空间。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="context-size"
            className="text-sm font-medium leading-none select-none"
          >
            上下文窗口大小
          </label>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatContextSize(contextSize)}
          </span>
        </div>
        <Slider
          id="context-size"
          min={0}
          max={CONTEXT_SIZE_VALUES.length - 1}
          step={1}
          value={[contextIndex]}
          onValueChange={(values) =>
            setContextSize(
              CONTEXT_SIZE_VALUES[values[0] ?? 0] ??
                CONTEXT_SIZE_VALUES[0],
            )
          }
        />
        <div className="flex justify-between px-1 text-[10px] text-muted-foreground tabular-nums">
          {CONTEXT_SIZE_VALUES.map((value) => (
            <span key={value}>{formatContextSize(value)}</span>
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          上下文窗口大小影响模型一次性最多能记住多少文字（提示词 + 历史对话 + AI 输出）。同样也会增加显存/内存的占用。请根据模型的性能和显存大小，选择合适的上下文窗口大小。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="account"
          className="text-sm font-medium leading-none select-none"
        >
          账号
        </label>
        {user ? (
          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex items-center gap-3">
              <UserAvatar username={user.username} className="size-8" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {user.nickname ?? user.username}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email ?? user.username}
                </span>
              </div>
            </div>
            <Button variant="outline" onClick={onLogout}>
              <LogOut />
              登出
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">当前未登录</p>
        )}
      </div>
    </div>
  );
}