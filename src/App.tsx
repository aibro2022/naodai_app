import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AppInfo, PushPayload } from '@/ipc';

const App: React.FC = () => {
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold">Hello Electron + React!</h1>
        <p className="text-muted-foreground">
          Powered by Electron Forge, Vite, React, Tailwind CSS and shadcn/ui
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Button onClick={handlePing}>Ping Main</Button>
          <Button variant="secondary" onClick={handleGetInfo}>
            Get App Info
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
    </div>
  );
};

export default App;