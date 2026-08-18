# naodai（脑袋）项目重写说明

> 本文件是本项目**完整的功能与实现规范**。目标是：仅依据此文件即可从零重写出功能完全一致的项目。

---

## 1. 项目概述

naodai 是一个 Electron 桌面应用（中文名"脑袋"），定位为本地 AI 模型的一站式管理工具。它通过互联网接口（Khala API）获取模型目录等数据，在本地展示、过滤、管理可选模型。

**核心功能：**
- 系统硬件信息采集与展示（CPU/GPU/显存/CUDA/内存）
- 托盘驻留应用（关窗只隐藏，托盘"关闭"才退出）
- 用户账号体系（登录/注册/登出，持久化会话）
- 模型目录分页展示（可选模型 Tab）：名称过滤、类型过滤、刷新、分页
- 量化模型按 qbit 分组、与本地显存对比着色、默认展开/折叠
- 设置：模型文件夹路径、上下文窗口大小

---

## 2. 技术栈与关键依赖

| 类别 | 技术 |
|---|---|
| 框架 | Electron Forge 7 + Vite 5（main/preload/renderer 三端分离构建） |
| 渲染层 | React 19 + TypeScript 5.9 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`）+ shadcn/ui + `tw-animate-css` |
| 图标 | lucide-react |
| 硬件信息 | `systeminformation` |
| UI 原语 | `radix-ui`（由 shadcn 组件封装） |

**npm scripts：**
- `npm start` — 开发运行（Electron + Vite dev server）
- `npm run package` — 打包未安装版（`out/`）
- `npm run make` — 构建分发包
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint（`.ts`/`.tsx`）
- `npx shadcn@latest add <component>` — 添加 shadcn/ui 组件

---

## 3. 目录结构

```
├── forge.config.ts            # Forge 配置（VitePlugin 三端入口、Fuses 安全加固）
├── vite.main.config.ts        # main 构建配置
├── vite.preload.config.ts     # preload 构建配置
├── vite.renderer.config.mts   # renderer 构建配置（必须 .mts，见 Gotcha）
├── components.json            # shadcn 配置
├── tsconfig.json              # 含 @/* → src/* 路径别名
├── index.html
├── doc/
│   ├── config.md              # 空占位
│   └── naodai_config.md       # 配置文件说明文档
└── src/
    ├── main.ts                # 主进程
    ├── preload.ts             # 预加载（contextBridge 暴露 window.api）
    ├── main.tsx               # React 渲染入口
    ├── App.tsx                # 根组件
    ├── index.css              # Tailwind + shadcn 主题 token
    ├── env.d.ts               # 声明 window.api
    ├── ipc.ts                 # IPC 通道名 + 全部类型定义
    ├── config.ts              # 配置文件读写
    ├── api.ts                 # HTTP API 客户端（Khala 接口）
    ├── models-cache.ts        # 模型数据本地缓存
    ├── lib/
    │   ├── utils.ts           # cn() + formatErrorMessage()
    │   ├── settings-store.ts  # 设置相关 hooks
    │   ├── auth-store.ts      # useAuth
    │   └── models-store.ts    # useModelsCatalog
    └── components/
        ├── app-sidebar.tsx    # 侧边栏（含登录/注册/用户信息）
        ├── home-view.tsx      # 首页
        ├── models-page.tsx    # 模型页
        ├── settings-page.tsx  # 设置页
        ├── user-avatar.tsx    # 彩色首字母头像
        ├── error-boundary.tsx # 错误边界
        └── ui/                # shadcn/ui 组件
