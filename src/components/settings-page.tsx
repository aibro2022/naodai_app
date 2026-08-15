import { useState } from 'react';
import { FolderOpen, Info, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useModelFolder, validateModelFolder } from '@/lib/settings-store';

export function SettingsPage() {
  const { folder, setFolder } = useModelFolder();
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}