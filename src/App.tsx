import React, { useEffect, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AppSidebar, type Page } from '@/components/app-sidebar';
import { HomeView } from '@/components/home-view';
import { ModelsPage } from '@/components/models-page';
import { SettingsPage } from '@/components/settings-page';
import { getModelFolder } from '@/lib/settings-store';
import { useAuth } from '@/lib/auth-store';
import { useModelsCatalog } from '@/lib/models-store';
import type { SystemInfo } from '@/ipc';

const pageTitles: Record<Page, string> = {
  home: 'Hello Electron + React!',
  models: '模型',
  agents: 'Agent',
  settings: '设置',
};

const App: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [activePage, setActivePage] = useState<Page>('home');
  const [refreshing, setRefreshing] = useState(false);
  const { user, loading: authLoading, login, register, logout } = useAuth();
  const models = useModelsCatalog();

  const loadSystemInfo = async (force = false) => {
    if (force) {
      setRefreshing(true);
    }
    try {
      const info = await window.api.getSystemInfo(force);
      setSystemInfo(info);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSystemInfo();
  }, []);

  useEffect(() => {
    getModelFolder().then((folder) => {
      if (!folder) {
        setActivePage('settings');
      }
    });
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar
        systemInfo={systemInfo}
        user={user}
        authLoading={authLoading}
        activePage={activePage}
        onNavigate={setActivePage}
        refreshing={refreshing}
        onRefreshSystemInfo={() => loadSystemInfo(true)}
        onLogin={login}
        onRegister={register}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">{pageTitles[activePage]}</h1>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
          {activePage === 'settings' ? (
            <SettingsPage user={user} onLogout={logout} />
          ) : activePage === 'models' ? (
            <ModelsPage models={models} systemInfo={systemInfo} />
          ) : activePage === 'agents' ? (
            <p className="text-sm text-muted-foreground">Agent 页面开发中…</p>
          ) : (
            <HomeView
              systemInfo={systemInfo}
              onRefreshSystemInfo={() => loadSystemInfo(true)}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default App;