```

---

## 4. 架构与数据流

三层结构，渲染层**绝不直接访问 Node/网络**，一切通过 IPC：

1. **主进程**（`src/main.ts` + `src/api.ts` + `src/config.ts` + `src/models-cache.ts`）：
   - 窗口/托盘管理、系统信息采集、IPC handler 注册
   - 通过 `fetch` 访问 Khala API（无 CORS 限制）
   - 配置与缓存读写（文件系统）
2. **Preload**（`src/preload.ts`）：`contextBridge.exposeInMainWorld('api', api)`，暴露类型化 `NaodaiApi`
3. **渲染层**：React UI 通过 `window.api.*` 调用（`ipcRenderer.invoke`），主进程通过 `webContents.send` 单向推送

**IPC 错误传递**：主进程 handler 内 `throw new Error(友好中文信息)`，渲染层用 `formatErrorMessage()` 去掉 Electron 加的前缀 `Error invoking remote method '<channel>': ` 后展示。

---

## 5. IPC 协议（src/ipc.ts）

### 5.1 通道名常量 `IpcChannels`

```ts
ping            'ipc:ping'             // 测试：main 返回 `pong: ${message}`
getAppInfo      'ipc:get-app-info'     // 返回 {version, platform, arch, uptime}
getSystemInfo   'ipc:get-system-info'  // 参数 force?: boolean，见 6.3
getMaxCudaVersion 'ipc:get-max-cuda-version'  // ⚠️ 已声明但 main 未注册 handler（遗留）
selectFolder    'ipc:select-folder'    // 打开系统文件夹选择对话框，返回路径或 null
getConfig       'ipc:get-config'       // 读取完整配置
updateConfig    'ipc:update-config'    // 参数 Partial<AppConfig>，合并写回
push            'ipc:push'             // main → renderer 单向推送
authLogin       'ipc:auth-login'       // {username, password} → AuthSession
authLogout      'ipc:auth-logout'
authProfile     'ipc:auth-profile'     // → Account
authRegister    'ipc:auth-register'    // RegisterPayload
modelsPaged     'ipc:models-paged'     // ModelsPagedParams → ModelsPagedResult（并写本地缓存）
modelsCacheRead 'ipc:models-cache-read'// → ModelsPagedResult | null
```

### 5.2 核心类型

```ts
interface AppInfo { version: string; platform: string; arch: string; uptime: number }

interface GpuInfo { vendor: string; model: string; vram: number | null } // vram 单位 MB

interface SystemInfo {
  gpus: GpuInfo[];
  cpuModel: string; cpuCores: number; processors: number;
  memoryTotal: number;            // 单位：字节
  gpuVendor: string; gpuVram: number;  // gpuVram 单位：MB（各 GPU 之和）
  cudaVersion: string; cudaCapability: string;
  osArch: string; platform: string;
}

interface PushPayload { source: string; message: string }

interface Account { id: number; username: string; nickname?: string; email?: string; createdAt?: string }

interface AuthSession { token: string; expiresAt: string; account: Account }

interface RegisterPayload { username: string; password: string; nickname?: string; email?: string }

interface WeightFile {
  id: number; name: string;
  size: string | number;          // ⚠️ 接口返回字符串，单位 GB
  hashType?: string; downloadAddress?: string; fileHash?: string;
  qbit: number | null; isSplit?: boolean; type?: number;
}

interface WeightedModel { id: number; modelId: number; weightFileId: number; weightFile: WeightFile }

interface ModelCreator { id: number; name: string; countryId: number | null }
interface ModelLauncher { id: number; name: string; icon?: string | null }
interface ModelAdmin { id: number; username: string; nickname?: string; email?: string }

interface Model {
  id: number; name: string; type: number;
  parameter?: string; contextWindows?: string;
  hasDraft: boolean; hasMmproj: boolean; hasDiffusion: boolean; // 实际可能为 0/1/字符串
  creatorId?: number; qorId?: number; launcherId?: number; adminId?: number;
  createdAt?: string; updatedAt?: string;
  creator?: ModelCreator | null; qor?: ModelCreator | null;
  launcher?: ModelLauncher | null; admin?: ModelAdmin | null;
  mmprojs?: WeightedModel[]; draftModels?: WeightedModel[];
  diffusionModels?: WeightedModel[]; quantizedModels?: WeightedModel[];
}

