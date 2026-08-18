import { useState } from 'react';
import {
  Bot,
  Boxes,
  Cpu,
  Layers,
  LogIn,
  MemoryStick,
  Gpu,
  RefreshCw,
  Settings,
  Sparkles,
  ToolCase,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Account, RegisterPayload, SystemInfo } from '@/ipc';
import { cn, formatErrorMessage } from '@/lib/utils';
import { UserAvatar } from '@/components/user-avatar';

export type Page = 'home' | 'models' | 'agents' | 'settings';

interface AppSidebarProps {
  systemInfo: SystemInfo | null;
  user: Account | null;
  authLoading: boolean;
  activePage: Page;
  refreshing: boolean;
  onNavigate: (page: Page) => void;
  onRefreshSystemInfo: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (payload: RegisterPayload) => Promise<void>;
}

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

const formatVram = (mb: number) => {
  const gb = mb / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

function LoginMenu({
  onLogin,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
      setOpen(false);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(formatErrorMessage(err, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip="登录" className="flex-1">
          <LogIn />
          <span>登录</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="w-64">
        <DropdownMenuLabel>登录</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form
          className="flex flex-col gap-2 px-2 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            placeholder="用户名"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RegisterMenu({
  onRegister,
}: {
  onRegister: (payload: RegisterPayload) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUsername('');
    setPassword('');
    setNickname('');
    setEmail('');
    setError(null);
    setSuccess(null);
  };

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await onRegister({
        username: username.trim(),
        password,
        nickname: nickname.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSuccess('注册成功，请登录');
    } catch (err) {
      setError(formatErrorMessage(err, '注册失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip="注册" className="flex-1">
          <UserPlus />
          <span>注册</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" className="w-64">
        <DropdownMenuLabel>注册</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form
          className="flex flex-col gap-2 px-2 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            placeholder="用户名"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            placeholder="昵称（可选）"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <Input
            type="email"
            placeholder="邮箱（可选）"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? '注册中…' : '注册'}
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  systemInfo,
  user,
  authLoading,
  activePage,
  refreshing,
  onNavigate,
  onRefreshSystemInfo,
  onLogin,
  onRegister,
}: AppSidebarProps) {
  const features = [
    { page: 'models' as const, title: '模型', icon: Bot },
    { page: 'agents' as const, title: 'Agent', icon: Sparkles },
    { page: 'settings' as const, title: '设置', icon: Settings },
  ];

  const infoItems = [
    {
      label: 'CPU',
      icon: Cpu,
      value: systemInfo
        ? `${systemInfo.cpuModel} (${systemInfo.cpuCores} cores) x${systemInfo.processors}`
        : '…',
    },
    {
      label: '内存',
      icon: MemoryStick,
      value: systemInfo ? formatBytes(systemInfo.memoryTotal) : '…',
    },
    {
      label: 'GPU',
      icon: Gpu,
      value: systemInfo
        ? systemInfo.gpus.length > 0
          ? systemInfo.gpus
              .map(
                (gpu) =>
                  `${gpu.model}${gpu.vram != null ? ` ${formatVram(gpu.vram)}` : ''} x${systemInfo.gpus.length}`,
              )
              .join(' / ')
          : 'no GPU detected'
        : '…',
    },
    {
      label: '显存',
      icon: MemoryStick,
      value: systemInfo ? formatVram(systemInfo.gpuVram) : '…',
    },
    {
      label: 'CUDA^',
      icon: ToolCase,
      value: systemInfo ? systemInfo.cudaVersion : '…',
    },
    {
      label: '架构',
      icon: Layers,
      value: systemInfo ? systemInfo.osArch : '…',
    },
    {
      label: '平台',
      icon: Boxes,
      value: systemInfo ? systemInfo.platform : '…',
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="naodai"
              isActive={activePage === 'home'}
              onClick={() => onNavigate('home')}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot />
              </div>
              <span className="text-base font-semibold">脑袋</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup>
          <SidebarGroupLabel>功能</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {features.map((feature) => (
                <SidebarMenuItem key={feature.page}>
                  <SidebarMenuButton
                    tooltip={feature.title}
                    isActive={activePage === feature.page}
                    onClick={() => onNavigate(feature.page)}
                  >
                    <feature.icon />
                    <span>{feature.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

<SidebarGroup>
          <SidebarGroupLabel>信息</SidebarGroupLabel>
          <SidebarGroupAction
            title={refreshing ? '刷新中…' : '刷新系统信息'}
            disabled={refreshing}
            onClick={onRefreshSystemInfo}
            className="disabled:opacity-40"
          >
            <RefreshCw className={refreshing ? 'animate-spin !size-3 shrink-0' : '!size-3 shrink-0'} />
            <span className="sr-only">刷新系统信息</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {infoItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="h-auto py-2"
                        disabled={refreshing}
                      >
                        <item.icon
                          className={cn(
                            'size-4 shrink-0',
                            refreshing && 'text-muted-foreground',
                          )}
                        />
                        <span className="w-16 shrink-0 text-xs text-sidebar-foreground/70">
                          {item.label}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-left text-xs text-muted-foreground',
                            refreshing && 'opacity-50',
                          )}
                        >
                          {refreshing ? '刷新中…' : item.value}
                        </span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                      {refreshing ? '刷新中…' : `${item.label}: ${item.value}`}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {user ? (
              <SidebarMenuButton size="lg" tooltip={user.username}>
                <UserAvatar username={user.username} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user.nickname ?? user.username}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email ?? user.username}
                  </span>
                </div>
              </SidebarMenuButton>
            ) : authLoading ? (
              <SidebarMenuButton disabled tooltip="登录">
                <LogIn />
                <span>登录</span>
              </SidebarMenuButton>
            ) : (
              <div className="flex w-full">
                <LoginMenu onLogin={onLogin} />
                <RegisterMenu onRegister={onRegister} />
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
