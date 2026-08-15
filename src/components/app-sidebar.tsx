import {
  Bot,
  Boxes,
  Cpu,
  Layers,
  LogIn,
  LogOut,
  MemoryStick,
  Gpu,
  Settings,
  Sparkles,
  ToolCase,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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
import type { SystemInfo } from '@/ipc';

export interface User {
  name: string;
  email: string;
}

export type Page = 'home' | 'models' | 'agents' | 'settings';

interface AppSidebarProps {
  systemInfo: SystemInfo | null;
  user: User | null;
  activePage: Page;
  onNavigate: (page: Page) => void;
  onLogin: () => void;
  onLogout: () => void;
}

const formatBytes = (bytes: number) => {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

const formatVram = (mb: number) => {
  const gb = mb / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

export function AppSidebar({
  systemInfo,
  user,
  activePage,
  onNavigate,
  onLogin,
  onLogout,
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
        ? `${systemInfo.cpuModel} (${systemInfo.cpuCores} cores)`
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
                  `${gpu.model}${gpu.vram != null ? ` ${formatVram(gpu.vram)}` : ''}`,
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
      label: 'Cuda^',
      icon: ToolCase,
      value: systemInfo ? systemInfo.cudaVersion : '',
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
            <SidebarMenuButton size="lg" tooltip="naodai">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot />
              </div>
              <span className="text-base font-semibold">naodai</span>
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
          <SidebarGroupContent>
            <SidebarMenu>
              {infoItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton className="h-auto py-2">
                        <item.icon className="size-4 shrink-0" />
                        <span className="w-16 shrink-0 text-xs text-sidebar-foreground/70">
                          {item.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">
                          {item.value}
                        </span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      {item.label}: {item.value}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={user.name}>
                    <Avatar className="size-6 rounded-lg">
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="center"
                  className="w-56"
                >
                  <DropdownMenuLabel className="truncate">
                    {user.name} · {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut />
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton tooltip="登录" onClick={onLogin}>
                <LogIn />
                <span>登录</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
