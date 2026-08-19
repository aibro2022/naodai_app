import fs from 'node:fs';
import path from 'node:path';
import { fetchLauncherVersionsFilter } from './api';
import { readConfig, updateConfig } from './config';
import { querySystemInfo } from './system-info';
import type {
  DownloadItem,
  DownloadProgressPayload,
  PrepareDownloadParams,
  PrepareDownloadResult,
  WeightFile,
} from './ipc';

const isTrue = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

// 超过该大小的权重文件使用 HTTP-Range 分片多线程下载。
const CHUNK_THRESHOLD_BYTES = 500 * 1024 * 1024;
// 分片并发数（8-12）。
const CHUNK_CONCURRENCY = 10;
// 拼接分片时单次读写的缓冲大小。
const CONCAT_BUFFER_SIZE = 1024 * 1024;
// 网络层失败（fetch failed）的最大重试次数。
const MAX_FETCH_RETRIES = 5;
// 退避起始延迟（毫秒），每次翻倍，最大 10 秒。
const BACKOFF_BASE_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const backoffDelay = (attempt: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** attempt, 10000);

const throwIfCancelled = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error('已取消');
  }
};

/**
 * 带重试的 fetch：undici 在网络层失败（DNS、连接中断、socket 异常等）时
 * 抛出 `TypeError: fetch failed`，这里对其做指数退避重试，缓解不稳定网络
 * 导致的偶发下载失败。用户取消时不重试。
 */
const fetchWithRetry = async (
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> => {
  let attempt = 0;
  for (;;) {
    throwIfCancelled(signal);
    try {
      return await fetch(url, { ...init, signal });
    } catch (err) {
      throwIfCancelled(signal);
      if (attempt >= MAX_FETCH_RETRIES) {
        throw err;
      }
      attempt++;
      await sleep(backoffDelay(attempt));
    }
  }
};

const sizeToBytes = (size: number | string | undefined): number | undefined => {
  const value = Number(size);
  return Number.isFinite(value) && value > 0 ? value * 1024 ** 3 : undefined;
};

const splitUrls = (address?: string): string[] =>
  (address ?? '')
    .split('|')
    .map((url) => url.trim())
    .filter(Boolean);

const basenameFromUrl = (url: string): string => {
  try {
    const pathname = new URL(url).pathname;
    return path.basename(pathname) || 'file';
  } catch {
    return 'file';
  }
};

const isArchive = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
};

export const mapPlatform = (platform: string): number =>
  platform === 'darwin' ? 2 : platform === 'linux' ? 3 : 1;

export const mapOsArch = (arch: string): number => (arch === 'arm64' ? 2 : 1);

export const mapGpu = (vendor?: string): number | undefined => {
  if (!vendor) {
    return undefined;
  }
  const value = vendor.toLowerCase();
  if (value.includes('nvidia')) return 1;
  if (value.includes('amd') || value.includes('advanced micro devices')) return 2;
  if (value.includes('intel')) return 3;
  return undefined;
};

export const parseIntCuda = (cuda?: string): number | undefined => {
  const match = cuda?.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
};

const addWeightFile = (
  wf: WeightFile | undefined,
  modelsDir: string,
  items: DownloadItem[],
): void => {
  if (!wf) {
    return;
  }
  if (fs.existsSync(path.join(modelsDir, wf.name))) {
    return;
  }
  const urls = splitUrls(wf.downloadAddress);
  if (urls.length === 0) {
    return;
  }
  for (const url of urls) {
    items.push({
      url,
      fileName: isTrue(wf.isSplit) ? basenameFromUrl(url) : wf.name,
      targetDir: modelsDir,
      size: sizeToBytes(wf.size),
    });
  }
};

export const prepareDownload = async (
  params: PrepareDownloadParams,
): Promise<PrepareDownloadResult> => {
  const { model, weightFile } = params;
  const config = readConfig();
  const modelFolder = config.modelFolder;
  if (!modelFolder) {
    throw new Error('请先在设置中配置模型文件夹');
  }
  if (!model.launcherId) {
    throw new Error('该模型未关联启动器，无法下载');
  }
  if (!model.qor?.name) {
    throw new Error('该模型未关联 Qor，无法下载');
  }

  const sysInfo = config.systemInfo?.gpuVendor
    ? config.systemInfo
    : await querySystemInfo();
  if (!config.systemInfo?.gpuVendor) {
    updateConfig({ systemInfo: sysInfo });
  }
  const versions = await fetchLauncherVersionsFilter({
    launcherId: model.launcherId,
    platform: mapPlatform(process.platform),
    osArch: mapOsArch(process.arch),
    gpu: mapGpu(sysInfo.gpuVendor),
    cuda: parseIntCuda(sysInfo.cudaVersion),
  });
  if (versions.length === 0) {
    throw new Error('未找到适配当前系统的启动器版本');
  }
  const launcherVersion = versions[0];
  const items: DownloadItem[] = [];

  // 启动器二进制目录：modelFolder/binary/<launcherVersion.name>
  const binaryDir = path.join(modelFolder, 'binary', launcherVersion.name);
  if (!fs.existsSync(binaryDir)) {
    for (const url of splitUrls(launcherVersion.downloadAddress)) {
      items.push({ url, fileName: basenameFromUrl(url), targetDir: binaryDir });
    }
    for (const url of splitUrls(launcherVersion.extraDownloadAddress)) {
      items.push({ url, fileName: basenameFromUrl(url), targetDir: binaryDir });
    }
  }

  // 模型权重目录：modelFolder/models/<qor.name>
  const modelsDir = path.join(modelFolder, 'models', model.qor.name);
  addWeightFile(weightFile, modelsDir, items);
  if (isTrue(model.hasDraft)) {
    model.draftModels?.forEach((item) =>
      addWeightFile(item.weightFile, modelsDir, items),
    );
  }
  if (isTrue(model.hasMmproj)) {
    model.mmprojs?.forEach((item) =>
      addWeightFile(item.weightFile, modelsDir, items),
    );
  }
  if (isTrue(model.hasDiffusion)) {
    model.diffusionModels?.forEach((item) =>
      addWeightFile(item.weightFile, modelsDir, items),
    );
  }

  return { items, launcherVersion };
};

