import { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sshService } from '../core/ssh/ssh-manager';
import { fileTransferService } from '../core/transfer/file-transfer-handler';
import { tunnelService, TunnelConfig } from '../core/tunnel/tunnel-manager';
import { chatHistoryService } from './chat-history-service';
import { logger, LOG_MODULE } from '../base/logger/logger';
import { getPluginManager } from '../plugins/plugin-manager';
import { logFileWriter } from '../base/logger/log-file-writer';
import { localPtyService } from '../core/pty/local-pty-manager';
import { localFsProvider } from './services/local-fs-provider';

// Dev 模式使用独立的 userData 目录，避免与 release 版本冲突
const isDev = !app.isPackaged;
if (isDev) {
  app.setName('TermCat-Dev');
  app.setPath('userData', path.join(app.getPath('appData'), 'TermCat-Dev'));
}

// 初始化日志文件写入（自动注册为 logger 的文件传输）
logFileWriter.initialize({ logDir: app.getPath('logs') });

// Renderer 进程日志通过 IPC 写入文件
ipcMain.on('log:write', (_event, line: string) => {
  logFileWriter.write(line);
});

// 获取日志目录路径
ipcMain.handle('log:get-dir', () => {
  return logFileWriter.getLogDir();
});

// 注册 termcat:// 自定义协议
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('termcat', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('termcat');
}

// 处理 termcat:// 协议回调
function handleAuthCallback(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.host === 'auth') {
      const token = parsed.searchParams.get('token');
      const user = parsed.searchParams.get('user');
      if (token && user && mainWindow && !mainWindow.isDestroyed()) {
        logger.info(LOG_MODULE.AUTH, 'auth.protocol.callback', 'Received auth callback via termcat:// protocol', {
          has_token: true,
        });
        mainWindow.webContents.send('auth-callback', { token, user });
        // 确保窗口聚焦
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
  } catch (err) {
    logger.error(LOG_MODULE.AUTH, 'auth.protocol.error', 'Failed to parse termcat:// URL', {
      module: LOG_MODULE.AUTH,
      error: 1,
      msg: String(err),
    });
  }
}

// macOS: open-url 事件
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

// Windows/Linux: second-instance 事件
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // 从命令行参数中查找 termcat:// URL
    const url = commandLine.find((arg) => arg.startsWith('termcat://'));
    if (url) {
      handleAuthCallback(url);
    }
    // 聚焦主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 渲染进程到主进程再转发回渲染进程
// 用于终端焦点变化的广播
ipcMain.on('terminal-focus-gained', (event, connectionId) => {
  // 通过 webContents.send 转发回渲染进程，ipcRenderer.on 才能接收到
  event.sender.send('terminal-focus-gained', connectionId);
});

