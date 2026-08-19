import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  IpcChannels,
  type AppConfig,
  type DownloadItem,
  type DownloadProgressPayload,
  type ModelsPagedParams,
  type PrepareDownloadParams,
  type RegisterPayload,
} from './ipc';
import { readConfig, updateConfig, ensureConfigFile } from './config';
import {
  authLogin,
  authLogout,
  authProfile,
  authRegister,
  fetchLauncherVersionsFilter,
  fetchModelsPaged,
} from './api';
import { readModelsCache, writeModelsCache } from './models-cache';
import { prepareDownload, startDownload } from './download';
import { scanLocalModels } from './local-scan';
import { querySystemInfo } from './system-info';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let downloadSession: { controller: AbortController; targets: string[] } | null =
  null;

ipcMain.handle(IpcChannels.ping, (_event, message: string) => {
  return `pong: ${message}`;
});

ipcMain.handle(IpcChannels.getAppInfo, () => {
  return {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
  };
});

ipcMain.handle(IpcChannels.getSystemInfo, async (_event, force = false) => {
  const cached = readConfig().systemInfo;
  if (cached && !force) {
    return cached;
  }
  const info = await querySystemInfo();
  updateConfig({ systemInfo: info });
  return info;
});

ipcMain.handle(IpcChannels.getConfig, () => {
  return readConfig();
});

ipcMain.handle(
  IpcChannels.updateConfig,
  (_event, patch: Partial<AppConfig>) => {
    return updateConfig(patch);
  },
);

ipcMain.handle(
  IpcChannels.authLogin,
  (_event, username: string, password: string) => {
    return authLogin(username, password);
  },
);

ipcMain.handle(IpcChannels.authLogout, () => {
  return authLogout();
});

ipcMain.handle(IpcChannels.authProfile, () => {
  return authProfile();
});

ipcMain.handle(
  IpcChannels.authRegister,
  (_event, payload: RegisterPayload) => {
    return authRegister(payload);
  },
);

ipcMain.handle(
  IpcChannels.modelsPaged,
  async (_event, params: ModelsPagedParams) => {
    const result = await fetchModelsPaged(params);
    writeModelsCache(result);
    return result;
  },
);

ipcMain.handle(IpcChannels.modelsCacheRead, () => {
  return readModelsCache();
});

ipcMain.handle(IpcChannels.localModelsRead, () => {
  const modelFolder = readConfig().modelFolder;
  if (!modelFolder) {
    return [];
  }
  const configPath = path.join(modelFolder, 'config.json');
  if (!fs.existsSync(configPath)) {
    return [];
  }
  try {
    const config = JSON.parse(
      fs.readFileSync(configPath, 'utf-8'),
    ) as Record<string, unknown>;
    if (Array.isArray(config.localModels) && config.localModels.length > 0) {
      return config.localModels;
    }
    return Array.isArray(config.downloads) ? config.downloads : [];
  } catch {
    return [];
  }
});

ipcMain.handle(IpcChannels.scanLocalModels, () => {
  return scanLocalModels();
});

ipcMain.handle(
  IpcChannels.launcherVersionsFilter,
  (_event, params) => {
    return fetchLauncherVersionsFilter(params);
  },
);

ipcMain.handle(
  IpcChannels.prepareDownload,
  (_event, params: PrepareDownloadParams) => {
    return prepareDownload(params);
  },
);

ipcMain.handle(
  IpcChannels.startDownload,
  async (event, items: DownloadItem[]) => {
    const controller = new AbortController();
    const targets = items.map((item) => path.join(item.targetDir, item.fileName));
    downloadSession = { controller, targets };
    const sendProgress = (payload: DownloadProgressPayload) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IpcChannels.downloadProgress, payload);
      }
    };
    try {
      await startDownload(items, sendProgress, controller.signal);
      // 下载完成后复用“本地模型”tab 的刷新逻辑重新扫描并写回 config.json。
      await scanLocalModels();
    } catch (err) {
      if (controller.signal.aborted) {
        // 取消时删除本次会话已下载与未下载完成的文件。
        for (const target of targets) {
          fs.rmSync(target, { force: true });
          for (let i = 0; i < 15; i++) {
            fs.rmSync(`${target}.part${i}`, { force: true });
          }
        }
        throw new Error('下载已取消');
      }
      throw err;
    } finally {
      downloadSession = null;
    }
  },
);

ipcMain.handle(IpcChannels.cancelDownload, () => {
  downloadSession?.controller.abort();
});

ipcMain.handle(IpcChannels.selectFolder, async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const options: Electron.OpenDialogOptions = {
    title: '选择模型文件夹',
    buttonLabel: '选择',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

const createTrayIcon = () => {
  const size = 32;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = 12;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const idx = (y * size + x) * 4;
      if (dist <= radius) {
        // BGRA: orange circle with a darker edge.
        const shade = Math.max(0, 1 - dist / radius);
        buffer[idx] = 60 + shade * 120; // B
        buffer[idx + 1] = 90 + shade * 70; // G
        buffer[idx + 2] = 230; // R
        buffer[idx + 3] = 245; // A
      } else {
        buffer[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
};

const showWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
};

const createTray = () => {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('naodai');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开',
        click: () => showWindow(),
      },
      { type: 'separator' },
      {
        label: '关闭',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => showWindow());
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Closing the window hides it instead of quitting the app.
  // Only the tray "关闭" item truly quits the application.
  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  // Send a heartbeat from the main process to the renderer every 5 seconds,
  // demonstrating main -> renderer one-way push over IPC.
  mainWindow.webContents.on('did-finish-load', () => {
    const broadcast = () => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send(IpcChannels.push, {
          source: 'main',
          message: `heartbeat at ${new Date().toLocaleTimeString()}`,
        });
      }
    };
    broadcast();
    setInterval(broadcast, 5000);
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  ensureConfigFile();
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  showWindow();
});