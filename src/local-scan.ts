import fs from 'node:fs';
import path from 'node:path';
import { fetchLauncherVersionsFilter } from './api';
import { readConfig } from './config';
import { readModelsCache } from './models-cache';
import { querySystemInfo } from './system-info';
import { mapGpu, mapOsArch, mapPlatform, parseIntCuda } from './download';
import type {
  LocalDownloadRecord,
  LocalFileKind,
  Model,
  WeightedModel,
  WeightFile,
} from './ipc';

const isTrue = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

const readModelConfig = (modelFolder: string): Record<string, unknown> => {
  const configPath = path.join(modelFolder, 'config.json');
  try {
    return JSON.parse(
      fs.readFileSync(configPath, 'utf-8'),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const writeLocalModels = (
  modelFolder: string,
  records: LocalDownloadRecord[],
): void => {
  const configPath = path.join(modelFolder, 'config.json');
  const config = readModelConfig(modelFolder);
  config.localModels = records;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
};

/**
 * 获取模型对应启动器版本的目录名：
 * 1) 优先从 config.json 的 downloads 记录里按 modelId 匹配；
 * 2) 否则调用 /launcher-versions/filter 取第一个版本名。
 * 找不到时返回 null。
 */
const getLauncherVersionName = async (
  model: Model,
  modelFolder: string,
  sysInfo: { gpuVendor?: string; cudaVersion?: string } | undefined,
): Promise<string | null> => {
  const downloads = readModelConfig(modelFolder).downloads;
  if (Array.isArray(downloads)) {
    const record = downloads.find(
      (entry): entry is LocalDownloadRecord =>
        !!entry &&
        typeof entry === 'object' &&
        (entry as LocalDownloadRecord).modelId === model.id &&
        !!(entry as LocalDownloadRecord).launcherVersionName,
    );
    if (record?.launcherVersionName) {
      return record.launcherVersionName;
    }
  }
  if (!model.launcherId) {
    return null;
  }
  try {
    const versions = await fetchLauncherVersionsFilter({
      launcherId: model.launcherId,
      platform: mapPlatform(process.platform),
      osArch: mapOsArch(process.arch),
      gpu: mapGpu(sysInfo?.gpuVendor),
      cuda: parseIntCuda(sysInfo?.cudaVersion),
    });
    return versions[0]?.name ?? null;
  } catch {
    return null;
  }
};

const collectFiles = (
  model: Model,
  qorDir: string,
  weightName: string,
): LocalDownloadRecord['files'] => {
  const out: LocalDownloadRecord['files'] = [];
  const push = (wf: WeightFile | undefined, type: LocalFileKind) => {
    if (!wf) {
      return;
    }
    const filePath = path.join(qorDir, wf.name);
    if (fs.existsSync(filePath)) {
      out.push({
        url: wf.downloadAddress ?? '',
        name: wf.name,
        path: filePath,
        type,
      });
    }
  };
  // 仅包含与 weightName 一致的量化权重文件，以及 mmprojs、draft 文件。
  (model.quantizedModels ?? []).forEach((item) => {
    if (item.weightFile?.name === weightName) {
      push(item.weightFile, 'quantized');
    }
  });
  if (isTrue(model.hasMmproj)) {
    (model.mmprojs ?? []).forEach((item) => push(item.weightFile, 'mmproj'));
  }
  if (isTrue(model.hasDraft)) {
    (model.draftModels ?? []).forEach((item) => push(item.weightFile, 'draft'));
  }
  return out;
};

const allPresent = (items: WeightedModel[], qorDir: string): boolean =>
  items.every(
    (item) =>
      item?.weightFile && fs.existsSync(path.join(qorDir, item.weightFile.name)),
  );

/**
 * 重新扫描 modelFolder/models 目录：找出存在于 models_cache.json 的
 * quantizedModels 中、启动器已下载、且 mmproj/draft/diffusion 文件都齐全的模型，
 * 记录到 config.json 的 localModels 并返回。
 */
export const scanLocalModels = async (): Promise<LocalDownloadRecord[]> => {
  const config = readConfig();
  const modelFolder = config.modelFolder;
  if (!modelFolder) {
    return [];
  }
  const cache = readModelsCache();
  const models = cache?.list ?? [];
  if (models.length === 0) {
    return [];
  }
  const modelsDir = path.join(modelFolder, 'models');
  if (!fs.existsSync(modelsDir)) {
    return [];
  }

  const sysInfo = config.systemInfo?.gpuVendor
    ? config.systemInfo
    : await querySystemInfo();

  const results: LocalDownloadRecord[] = [];
  for (const model of models) {
    const qorName = model.qor?.name;
    if (!qorName) {
      continue;
    }
    const qorDir = path.join(modelsDir, qorName);
    if (!fs.existsSync(qorDir)) {
      continue;
    }

    // 扫描到的 gguf 权重文件须存在于 quantizedModels 列表中。
    const quantFiles = (model.quantizedModels ?? [])
      .map((item) => item.weightFile)
      .filter((wf) => fs.existsSync(path.join(qorDir, wf.name)));
    if (quantFiles.length === 0) {
      continue;
    }

    // 对应 model 的启动器二进制目录必须存在。
    const launcherVersionName = await getLauncherVersionName(
      model,
      modelFolder,
      sysInfo,
    );
    if (!launcherVersionName) {
      continue;
    }
    if (!fs.existsSync(path.join(modelFolder, 'binary', launcherVersionName))) {
      continue;
    }

    // mmproj / draft / diffusion 文件须齐全，否则跳过该模型。
    if (isTrue(model.hasMmproj) && !allPresent(model.mmprojs ?? [], qorDir)) {
      continue;
    }
    if (isTrue(model.hasDraft) && !allPresent(model.draftModels ?? [], qorDir)) {
      continue;
    }
    if (
      isTrue(model.hasDiffusion) &&
      !allPresent(model.diffusionModels ?? [], qorDir)
    ) {
      continue;
    }

    const seenIds = new Set<string>();
    for (const wf of quantFiles) {
      const id = `${model.id}-${wf.id}`;
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      results.push({
        id,
        downloadedAt: new Date().toISOString(),
        launcherId: model.launcherId ?? 0,
        launcherName: model.launcher?.name ?? '',
        launcherVersionId: 0,
        launcherVersionName,
        launcherPath: path.join(modelFolder, 'binary', launcherVersionName),
        modelId: model.id,
        modelName: model.name,
        modelType: model.type,
        contextWindows: model.contextWindows,
        weightId: wf.id,
        weightName: wf.name,
        files: collectFiles(model, qorDir, wf.name),
      });
    }
  }

  writeLocalModels(modelFolder, results);
  return results;
};