const downloadFile = async (
  url: string,
  targetPath: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  let received = 0;
  let total = 0;
  for (let attempt = 0; ; attempt++) {
    throwIfCancelled(signal);
    // 断流续传：从已接收字节数发起 Range 请求。
    const headers: Record<string, string> =
      received > 0 ? { Range: `bytes=${received}-` } : {};
    const response = await fetchWithRetry(url, { headers }, signal);
    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_FETCH_RETRIES) {
        await sleep(backoffDelay(attempt + 1));
        continue;
      }
      throw new Error(`下载失败 ${url}（HTTP ${response.status}）`);
    }
    if (received > 0 && response.status !== 206) {
      // 服务器忽略 Range 请求（返回 200），只能从头重新下载。
      fs.rmSync(targetPath, { force: true });
      received = 0;
    }
    if (received === 0) {
      total = Number(response.headers.get('content-length')) || 0;
    }
    if (!response.body) {
      throw new Error(`下载失败 ${url}（无响应内容）`);
    }
    const writer = fs.createWriteStream(targetPath, {
      flags: received === 0 ? 'w' : 'a',
    });
    const finished = new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    try {
      const reader = response.body.getReader();
      for (;;) {
        throwIfCancelled(signal);
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.length;
        if (!writer.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => writer.once('drain', resolve));
        }
        onProgress(received, total);
      }
      writer.end();
      await finished;
      onProgress(received, total);
      return;
    } catch (err) {
      if (signal?.aborted) {
        writer.destroy();
        throw new Error('已取消');
      }
      // 先冲刷缓冲区，确保已接收数据落盘，再断流续传。
      writer.end();
      try {
        await finished;
      } catch {
        // 忽略冲刷阶段的写入错误
      }
      if (attempt >= MAX_FETCH_RETRIES) {
        throw err;
      }
      await sleep(backoffDelay(attempt + 1));
    }
  }
};

/**
 * HTTP-Range 分片多线程下载：按 Range 头把文件切成若干分片并发下载到
 * 临时文件，最后按顺序拼接为完整文件。服务器不支持分段时返回 false，
 * 由调用方回退到单线程下载。
 */
const chunkedDownload = async (
  url: string,
  targetPath: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<boolean> => {
  const head = await fetchWithRetry(url, { method: 'HEAD' }, signal);
  if (!head.ok) {
    throw new Error(`下载失败 ${url}（HTTP ${head.status}）`);
  }
  const total = Number(head.headers.get('content-length')) || 0;
  if (total <= 0) {
    return false;
  }
  const ranges = head.headers.get('accept-ranges');
  if (ranges && ranges.toLowerCase() !== 'bytes') {
    return false;
  }

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const chunkSize = Math.ceil(total / CHUNK_CONCURRENCY);
  const partPaths: string[] = [];
  const tasks: Promise<void>[] = [];
  let downloaded = 0;

  const downloadRange = async (start: number, end: number, partPath: string): Promise<void> => {
    // 分片断流时续传，避免整段重下导致进度回退。
    let partReceived = 0;
    for (let attempt = 0; ; attempt++) {
      throwIfCancelled(signal);
      const headers: Record<string, string> =
        partReceived > 0
          ? { Range: `bytes=${start + partReceived}-${end}` }
          : { Range: `bytes=${start}-${end}` };
      const response = await fetchWithRetry(url, { headers }, signal);
      if (response.status !== 206 || !response.body) {
        throw new Error(`分段下载失败 ${url}（HTTP ${response.status}）`);
      }
      const writer = fs.createWriteStream(partPath, {
        flags: partReceived === 0 ? 'w' : 'a',
      });
      const finished = new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      try {
        const reader = response.body.getReader();
        for (;;) {
          throwIfCancelled(signal);
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          partReceived += value.length;
          downloaded += value.length;
          if (!writer.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => writer.once('drain', resolve));
          }
          onProgress(downloaded, total);
        }
        writer.end();
        await finished;
        return;
      } catch (err) {
        if (signal?.aborted) {
          writer.destroy();
          throw new Error('已取消');
        }
        // 冲刷缓冲区后按已接收字节续传。
        writer.end();
        try {
          await finished;
        } catch {
          // 忽略冲刷阶段的写入错误
        }
        if (attempt >= MAX_FETCH_RETRIES) {
          throw err;
        }
        await sleep(backoffDelay(attempt + 1));
      }
    }
  };

  try {
    for (let i = 0; i < CHUNK_CONCURRENCY; i++) {
      const start = i * chunkSize;
      if (start >= total) {
        break;
      }
      const end = i === CHUNK_CONCURRENCY - 1 ? total - 1 : start + chunkSize - 1;
      const partPath = `${targetPath}.part${i}`;
      partPaths.push(partPath);
      tasks.push(downloadRange(start, end, partPath));
    }
    await Promise.all(tasks);
    await concatParts(targetPath, partPaths);
  } finally {
    for (const partPath of partPaths) {
      fs.rmSync(partPath, { force: true });
    }
  }
  onProgress(total, total);
  return true;
};