// Initialize SSH Service
// Main process starting

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // macOS: hiddenInset 保留原生红绿灯; Windows: 去掉原生标题栏
    titleBarStyle: isWin ? undefined : 'hiddenInset',
    frame: !isWin,
    backgroundColor: '#020617',
  });

  // Windows 下隐藏菜单栏（dev 模式保留，方便使用 View → Toggle Developer Tools）
  if (isWin && !process.env.VITE_DEV_SERVER_URL) {
    mainWindow.setMenuBarVisibility(false);
  }

  // 设置SSH服务的webContents
  sshService.setWebContents(mainWindow.webContents);

  const enableDevTools = process.argv.includes('--devtools');

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();

    // Dev 模式：注册 F12 / Ctrl+Shift+I 切换 DevTools
    const toggleDevTools = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    };
    globalShortcut.register('F12', toggleDevTools);
    globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    if (enableDevTools) {
      mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Release 版本使用精简菜单，Dev 版本保留默认菜单方便调试
  if (app.isPackaged && process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          {
            label: '关于 TermCat',
            click: () => {
              mainWindow?.webContents.send('navigate-to', 'settings', 'help');
            },
          },
          { type: 'separator' },
          {
            label: '设置...',
            accelerator: 'Cmd+,',
            click: () => {
              mainWindow?.webContents.send('navigate-to', 'settings');
            },
          },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '窗口',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
          { role: 'togglefullscreen' },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  chatHistoryService.registerHandlers();
  createWindow();

  // 初始化插件系统
  try {
    const pluginManager = getPluginManager();
    if (mainWindow) {
      pluginManager.setMainWindow(mainWindow);
    }
    await pluginManager.initialize();
  } catch (err) {
    console.error('[Main] Plugin system initialization failed:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // 窗口重建后更新插件管理器的窗口引用，否则 sendToRenderer 会静默丢失消息
      if (mainWindow) {
        getPluginManager().setMainWindow(mainWindow);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出时关闭插件系统和日志服务
app.on('before-quit', async () => {
  localPtyService.destroyAll();
  const pluginManager = getPluginManager();
  await pluginManager.shutdown();
  logFileWriter.shutdown();
});

// Window control IPC handlers (Windows frameless window)
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => {
  mainWindow?.close();
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('ssh-connect-test', () => {
  return { message: 'IPC test successful', timestamp: Date.now() };
});

// SSH IPC handlers

ipcMain.handle('ssh-connect', async (event, config) => {
  try {
    const connectionId = await sshService.connect(config);

    // 触发插件 SSH 连接事件
    const pluginManager = getPluginManager();
    const connInfo = {
      sessionId: connectionId,
      hostId: config.hostId || connectionId,
      host: config.host,
      port: config.port || 22,
      username: config.username,
      connectedAt: Date.now(),
    };
    pluginManager.registerSSHConnection(connInfo);
    // await 确保外部插件在 SSH 连接返回前完成面板注册，避免 Renderer 端竞态
    await pluginManager.emitSSHConnect(connInfo);

    return connectionId;
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.connection.failed', 'SSH connection failed', {
      module: LOG_MODULE.SSH,
      error: 1001,
      msg: error.message || String(error),
    });
    throw new Error(`SSH connection failed: ${error.message}`);
  }
});

ipcMain.handle('ssh-execute', async (event, connectionId, command, options?: { useLoginShell?: boolean }) => {
  try {
    const result = await sshService.executeCommand(connectionId, command, options);
    return result;
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.command.failed', 'SSH command execution failed', {
      module: LOG_MODULE.SSH,
      error: 1005,
      msg: error.message || String(error),
    });
    throw new Error(`SSH command execution failed: ${error.message}`);
  }
});

ipcMain.handle('ssh-disconnect', async (event, connectionId) => {
  try {
    // 触发插件 SSH 断开事件
    const pluginManager = getPluginManager();
    const connInfo = { sessionId: connectionId, hostId: connectionId, host: '', port: 22, username: '', connectedAt: 0 };
    pluginManager.emitSSHDisconnect(connInfo);
    pluginManager.unregisterSSHConnection(connectionId);

    await sshService.disconnect(connectionId);
    return { success: true };
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.disconnect.failed', 'SSH disconnect failed', {
      module: LOG_MODULE.SSH,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`SSH disconnect failed: ${error.message}`);
  }
});

ipcMain.handle('ssh-create-shell', async (event, connectionId, encoding?: string) => {
  try {
    const webContents = event.sender;
    const shellId = await sshService.createShell(connectionId, webContents, encoding);

    // 触发插件终端打开事件
    const pluginManager = getPluginManager();
    const terminalInfo = {
      sessionId: shellId,
      hostId: connectionId,
      title: connectionId,
      isActive: true,
    };
    pluginManager.registerTerminal(terminalInfo);
    pluginManager.emitTerminalOpen(terminalInfo);

    return shellId;
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.shell.failed', 'SSH shell creation failed', {
      module: LOG_MODULE.SSH,
      error: 1005,
      msg: error.message || String(error),
    });
    throw new Error(`SSH shell creation failed: ${error.message}`);
  }
});

ipcMain.handle('ssh-shell-write', (event, connectionId, data) => {
  if (!sshService) {
    throw new Error('SSH service not initialized');
  }
  const success = sshService.writeToShell(connectionId, data);
  return { success };
});

ipcMain.handle('ssh-shell-resize', (event, connectionId, cols, rows) => {
  if (!sshService) {
    throw new Error('SSH service not initialized');
  }
  const success = sshService.resizeShell(connectionId, cols, rows);
  return { success };
});

ipcMain.handle('ssh-is-connected', (event, connectionId) => {
  if (!sshService) {
    return false;
  }
  return sshService.isConnected(connectionId);
});

ipcMain.handle('ssh-list-dir', async (event, connectionId, path) => {
  try {
    return await sshService.listDirectory(connectionId, path);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.directory.list_failed', 'Failed to list directory', {
      module: LOG_MODULE.SFTP,
      error: 2001,
      msg: error.message || String(error),
      path,
    });
    throw new Error(`Failed to list directory: ${error.message}`);
  }
});

ipcMain.handle('ssh-pwd', async (event, connectionId) => {
  try {
    return await sshService.getCurrentDirectory(connectionId);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.directory.pwd_failed', 'Failed to get current directory', {
      module: LOG_MODULE.SFTP,
      error: 2001,
      msg: error.message || String(error),
    });
    throw new Error(`Failed to get current directory: ${error.message}`);
  }
});

