import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AppInfo, PushPayload, SystemInfo } from '@/ipc';

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

interface HomeViewProps {
  systemInfo: SystemInfo | null;
  onRefreshSystemInfo: () => void;
}

export function HomeView({ systemInfo, onRefreshSystemInfo }: HomeViewProps) {
  const [pingReply, setPingReply] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [pushes, setPushes] = useState<PushPayload[]>([]);

  useEffect(() => {
    const unsubscribe = window.api.onPush((payload) => {
      setPushes((prev) => [...prev, payload].slice(-5));
    });
    return unsubscribe;
  }, []);

  const handlePing = async () => {
    const reply = await window.api.ping(`hi from renderer @ ${Date.now()}`);
    setPingReply(reply);
  };

  const handleGetInfo = async () => {
    const info = await window.api.getAppInfo();
    setAppInfo(info);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePing}>Ping Main</Button>
        <Button variant="secondary" onClick={handleGetInfo}>
          Get App Info
        </Button>
        <Button variant="outline" onClick={onRefreshSystemInfo}>
          Refresh System Info
        </Button>
      </div>
      {pingReply && (
        <p className="rounded-md border border-border bg-muted px-4 py-2 text-sm">
          Ping reply: {pingReply}
        </p>
      )}
      {appInfo && (
        <pre className="rounded-md border border-border bg-muted p-4 text-xs">
          {JSON.stringify(appInfo, null, 2)}
        </pre>
      )}
      {systemInfo && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted p-4 text-xs">
          <div>
            <span className="font-medium text-muted-foreground">CPU:{' '}</span>
            {systemInfo.cpuModel} ({systemInfo.cpuCores} cores)
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Memory:{' '}</span>
            {formatBytes(systemInfo.memoryTotal)}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">
              GPUs: {systemInfo.gpus.length}
            </span>
          </div>
          <ul className="list-inside list-disc space-y-1">
            {systemInfo.gpus.map((gpu, i) => (
              <li key={`${gpu.model}-${i}`}>
                {gpu.model} —{' '}
                {gpu.vram != null ? formatBytes(gpu.vram * 1024 ** 2) : 'N/A'}
              </li>
            ))}
            {systemInfo.gpus.length === 0 && (
              <li className="text-muted-foreground">no GPU detected</li>
            )}
          </ul>
          <div>
            <span className="font-medium text-muted-foreground">
              GPU Vendor:{' '}
            </span>
            {systemInfo.gpuVendor}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">
              Platform:{' '}
            </span>
            {systemInfo.platform} / {systemInfo.osArch}
          </div>
        </div>
      )}
      <div className="rounded-md border border-border p-4">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          Received from main (IPC push):
        </p>
        <ul className="list-inside list-disc space-y-1 text-xs">
          {pushes.map((push, i) => (
            <li key={`${push.source}-${i}`}>
              [{push.source}] {push.message}
            </li>
          ))}
          {pushes.length === 0 && (
            <li className="text-muted-foreground">waiting for push...</li>
          )}
        </ul>
      </div>
    </div>
  );
}