const concatParts = async (targetPath: string, partPaths: string[]): Promise<void> => {
  const dest = await fs.promises.open(targetPath, 'w');
  const buffer = Buffer.alloc(CONCAT_BUFFER_SIZE);
  try {
    let position = 0;
    for (const partPath of partPaths) {
      const src = await fs.promises.open(partPath, 'r');
      try {
        for (;;) {
          const { bytesRead } = await src.read(buffer, 0, buffer.length, null);
          if (bytesRead === 0) {
            break;
          }
          await dest.write(buffer, 0, bytesRead, position);
          position += bytesRead;
        }
      } finally {
        await src.close();
      }
    }
  } finally {
    await dest.close();
  }
};

const extractArchive = async (archivePath: string, destDir: string): Promise<void> => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    const AdmZip = (await import('adm-zip')).default;
    new AdmZip(archivePath).extractAllTo(destDir, true);
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    const tar = await import('tar');
    await tar.x({ file: archivePath, cwd: destDir });
  }
};

const downloadItem = async (
  item: DownloadItem,
  targetPath: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> => {
  if (item.size != null && item.size > CHUNK_THRESHOLD_BYTES) {
    let attempt = 0;
    for (;;) {
      throwIfCancelled(signal);
      try {
        const ok = await chunkedDownload(item.url, targetPath, onProgress, signal);
        if (ok) {
          return;
        }
        // 服务器不支持分段下载，回退到单线程下载。
        break;
      } catch (err) {
        if (signal?.aborted) {
          throw new Error('已取消');
        }
        if (attempt >= MAX_FETCH_RETRIES) {
          throw err;
        }
        attempt++;
        await sleep(backoffDelay(attempt));
      }
    }
  }
  await downloadFile(item.url, targetPath, onProgress, signal);
};

export const startDownload = async (
  items: DownloadItem[],
  sendProgress: (payload: DownloadProgressPayload) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const totalItems = items.length;
  // 记录每个文件已上报的进度，重试/续传时保证进度只增不减，避免进度条来回跳。
  const lastReported = new Map<string, number>();
  for (let index = 0; index < totalItems; index++) {
    const item = items[index];
    const targetPath = path.join(item.targetDir, item.fileName);
    sendProgress({
      fileName: item.fileName,
      index,
      totalItems,
      received: 0,
      total: 0,
      percent: 0,
      done: false,
    });
    // 进度事件节流到约 200ms 一次，避免每个数据块都触发一次 IPC。
    let lastProgressAt = 0;
    const throttledProgress = (received: number, total: number) => {
      const now = Date.now();
      const prev = lastReported.get(item.fileName) ?? 0;
      const effective = received >= prev ? received : prev;
      lastReported.set(item.fileName, effective);
      const isFinal = total > 0 && effective >= total;
      if (!isFinal && now - lastProgressAt < 200) {
        return;
      }
      lastProgressAt = now;
      sendProgress({
        fileName: item.fileName,
        index,
        totalItems,
        received: effective,
        total,
        percent: total ? Math.round((effective / total) * 100) : 0,
        done: false,
      });
    };
    try {
      await downloadItem(item, targetPath, throttledProgress, signal);
      if (isArchive(item.fileName)) {
        await extractArchive(targetPath, item.targetDir);
        fs.rmSync(targetPath, { force: true });
      }
      sendProgress({
        fileName: item.fileName,
        index,
        totalItems,
        received: 0,
        total: 0,
        percent: 100,
        done: true,
      });
    } catch (err) {
      sendProgress({
        fileName: item.fileName,
        index,
        totalItems,
        received: 0,
        total: 0,
        percent: 0,
        done: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
};