ipcMain.handle('ssh-update-cwd', (event, connectionId, newDirectory) => {
  try {
    sshService.updateCurrentDirectory(connectionId, newDirectory);
    return { success: true };
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.directory.update_failed', 'Failed to update current directory', {
      module: LOG_MODULE.SFTP,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Failed to update current directory: ${error.message}`);
  }
});

ipcMain.handle('ssh-focus-terminal', (event, connectionId) => {
  try {
    // 通过 webContents.send 发送到渲染进程，让 XTermTerminal 的 onFocusTerminal 监听器接收
    event.sender.send('focus-terminal', connectionId);
    return { success: true };
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'ssh.terminal.focus_failed', 'Failed to focus terminal', {
      module: LOG_MODULE.SSH,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Failed to focus terminal: ${error.message}`);
  }
});

// 获取远程服务器操作系统信息
ipcMain.handle('ssh-get-os-info', async (event, connectionId) => {
  const osInfo = await sshService.getOSInfo(connectionId);
  return osInfo || null;
});

// ── Local PTY IPC Handlers ──

ipcMain.handle('local-pty-create', async (event, options) => {
  const ptyId = localPtyService.create({
    ...options,
    webContents: event.sender,
  });
  return { ptyId };
});

ipcMain.handle('local-pty-destroy', async (_event, ptyId: string) => {
  localPtyService.destroy(ptyId);
  return { success: true };
});

ipcMain.handle('local-pty-resize', async (_event, ptyId: string, cols: number, rows: number) => {
  return { success: localPtyService.resize(ptyId, cols, rows) };
});

ipcMain.handle('local-pty-get-shells', async () => {
  return localPtyService.detectShells();
});

ipcMain.handle('local-pty-get-default-shell', async () => {
  return localPtyService.getDefaultShell();
});

ipcMain.handle('local-pty-get-cwd', async (_event, ptyId: string) => {
  return localPtyService.getCwd(ptyId);
});

ipcMain.on('local-pty-write', (_event, ptyId: string, data: string) => {
  localPtyService.write(ptyId, data);
});

// ── Local FS IPC Handlers ──

ipcMain.handle('local-fs-list', async (_event, dirPath: string) => localFsProvider.list(dirPath));
ipcMain.handle('local-fs-tree', async (_event, dirPath: string, maxDepth: number) => localFsProvider.tree(dirPath, maxDepth));
ipcMain.handle('local-fs-read-preview', async (_event, filePath: string, maxLines: number) => localFsProvider.readPreview(filePath, maxLines));
ipcMain.handle('local-fs-read', async (_event, filePath: string, maxSizeKB: number) => localFsProvider.read(filePath, maxSizeKB));
ipcMain.handle('local-fs-write', async (_event, filePath: string, content: string) => localFsProvider.write(filePath, content));
ipcMain.handle('local-fs-rename', async (_event, dir: string, oldName: string, newName: string) => localFsProvider.rename(dir, oldName, newName));
ipcMain.handle('local-fs-delete', async (_event, dir: string, name: string, isDir: boolean) => localFsProvider.delete(dir, name, isDir));
ipcMain.handle('local-fs-mkdir', async (_event, dir: string, name: string) => localFsProvider.mkdir(dir, name));
ipcMain.handle('local-fs-create-file', async (_event, dir: string, name: string) => localFsProvider.createFile(dir, name));
ipcMain.handle('local-fs-chmod', async (_event, dir: string, name: string, octal: string) => localFsProvider.chmod(dir, name, octal));
ipcMain.handle('local-fs-pack', async (_event, dir: string, fileNames: string[]) => localFsProvider.pack(dir, fileNames));
ipcMain.handle('local-fs-remove-temp', async (_event, tempPath: string) => localFsProvider.removeTempFile(tempPath));
ipcMain.handle('local-fs-homedir', async () => localFsProvider.getHomedir());
ipcMain.handle('local-fs-copy-file', async (_event, src: string, dest: string) => localFsProvider.copyFile(src, dest));
ipcMain.handle('local-fs-copy-dir', async (_event, src: string, dest: string) => localFsProvider.copyDirectory(src, dest));

// ── Local Exec IPC Handler（系统监控等使用） ──

ipcMain.handle('local-exec', async (_event, command: string) => {
  const { exec } = require('child_process');
  return new Promise<{ output: string; exitCode: number }>((resolve) => {
    exec(command, {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
    }, (error: any, stdout: string, stderr: string) => {
      resolve({
        output: stdout || stderr || '',
        exitCode: error ? (error.code || 1) : 0,
      });
    });
  });
});

