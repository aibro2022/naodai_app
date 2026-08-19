import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import started from 'electron-squirrel-startup';
import {
  IpcChannels,
  type AppConfig,
  type DownloadItem,
  type DownloadProgressPayload,
  type ModelsPagedParams,
  type PrepareDownloadParams,
  type RegisterPayload,
  type RunModelParams,
  type RunModelResult,
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
const runningModels = new Map<
  number,
  {
    child: ChildProcess;
    logStream: fs.WriteStream;
    modelWindow?: BrowserWindow;
    serverUrl?: string;
  }
>();

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

ipcMain.handle(
  IpcChannels.runModel,
  (_event, params: RunModelParams): RunModelResult => {
    const {
      launcherPath,
      modelPath,
      mmprojPath,
      draftPath,
      context,
      tools,
      customParams,
    } = params;
    const exe = path.join(
      launcherPath,
      `llama-server${process.platform === 'win32' ? '.exe' : ''}`,
    );
    if (!fs.existsSync(exe)) {
      throw new Error(`未找到启动器可执行文件：${exe}`);
    }
    const args: string[] = [];
    args.push('-m', modelPath);
    if (mmprojPath) {
      args.push('--mmproj', mmprojPath);
    }
    if (draftPath) {
      args.push('--md', draftPath);
    }
    args.push('-c', String(context));
    if (tools) {
      args.push('--tools', 'all');
    }
    args.push('-ngl', '99', '-ngld', '99');
    if (customParams?.trim()) {
      args.push(...customParams.trim().split(/\s+/));
    }

    const logPath = path.join(os.tmpdir(), `naodai-${Date.now()}.log`);
    const command = [exe, ...args.map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(
      ' ',
    );
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`# ${new Date().toISOString()}\n# ${command}\n\n`);
    const child = spawn(exe, args, {
      cwd: launcherPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    const closeLog = () => logStream.end();
    child.on('exit', closeLog);
    child.on('error', (err) => {
      logStream.write(`\n[launch error] ${err.message}\n`);
    });
    const pid = child.pid ?? -1;
    const onExit = () => {
      const entry = runningModels.get(pid);
      runningModels.delete(pid);
      stopWaiting();
      if (entry?.modelWindow && !entry.modelWindow.isDestroyed()) {
        entry.modelWindow.close();
      }
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IpcChannels.modelExit, pid);
        }
      }
    };
    child.on('exit', onExit);
    child.on('error', onExit);
    runningModels.set(pid, { child, logStream });

    // 检测到 "listening on http:" 时直接打开最大化的网页窗口，并广播给渲染进程。
    const stopWaiting = waitForServerUrl(logPath, (url) => {
      const entry = runningModels.get(pid);
      if (entry) {
        entry.serverUrl = url;
      }
      openModelWindow(pid);
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IpcChannels.modelReady, { pid, url });
        }
      }
    });

    return { pid, logPath, command };
  },
);

ipcMain.handle(IpcChannels.openModelWeb, (_event, pid: number) => {
  openModelWindow(pid);
});

const waitForServerUrl = (
  logPath: string,
  onFound: (url: string) => void,
): (() => void) => {
  const timer = setInterval(() => {
    let content = '';
    try {
      content = fs.readFileSync(logPath, 'utf-8');
    } catch {
      return;
    }
    const match = content.match(/listening on (http:\/\/\S+)/i);
    if (match) {
      const url = match[1].replace(/[,\s)'"]+$/, '');
      clearInterval(timer);
      onFound(url);
    }
  }, 500);
  return () => clearInterval(timer);
};

const openModelWindow = (pid: number): void => {
  const entry = runningModels.get(pid);
  if (!entry?.serverUrl) {
    return;
  }
  if (entry.modelWindow && !entry.modelWindow.isDestroyed()) {
    entry.modelWindow.show();
    entry.modelWindow.focus();
    return;
  }
  const modelWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: '模型服务',
  });
  modelWindow.loadURL(entry.serverUrl);
  modelWindow.maximize();
  modelWindow.show();
  entry.modelWindow = modelWindow;
};

ipcMain.handle(IpcChannels.stopModel, (_event, pid: number) => {
  const entry = runningModels.get(pid);
  if (entry) {
    entry.child.kill();
    if (entry.modelWindow && !entry.modelWindow.isDestroyed()) {
      entry.modelWindow.close();
    }
  }
});

ipcMain.handle(
  IpcChannels.modelLogRead,
  (_event, logPath: string, offset: number) => {
    try {
      const fd = fs.openSync(logPath, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        if (offset >= size) {
          return { content: '', endOffset: size };
        }
        const length = size - offset;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, offset);
        return { content: buffer.toString('utf-8'), endOffset: size };
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return { content: '', endOffset: offset };
    }
  },
);

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