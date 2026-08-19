import { graphics, cpu, mem } from 'systeminformation';
import { arch } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SystemInfo } from './ipc';

const execFileAsync = promisify(execFile);

/**
 * Runs `nvidia-smi` and extracts the max CUDA version the current GPU supports
 * from the header line (e.g. "CUDA Version: 12.4"). Returns null when
 * nvidia-smi is unavailable or the version cannot be parsed.
 */
const getMaxCudaVersion = async (): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('nvidia-smi');
    const match = stdout.match(/CUDA (?:UMD )?Version:\s*(\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const getCudaCapability = async (): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=compute_cap',
      '--format=csv,noheader',
    ]);
    const value = stdout.trim().split('\n')[0]?.trim();
    return value && value.toLowerCase() !== 'n/a' ? value : null;
  } catch {
    return null;
  }
};

export const querySystemInfo = async (): Promise<SystemInfo> => {
  const [graphicsData, cpuData, memData] = await Promise.all([
    graphics(),
    cpu(),
    mem(),
  ]);
  const controllers = graphicsData.controllers;
  // 取显存最大的控制器作为目标显卡（通常为独立显卡/主力计算卡），
  // 避免多显卡机器上枚举顺序导致 gpuVendor 误判。
  let primary = controllers[0];
  for (const controller of controllers) {
    if ((controller.vram ?? 0) > (primary?.vram ?? 0)) {
      primary = controller;
    }
  }
  const gpuVendor = primary?.vendor ?? '';
  return {
    gpus: controllers.map((controller) => ({
      vendor: controller.vendor ?? '',
      model: controller.model,
      vram: controller.vram,
    })),
    gpuVendor,
    cudaVersion: gpuVendor ? (await getMaxCudaVersion()) ?? '' : '',
    cudaCapability: gpuVendor ? (await getCudaCapability()) ?? '' : '',
    gpuVram: controllers.reduce((sum, item) => sum + (item.vram ?? 0), 0),
    platform: process.platform,
    osArch: arch(),
    cpuModel: cpuData.manufacturer
      ? `${cpuData.manufacturer} ${cpuData.brand}`.trim()
      : cpuData.brand,
    cpuCores: cpuData.cores,
    processors: cpuData.processors,
    memoryTotal: memData.total,
  };
};