// File Transfer IPC handlers
ipcMain.handle('file-upload', async (event, connectionId, localPath, remotePath) => {
  try {
    // 检查本地路径是否为目录，如果是则使用异步启动目录上传并立即返回 transferId
    if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
      const transferId = fileTransferService.startUploadDirectory(connectionId, localPath, remotePath, event.sender);
      return transferId;
    }

    return await fileTransferService.uploadFile(connectionId, localPath, remotePath, event.sender);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'file.transfer.upload_failed', 'File upload failed', {
      module: LOG_MODULE.FILE,
      error: 2003,
      msg: error.message || String(error),
    });
    throw new Error(`File upload failed: ${error.message}`);
  }
});

ipcMain.handle('file-download', async (event, connectionId, remotePath, localPath) => {
  try {
    return await fileTransferService.downloadFile(connectionId, remotePath, localPath, event.sender);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'file.transfer.download_failed', 'File download failed', {
      module: LOG_MODULE.FILE,
      error: 2003,
      msg: error.message || String(error),
    });
    throw new Error(`File download failed: ${error.message}`);
  }
});

ipcMain.handle('file-upload-dir', async (event, connectionId, localPath, remotePath) => {
  try {
    // 启动后台目录上传并立即返回 transferId
    const transferId = fileTransferService.startUploadDirectory(connectionId, localPath, remotePath, event.sender);
    return transferId;
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'file.transfer.upload_dir_failed', 'Directory upload failed', {
      module: LOG_MODULE.FILE,
      error: 2003,
      msg: error.message || String(error),
    });
    throw new Error(`Directory upload failed: ${error.message}`);
  }
});

ipcMain.handle('file-download-dir', async (event, connectionId, remotePath, localPath) => {
  try {
    return await fileTransferService.downloadDirectory(connectionId, remotePath, localPath, event.sender);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'file.transfer.download_dir_failed', 'Directory download failed', {
      module: LOG_MODULE.FILE,
      error: 2003,
      msg: error.message || String(error),
    });
    throw new Error(`Directory download failed: ${error.message}`);
  }
});

// 文件对话框处理器
ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    return await dialog.showSaveDialog(mainWindow!, options);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'dialog.save.failed', 'Save dialog failed', {
      module: LOG_MODULE.MAIN,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Save dialog failed: ${error.message}`);
  }
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  try {
    return await dialog.showOpenDialog(mainWindow!, options);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'dialog.open.failed', 'Open dialog failed', {
      module: LOG_MODULE.MAIN,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Open dialog failed: ${error.message}`);
  }
});

// Tunnel IPC handlers
ipcMain.handle('tunnel-start', async (event, connectionId: string, config: TunnelConfig) => {
  try {
    const sshConnection = sshService.getConnection(connectionId);
    if (!sshConnection) {
      throw new Error('SSH connection not found');
    }

    let status;
    switch (config.type) {
      case 'L':
        status = await tunnelService.startLocalForward(sshConnection.client, connectionId, config);
        break;
      case 'R':
        status = await tunnelService.startRemoteForward(sshConnection.client, connectionId, config);
        break;
      case 'D':
        status = await tunnelService.startDynamicForward(sshConnection.client, connectionId, config);
        break;
      default:
        throw new Error(`Unknown tunnel type: ${config.type}`);
    }

    return status;
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'tunnel.start.failed', 'Failed to start tunnel', {
      module: LOG_MODULE.SSH,
      error: 1,
      msg: error.message || String(error),
      tunnel_id: config.id,
      tunnel_type: config.type,
    });
    throw new Error(`Failed to start tunnel: ${error.message}`);
  }
});

ipcMain.handle('tunnel-stop', async (event, connectionId: string, tunnelId: string) => {
  try {
    const sshConnection = sshService.getConnection(connectionId);
    if (!sshConnection) {
      throw new Error('SSH connection not found');
    }

    await tunnelService.stopTunnel(sshConnection.client, connectionId, tunnelId);
    return { success: true };
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'tunnel.stop.failed', 'Failed to stop tunnel', {
      module: LOG_MODULE.SSH,
      error: 1,
      msg: error.message || String(error),
      tunnel_id: tunnelId,
    });
    throw new Error(`Failed to stop tunnel: ${error.message}`);
  }
});

ipcMain.handle('tunnel-stop-all', async (event, connectionId: string) => {
  try {
    const sshConnection = sshService.getConnection(connectionId);
    if (sshConnection) {
      await tunnelService.stopAllTunnels(sshConnection.client, connectionId);
    }
    return { success: true };
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'tunnel.stop_all.failed', 'Failed to stop all tunnels', {
      module: LOG_MODULE.SSH,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Failed to stop all tunnels: ${error.message}`);
  }
});

ipcMain.handle('tunnel-get-statuses', (event, connectionId: string) => {
  return tunnelService.getTunnelStatuses(connectionId);
});

// 监听隧道状态更新并转发到渲染进程
tunnelService.onStatusUpdate((connectionId, status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel-status-update', connectionId, status);
  }
});