interface ModelsPagedParams { page?: number; pageSize?: number; name?: string; type?: number }
interface ModelsPagedResult { list: Model[]; total: number; page: number; pageSize: number; totalPages: number }
```

### 5.3 `NaodaiApi`（window.api 形状）

```ts
interface NaodaiApi {
  ping(message: string): Promise<string>;
  getAppInfo(): Promise<AppInfo>;
  getSystemInfo(force?: boolean): Promise<SystemInfo>;
  getMaxCudaVersion(): Promise<string | null>;   // 未实现，保留
  selectFolder(): Promise<string | null>;
  getConfig(): Promise<AppConfig>;
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  login(username, password): Promise<AuthSession>;
  logout(): Promise<void>;
  getProfile(): Promise<Account>;
  register(payload: RegisterPayload): Promise<void>;
  fetchModelsPaged(params: ModelsPagedParams): Promise<ModelsPagedResult>;
  readModelsCache(): Promise<ModelsPagedResult | null>;
  onPush(listener: (payload: PushPayload) => void): () => void; // 返回取消订阅函数
}
```

---

## 6. 主进程实现细节

### 6.1 窗口与托盘（src/main.ts）

- 全局：`mainWindow`、`tray`、`isQuitting`
- `electron-squirrel-startup` 为 true 时 `app.quit()`（Windows 安装/卸载）
- **创建窗口**：`new BrowserWindow({ width: 800, height: 600, webPreferences: { preload: path.join(__dirname, 'preload.js') } })`
- **关窗行为**：`mainWindow.on('close')` — 若 `!isQuitting` 则 `event.preventDefault()` 并 `hide()`；只有托盘菜单"关闭"项里 `isQuitting = true` 后再 `app.quit()` 才真正退出
- **托盘图标**：运行时生成（`createTrayIcon`）— 32×32 的 BGRA Buffer 画一个橙色圆（R=230,G=90~160,B=60~180,A=245），`nativeImage.createFromBitmap`，无需图片资源
- **托盘菜单**：`打开`（showWindow）、分隔线、`关闭`；点击托盘图标也触发 showWindow
- `showWindow()`：窗口销毁则重建，否则最小化则 `restore()`，再 `show()+focus()`
- **心跳推送**：`did-finish-load` 后每 5 秒向所有窗口 `webContents.send(IpcChannels.push, { source: 'main', message: 'heartbeat at <时间>' })`（注：未清理 interval，属已知问题）
- **DevTools**：`webContents.openDevTools()` 恒开（已知问题）
- `window-all-closed`：非 darwin 退出；`activate`：显示窗口

### 6.2 文件夹选择

`dialog.showOpenDialog(win, { title: '选择模型文件夹', buttonLabel: '选择', properties: ['openDirectory','createDirectory'] })`，取消返回 `null`。

### 6.3 系统信息采集（getSystemInfo）

- `querySystemInfo()`：并行 `systeminformation.graphics()/cpu()/mem()`
- `gpuVram` = 各 GPU `vram`（MB）之和；`gpuVendor` = 第一块 GPU 的 vendor
- `cpuModel` = `manufacturer + brand`（无厂商则纯 brand）
- CUDA：
  - `getMaxCudaVersion()`：执行 `nvidia-smi`，正则 `/CUDA (?:UMD )?Version:\s*(\d+\.\d+)/` 取版本
  - `getCudaCapability()`：`nvidia-smi --query-gpu=compute_cap --format=csv,noheader` 取第一行；`n/a` 返回 null
  - 有 GPU（`gpuVendor` 非空）才查询，失败/无 NVIDIA 返回 `''`
- **缓存**：`getSystemInfo(force=false)` 先读 `readConfig().systemInfo`，有缓存且非 force 直接返回；否则重新采集并 `updateConfig({ systemInfo })` 落盘

---

## 7. 配置存储（src/config.ts + doc/naodai_config.md）

- 路径：`~/.naodai/naodai_config.json`（`app.getPath('home')` 下）
- 首次启动 `ensureConfigFile()` 创建目录与空 `{}`
- `readConfig()` 解析失败返回 `{}`；`updateConfig(patch)` = 合并后整文件覆写（JSON 美化 2 空格）
- `AppConfig` 字段：

```ts
interface AppConfig {
  systemInfo?: SystemInfo;       // 系统信息缓存
  modelFolder?: string;          // 模型文件夹（空串=未设置）
  contextSizeBytes?: number;     // 上下文窗口大小（字节）
  apiBaseUrl?: string;           // API 地址，默认 http://localhost:3000
  auth?: AuthSession;            // 登录会话（token/expiresAt/account）
}
```

---

## 8. API 客户端（src/api.ts）

- 基准地址：`readConfig().apiBaseUrl ?? 'http://localhost:3000'`
- **鉴权**：业务接口使用**用户** token（`readConfig().auth?.token`），**绝不使用 admin 自动登录**
- `request<T>(path, init, token)`：自动加 `Content-Type: application/json` 和 `Authorization: Bearer <token>`；解析响应 JSON；失败时 `parseError` 提取 `{statusCode, message}`（message 为字符串或数组）
- **友好错误映射** `toFriendlyError(err, statusMap, fallback)`：
  - 无 `status`（网络错误/连不上）→ `无法连接服务器，请确认接口服务已启动后重试`
  - 命中 `statusMap[status]` → 用映射文案
  - 否则用服务端 `body.message`（若为字符串）→ 再兜底 `fallback`
- 各接口映射：
  - `authLogin`：401→`用户名或密码错误`，400→`请输入有效的用户名和密码`，兜底`登录失败，请稍后重试`；成功后 `updateConfig({ auth: session })`
  - `authLogout`：请求 `/auth/logout`（带 token），`finally` 中 `updateConfig({ auth: undefined })`（清 token）
  - `authProfile`：401→`登录已失效，请重新登录`；响应可能为 `Account` 或 `{account: Account}`
  - `authRegister`：409→`用户名或邮箱已被注册`，400→`请输入有效的用户名和密码`，兜底`注册失败，请稍后重试`
  - `fetchModelsPaged`：**无 token 时直接抛 `请先登录后再获取模型`**；拼 query `page/pageSize/name/type`；401→`登录已失效，请先登录`，404→`未找到模型数据`，兜底`获取模型列表失败，请稍后重试`

---

## 9. 本地缓存（src/models-cache.ts）

- 路径：`~/.naodai/models_cache.json`
- `writeModelsCache(result)`：每次 `modelsPaged` 成功后写入（`ipc:models-paged` handler 内调用）
- `readModelsCache()`：读取，失败返回 `null`

---

## 10. Khala API 接口文档（数据源）

### 基础信息
- 服务端口 `3000`；默认超级管理员 `admin/admin123`
- 认证：`Authorization: Bearer <token>`
- 账号体系 `/auth` 与管理员 `/admin` 独立

### 账号接口 `/auth`
| 方法 | 路径 | 认证 | 请求体 | 说明 |
|---|---|---|---|---|
| POST | `/auth/register` | 无 | `{username,password,nickname?,email?}` | 冲突返回 409 |
| POST | `/auth/login` | 无 | `{username,password}` | 返回 `{token,expiresAt,account}` |
| POST | `/auth/logout` | Bearer | - | `{success:true}` |
| GET | `/auth/profile` | Bearer | - | 当前账号公开信息 |

### 业务模型 `/models/paged`（GET，Bearer）
| 参数 | 说明 |
|---|---|
| `page` | 页码，默认 1 |
| `pageSize` | 每页条数，默认 10，最大 100 |
| `name` | 名称模糊匹配 |
| `type` | 精确筛选（1=Image-Text-to-Text，2=Image-Text-to-Video） |

返回 `{list,total,page,pageSize,totalPages}`；每条含 `creator`/`qor`/`launcher`/`admin` 完整对象与 `mmprojs`/`draftModels`/`diffusionModels`/`quantizedModels` 数组（内嵌 `weightFile`）。`quantizedModels` 按 `qbit` 升序分组（无 qbit 排最后），组内按 `size` 升序。

**权重文件** `/weight-files`：`{name,size,hashType,downloadAddress,fileHash,qbit,isSplit?,type?}`，`size` 返回**字符串，单位 GB**。

**常见错误码**：400 参数非法、401 未登录、403 无权限删除、404 不存在、409 冲突、500 服务端错误。

（其余 CRUD 表：`/models`、`/mmprojs`、`/draft-models`、`/diffusion-models`、`/quantized-models`、`/creators`、`/qors`、`/countries`、`/launchers`、`/launcher-versions`、`/admin`，本项目暂未使用。）

---

## 11. Preload（src/preload.ts）

用 `contextBridge.exposeInMainWorld('api', api)` 暴露 `NaodaiApi` 全部方法，全部经 `ipcRenderer.invoke`；`onPush` 内部用 `ipcRenderer.on(IpcChannels.push, handler)` 并返回 `removeListener` 的取消函数。

`src/env.d.ts`：`declare global { interface Window { api: NaodaiApi } }`。

---

## 12. 渲染层 UI

### 12.1 入口（src/main.tsx）

```tsx
createRoot(root).render(
  <StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>
);
```

`ErrorBoundary`（class 组件，`getDerivedStateFromError`）捕获渲染异常，显示"页面出错了"+ 错误信息，**避免整页白屏**。

### 12.2 根组件（src/App.tsx）

- 状态：`systemInfo`、`activePage`（`'home'|'models'|'agents'|'settings'`）、`refreshing`、`useAuth()`、`useModelsCatalog()`
- `loadSystemInfo(force=false)`：调用 `window.api.getSystemInfo(force)`；force 时置 `refreshing`
- 挂载时：`loadSystemInfo()`；读 `getModelFolder()`，若为空则跳转到 `settings` 页
- 布局：`SidebarProvider` → `AppSidebar` + `SidebarInset`
  - 顶栏：`SidebarTrigger` + 竖线 `Separator` + 页面标题（home: `Hello Electron + React!`，models: `模型`，agents: `Agent`，settings: `设置`）
  - 内容按 `activePage` 渲染：settings → `SettingsPage`；models → `ModelsPage(models, systemInfo)`；agents → 占位文案"Agent 页面开发中…"；默认 → `HomeView`

### 12.3 侧边栏（src/components/app-sidebar.tsx）

- `<Sidebar collapsible="icon">`，Header 为 logo 按钮（`Bot` 图标 + "脑袋"，点击回 home）
- **功能组**：模型（Bot）、Agent（Sparkles）、设置（Settings）
- **信息组**：CPU（含 cores×processors）、内存、GPU（型号+显存）、显存、CUDA^、架构、平台；右上角刷新按钮（`RefreshCw`，refreshing 时旋转并禁用），信息行显示"刷新中…"
- **Footer**：
  - 已登录：`UserAvatar` + 昵称/邮箱静态按钮（**无登出入口**，登出在设置页）
  - 未登录且 `authLoading`：禁用的"登录"按钮
  - 未登录：并排两个按钮——`LoginMenu`（登录下拉表单）与 `RegisterMenu`（注册下拉表单），各自 `flex-1`
- **LoginMenu**：用户名 + 密码 + 提交，提交中显示"登录中…"，错误用 `formatErrorMessage(err, '登录失败')` 显示；成功后关闭下拉并清空输入
- **RegisterMenu**：用户名/密码/昵称（可选）/邮箱（可选），成功显示绿色"注册成功，请登录"，错误用 `formatErrorMessage(err, '注册失败')`
- 图标：`Bot, Boxes, Cpu, Layers, LogIn, MemoryStick, Gpu, RefreshCw, Settings, Sparkles, ToolCase, UserPlus`

### 12.4 彩色头像（src/components/user-avatar.tsx）

- 纯色底 + 用户名首字母大写
- 颜色由用户名哈希决定：`hash = hash*31 + charCode`，取 9 色调色板 `['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#14b8a6','#3b82f6','#8b5cf6','#ec4899']` 中的 `abs(hash) % 9`
- 默认 `size-6 rounded-lg`，可通过 `className` 覆盖（如设置页用 `size-8`）；文字 `text-xs text-white`

### 12.5 首页（src/components/home-view.tsx）

- 按钮：`Ping Main`（`window.api.ping`，显示回复）、`Get App Info`（JSON 展示）、`Refresh System Info`（`onRefreshSystemInfo`）
- 系统信息展示：CPU、内存（GB）、GPU 数、GPU 列表（vram MB×1024² 转字节格式化）、GPU Vendor、Platform/osArch
- `onPush` 订阅：显示最近 5 条 main 推送（`slice(-5)`）
- `formatBytes`：≥1GB 显示 GB 两位，否则 MB 取整

### 12.6 模型页（src/components/models-page.tsx）

**Tabs**：`本地模型`（HardDrive）/ `可选模型`（CloudDownload）/ `云端模型`（Cloud），受控模式 `value={activeTab}` + `onValueChange`。**当前 Tab 高亮**用内联样式 `{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }`（必须内联，因为 shadcn 内置 `data-[state=active]:bg-background` 特异性更高会覆盖普通类）。标签文字始终显示。

**刷新按钮**：Tabs 右侧 `RefreshCw` 图标按钮，**不因 loading 禁用**（始终可点），loading 时图标 `animate-spin`；点击调 `models.refresh()` 重新请求并更新下方内容。加载中列表上方显示 `Loader2` + "正在刷新…"，列表 `opacity-60`。

**可选模型 Tab 内容（OptionalModels）**：
- 顶部过滤栏：`Input`（按名称过滤，placeholder"按名称过滤"，宽度 w-56，300ms 防抖）+ 原生 `<select>`（`全部类型`/`Image-Text-to-Text`(1)/`Image-Text-to-Video`(2)）
- 错误显示 `models.error`（红色）
- 模型卡片列表（见下）
- 分页：`上一页` / `第 X / Y 页 · 共 Z 条` / `下一页`，禁用条件含 `models.loading`

**模型卡片（ModelCard）**：
- 顶部：模型名 + meta 行（类型、参数、上下文），右上角徽标 `Draft`/`MMProj`/`Diffusion`（**仅当 `isTrue(flag)` 才显示**；`isTrue = value===true || value===1 || value==='1'`，绝不显示 0）
- 关系行：`创作者：X · Qor：Y · 启动器：Z`（有才显示）
- **量化模型分组**：
  - `groupQuantized()`：按 `weightFile.qbit` 分组（`qbitKey`：null/undefined → "原始"），组序保留接口顺序，组内按 `sizeToBytes(size)` 升序
  - 每个分组是一个可折叠区块：组头 = `ChevronRight`（展开时 `rotate-90`）+ `Q<qbit>`（或"原始"）+（可选）琥珀色"超出显存"提示
  - **默认展开/折叠**：组内**所有**文件 size 都大于显存（即最小 size > vram）→ 默认折叠；只要有一个 ≤ 显存 → 默认展开；无显存信息 → 全部展开（初始 `openGroups` 用 `useState(() => ...)` 计算）
  - 组内权重文件按钮：
    - label = **量化信息**：文件名去掉扩展名、再去掉模型名前缀（大小写不敏感）、去掉前导 `-_.\s`；如模型 `Muse-Glimmer-30B`、文件 `Muse-Glimmer-30B-UD-IQ2_XXS.gguf` → `UD-IQ2_XXS`；匹配不到时回退显示 qbit
    - `title` 悬停提示 = `文件名 · xx.xx GB`
    - **显存配色**（`vramFit` + `fitClasses`）：`margin = vram - size`（字节，size 经 `sizeToBytes` 换算）
      - `margin > 2G` → 绿：`border-green-200 bg-green-50 text-green-800`（暗色 `dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300`）
      - `0 ≤ margin ≤ 2G` → 黄：`border-yellow-200 bg-yellow-50 text-yellow-800`（暗色对应 yellow 系）
      - `margin < 0`（超过显存）→ 红：`border-red-200 bg-red-50 text-red-800`（暗色对应 red 系）
      - 无显存信息 → 默认 `border-border bg-muted text-muted-foreground`
- **尺寸工具**：`sizeToBytes(size)`：`Number(size) * 1024**3`（**size 单位是 GB**，可能是字符串）；`formatGb(size)`：`Number(size).toFixed(2) GB`，无效值返回 `N/A`

### 12.7 设置页（src/components/settings-page.tsx）

- 接收 props：`user: Account | null`、`onLogout: () => void`
- **程序与模型文件夹**：`Input` + `浏览` 按钮（`window.api.selectFolder()`）；校验 `validateModelFolder`：非空 + `/^[\x20-\x7E]+$/`（必须英文 ASCII 路径），错误红色 `TriangleAlert` 提示"模型文件夹路径必须是英文路径，不能包含中文等其他语言文字"；有值时灰色 `Info` 提示"已选择：路径"；琥珀色提示磁盘需预留几十 GB
- **上下文窗口大小**：`Slider`（min 0 ~ max len-1，`CONTEXT_SIZE_VALUES` 索引）+ 数值展示 + 刻度（`formatContextSize`），说明文案提示影响显存/内存占用
- **账号区（底部）**：已登录 → `UserAvatar`(size-8) + 昵称/邮箱 + `登出` 按钮（`LogOut` 图标，outline）；未登录 → "当前未登录"
- `CONTEXT_SIZE_VALUES = [4K,8K,16K,32K,64K,128K,256K,512K,1M]`（字节），默认索引 0；`formatContextSize`：≥1MB 显示 `x MB`，否则 `x KB`；读取时就近吸附到列表中的值

### 12.8 Hooks

**useAuth（src/lib/auth-store.ts）**：
- `session` 状态 + 启动恢复：读 `getConfig()`，若有 `auth.token` 则调 `getProfile()` 校验，成功则 `setSession({...config.auth, account: profile})`；失败（token 失效）则 `updateConfig({ auth: undefined })`
- 返回 `{ user, loading, login(username,password), register(payload), logout() }`；`logout` 先 `setSession(null)` 再 `window.api.logout()`

**useModelsCatalog（src/lib/models-store.ts）**：
- 状态：`result`、`loading`、`error`、`params {page,pageSize:3,name?,type?}`、`nameInput`、`typeValue`
- **挂载时**：先 `readModelsCache()` 显示缓存，再 `fetchData(params)` 拉最新
- name 输入 300ms 防抖 → `setParams`（变更时才触发，name 变化重置 page=1）
- `setType(type)`：重置 page=1；`goToPage(page)`
- `params` 变化 → `fetchData(params)`；`refresh()` 用当前 params 重新请求
- **latest-wins**：`latestParamsRef` 记录本次请求 params 引用，响应返回后若引用已被更新则丢弃旧结果
- 返回 `{ result, loading, error, name, setName, type, setType, goToPage, refresh }`

---

## 13. 错误处理规范

- 主进程 `api.ts` 统一映射为直白中文（见第 8 节），渲染层直接展示
- `formatErrorMessage(err, fallback)`（src/lib/utils.ts）：去掉 `Error invoking remote method '<channel>': ` 前缀，空则用 fallback

---

## 14. 主题（src/index.css）

- Tailwind v4：`@import 'tailwindcss'` + `tw-animate-css`；`@custom-variant dark`
- `:root` 与 `.dark` 定义 CSS 变量：`--background/--foreground/--card/--popover/--primary/--secondary/--muted/--accent/--destructive/--border/--input/--ring/--chart-1..5/--sidebar*`
- `@theme inline` 映射为 Tailwind 颜色 token（`--color-primary: var(--primary)` 等）
- `@layer base`：`* { @apply border-border outline-ring/50 }`，`body { @apply bg-background text-foreground }`

---

## 15. 已知问题（重写时可选修复）

1. `IpcChannels.getMaxCudaVersion` 已声明但 main 未注册 handler
2. 主进程心跳 `setInterval` 未清理，多次 `did-finish-load` 会累积定时器
3. 开发模式恒开 DevTools（可改为 `!app.isPackaged` 控制）
4. `HomeView` 的 Ping/AppInfo/心跳为模板演示代码，正式功能落地后可移除

---

## 16. 构建配置与 Gotcha

### forge.config.ts
- `packagerConfig: { asar: true }`
- VitePlugin：main（`src/main.ts`，`vite.main.config.ts`）、preload（`src/preload.ts`，`vite.preload.config.ts`）、renderer（`main_window`，`vite.renderer.config.mts`）
- FusesPlugin：`RunAsNode:false`、`EnableCookieEncryption:true`、`EnableNodeOptionsEnvironmentVariable:false`、`EnableNodeCliInspectArguments:false`、`EnableEmbeddedAsarIntegrityValidation:true`、`OnlyLoadAppFromAsar:true`

### Gotcha
- `vite.renderer.config.mts` **必须是 `.mts`**（ESM），因为 `@tailwindcss/vite` 仅支持 ESM 而 Forge 默认按 CJS 打包配置
- 路径别名 `@/*` → `src/*` 需同时配置在 `vite.renderer.config.mts` 和 `tsconfig.json`
- npm 版本检查可能因 nvm shim 报 `Could not check npm version "undefined"`，用 `~/.skip-forge-system-check` 绕过
- `WeightFile.size` 是**字符串 + GB 单位**；`gpuVram` 单位 MB；`memoryTotal` 单位字节——三者单位不同，勿混用

---

## 17. 依赖清单（package.json）

**dependencies**：`@radix-ui/react-slot`、`electron-squirrel-startup`、`radix-ui`、`react`、`react-dom`、`systeminformation`

**devDependencies**：`@electron-forge/*`（cli/maker-deb/maker-rpm/maker-squirrel/maker-zip/plugin-auto-unpack-natives/plugin-fuses/plugin-vite）、`@electron/fuses`、`@tailwindcss/vite`、`@types/*`、`@typescript-eslint/*`、`@vitejs/plugin-react`、`class-variance-authority`、`clsx`、`electron`、`eslint`、`eslint-import-resolver-typescript`、`eslint-plugin-import`、`lucide-react`、`tailwind-merge`、`tailwindcss`、`tw-animate-css`、`typescript`、`vite`