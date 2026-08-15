import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './ipc';

export const getConfigDir = () => path.join(app.getPath('home'), '.naodai');

export const getConfigPath = () => path.join(getConfigDir(), 'naodai_config.json');

export const ensureConfigFile = (): void => {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const file = getConfigPath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '{}', 'utf-8');
  }
};

export const readConfig = (): AppConfig => {
  ensureConfigFile();
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as AppConfig;
  } catch {
    return {};
  }
};

export const writeConfig = (config: AppConfig): AppConfig => {
  ensureConfigFile();
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  return config;
};

export const updateConfig = (patch: Partial<AppConfig>): AppConfig => {
  return writeConfig({ ...readConfig(), ...patch });
};
