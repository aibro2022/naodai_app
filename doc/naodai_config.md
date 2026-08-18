# naodai_config.json 配置说明

naodai 应用的配置文件，用于持久化应用设置与缓存的系统信息。

## 文件位置

- 目录：`~/.naodai/`（即用户主目录下的 `.naodai` 目录，如 Windows 为 `C:\Users\<用户名>\.naodai`）
- 文件名：`naodai_config.json`
- 应用启动时会自动创建目录与空文件（`ensureConfigFile`，见 `src/config.ts`）。

## 结构总览

```json
{
  "systemInfo": {
    "gpus": [
      { "vendor": "NVIDIA", "model": "GeForce RTX 4090", "vram": 24564 }
    ],
    "cpuModel": "Intel Core i9-13900K",
    "cpuCores": 24,
    "processors": 1,
    "memoryTotal": 34359738368,
    "gpuVendor": "NVIDIA",
    "gpuVram": 24564,
    "cudaVersion": "12.4",
    "cudaCapability": "8.9",
    "osArch": "x64",
    "platform": "win32"
  },
  "modelFolder": "D:/naodai/models",
  "contextSizeBytes": 32768,
  "apiBaseUrl": "http://localhost:3000",
  "auth": {
    "token": "…",
    "expiresAt": "2026-08-18T12:00:00.000Z",
    "account": {
      "id": 1,
      "username": "alice",
      "nickname": "Alice",
      "email": "alice@example.com"
    }
  }
}
```

所有字段均为**可选**，配置文件可能只有部分字段，甚至为空对象 `{}`。

## 字段说明

### `systemInfo`（object | undefined）

缓存的系统硬件信息，由主进程首次调用 `getSystemInfo` 时采集并写入，之后读取时直接使用缓存（调用时传 `force=true` 才会重新采集）。结构如下：

| 字段 | 类型 | 说明 |
|---|---|---|
| `gpus` | `GpuInfo[]` | GPU 列表。每项包含 `vendor`（厂商）、`model`（型号）、`vram`（显存，单位 **MB**，`number \| null`） |
| `cpuModel` | `string` | CPU 型号，如 `Intel Core i9-13900K`（无厂商信息时为纯型号） |
| `cpuCores` | `number` | CPU 物理核心数 |
| `processors` | `number` | CPU 处理器（插槽）数量 |
| `memoryTotal` | `number` | 总内存大小，单位 **字节** |
| `gpuVendor` | `string` | 第一块 GPU 的厂商名，用于判断是否存在 GPU |
| `gpuVram` | `number` | 所有 GPU 显存之和，单位 **MB** |
| `cudaVersion` | `string` | `nvidia-smi` 输出的最大 CUDA 版本（如 `12.4`）；无 NVIDIA 显卡或无法获取时为 `""` |
| `cudaCapability` | `string` | GPU 计算能力（如 `8.9`）；无 NVIDIA 显卡时为 `""` |
| `osArch` | `string` | 操作系统架构，如 `x64`、`arm64` |
| `platform` | `string` | 操作系统平台，如 `win32`、`darwin`、`linux` |

> 注意：`vram` 单位为 MB，`memoryTotal` 单位为字节，两者单位不同。

### `modelFolder`（string | undefined）

程序与模型文件夹的路径，由用户在设置页选择或输入。用于存放本地模型文件。

- 为空字符串 `""` 表示尚未设置。
- 校验规则见 `src/lib/settings-store.ts` 的 `validateModelFolder`：
  - 不允许为空；
  - 必须是纯英文 ASCII 路径（`^[\x20-\x7E]+$`），不能包含中文等其他语言文字。
- 首次启动时若未设置该字段，应用会自动跳到设置页。

### `contextSizeBytes`（number | undefined）

上下文窗口大小，单位 **字节**。用户通过设置页的滑杆调整，可选值为：

`4 KB、8 KB、16 KB、32 KB、64 KB、128 KB、256 KB、512 KB、1 MB`

即 `CONTEXT_SIZE_VALUES`（见 `src/lib/settings-store.ts`）。读取时若配置值不在上述列表中，会就近吸附到最近的合法值；未设置时默认取 `4 KB`。

> 提示：当前单位是字节。上下文窗口大小影响模型一次性能记住的文字量（提示词 + 历史对话 + AI 输出），同时也会增加显存/内存占用。

### `apiBaseUrl`（string | undefined）

后端接口服务地址。开发调试阶段默认为 `http://localhost:3000`（见 `src/api.ts` 的 `DEFAULT_BASE_URL`）；设置该字段可覆盖默认值，用于切换生产环境等场景。

### `auth`（object | undefined）

用户登录会话，由 `/auth/login` 成功后自动写入，登出时清除。结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| `token` | `string` | Bearer 访问令牌，请求业务接口时放入 `Authorization` 请求头 |
| `expiresAt` | `string` | 令牌过期时间（ISO 8601 字符串） |
| `account` | `object` | 账号信息，包含 `id`、`username`、`nickname?`、`email?` 等公开字段 |

应用启动时会携带已保存的 token 调用 `/auth/profile` 校验会话是否仍有效，失效则自动清除该字段。

## 读写方式

- 应用内通过 IPC 通道访问（`window.api.getConfig()` / `window.api.updateConfig(patch)`），渲染进程不直接读写文件。
- 主进程侧实现见 `src/config.ts`：`readConfig` / `writeConfig` / `updateConfig`，更新为整文件覆写（`updateConfig` 先合并再写入）。
- 配置文件为普通 JSON，可直接手动编辑；但建议通过应用界面修改，以免因格式错误导致设置丢失（解析失败时 `readConfig` 返回 `{}`）。
