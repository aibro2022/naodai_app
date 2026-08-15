import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { graphics, cpu, mem } from 'systeminformation';
import { arch } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IpcChannels, type AppConfig } from './ipc';
import { readConfig, updateConfig, ensureConfigFile } from './config';

const execFileAsync = promisify(execFile);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

const querySystemInfo = async () => {
  const [graphicsData, cpuData, memData] = await Promise.all([
    graphics(),
    cpu(),
    mem(),
  ]);
  const gpuVendor = graphicsData.controllers[0]?.vendor ?? '';
  return {
    gpus: graphicsData.controllers.map((controller) => ({
      vendor: controller.vendor ?? '',
      model: controller.model,
      vram: controller.vram,
    })),
    gpuVendor,
    cudaVersion: gpuVendor ? (await getMaxCudaVersion()) ?? '' : '',
    cudaCapability: gpuVendor ? (await getCudaCapability()) ?? '' : '',
    gpuVram: graphicsData.controllers.reduce(
      (sum, item) => sum + (item.vram ?? 0),
      0,
    ),
    platform: process.platform,
    osArch: arch(),
    cpuModel: cpuData.manufacturer
      ? `${cpuData.manufacturer} ${cpuData.brand}`.trim()
      : cpuData.brand,
    cpuCores: cpuData.cores,
    memoryTotal: memData.total,
  };
};

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