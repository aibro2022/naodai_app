import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config';
import type { ModelsPagedResult } from './ipc';

const getCachePath = () => path.join(getConfigDir(), 'models_cache.json');

export const readModelsCache = (): ModelsPagedResult | null => {
  try {
    return JSON.parse(fs.readFileSync(getCachePath(), 'utf-8')) as ModelsPagedResult;
  } catch {
    return null;
  }
};

export const writeModelsCache = (data: ModelsPagedResult): void => {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getCachePath(), JSON.stringify(data, null, 2), 'utf-8');
};