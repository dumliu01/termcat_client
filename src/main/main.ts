import { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut, powerMonitor, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createHash } from 'crypto';
import { sshService } from '../core/ssh/ssh-manager';
import { fileTransferService } from '../core/transfer/file-transfer-handler';
import { tunnelService, TunnelConfig } from '../core/tunnel/tunnel-manager';
import { chatHistoryService } from './chat-history-service';
import { logger, LOG_MODULE } from '../base/logger/logger';
import { getPluginManager } from '../plugins/plugin-manager';
import { logFileWriter } from '../base/logger/log-file-writer';
import { localPtyService } from '../core/pty/local-pty-manager';
import { localFsProvider } from './services/local-fs-provider';
import { windowManager } from './window-manager';

// In Dev mode, use a separate userData directory to avoid conflicts with the release version
const isDev = !app.isPackaged;
if (isDev) {
  app.setName('TermCat-Dev');
  app.setPath('userData', path.join(app.getPath('appData'), 'TermCat-Dev'));
}

// Initialize log file writer (automatically registered as a file sink for logger)
logFileWriter.initialize({ logDir: app.getPath('logs') });

// Renderer process logs are written to file via IPC
ipcMain.on('log:write', (_event, line: string) => {
  logFileWriter.write(line);
});

// Get log directory path
ipcMain.handle('log:get-dir', () => {
  return logFileWriter.getLogDir();
});

// Register termcat:// custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('termcat', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('termcat');
}

// Handle termcat:// protocol callback
function handleAuthCallback(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.host === 'auth') {
      const token = parsed.searchParams.get('token');
      const user = parsed.searchParams.get('user');
      const targetWindow = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
      if (token && user && targetWindow && !targetWindow.isDestroyed()) {
        logger.info(LOG_MODULE.AUTH, 'auth.protocol.callback', 'Received auth callback via termcat:// protocol', {
          has_token: true,
        });
        targetWindow.webContents.send('auth-callback', { token, user });
        // Ensure window is focused
        if (targetWindow.isMinimized()) targetWindow.restore();
        targetWindow.focus();
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

// macOS: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

// Windows/Linux: second-instance event
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Find termcat:// URL from command line arguments
    const url = commandLine.find((arg) => arg.startsWith('termcat://'));
    if (url) {
      handleAuthCallback(url);
    }
    // Focus existing window
    const win = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// Forward from renderer process to main process and back to renderer process
// Used for broadcasting terminal focus changes
ipcMain.on('terminal-focus-gained', (event, connectionId) => {
  // Forward back to renderer process via webContents.send so ipcRenderer.on can receive it
  event.sender.send('terminal-focus-gained', connectionId);
});

// Initialize SSH Service
// Main process starting

app.whenReady().then(async () => {
  // Release version uses simplified menu, Dev version keeps default menu for easier debugging
  if (app.isPackaged && process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          {
            label: 'About TermCat',
            click: () => {
              const win = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
              win?.webContents.send('navigate-to', 'settings', 'help');
            },
          },
          { type: 'separator' },
          {
            label: 'Settings...',
            accelerator: 'Cmd+,',
            click: () => {
              const win = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
              win?.webContents.send('navigate-to', 'settings');
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
          {
            label: '新建窗口',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              const win = windowManager.createWindow();
              getPluginManager().registerWindow(win);
            },
          },
          { type: 'separator' },
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

  // Dock right-click menu (macOS)
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: '新窗口',
        click: () => {
          const win = windowManager.createWindow();
          getPluginManager().registerWindow(win);
        },
      },
    ]);
    app.dock.setMenu(dockMenu);
  }

  chatHistoryService.registerHandlers();
  const firstWindow = windowManager.createWindow();

  // Dev mode: register F12 / Ctrl+Shift+I to toggle DevTools
  if (process.env.VITE_DEV_SERVER_URL) {
    firstWindow.webContents.openDevTools();

    const toggleDevTools = () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && !focused.isDestroyed()) {
        focused.webContents.toggleDevTools();
      }
    };
    globalShortcut.register('F12', toggleDevTools);
    globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
  } else if (process.argv.includes('--devtools')) {
    firstWindow.webContents.openDevTools();
  }

  // Initialize plugin system
  try {
    const pluginManager = getPluginManager();
    pluginManager.registerWindow(firstWindow);
    await pluginManager.initialize();
  } catch (err) {
    console.error('[Main] Plugin system initialization failed:', err);
  }

  // Pre-warm a local PTY so first terminal open is instant
  localPtyService.prewarm();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = windowManager.createWindow();
      getPluginManager().registerWindow(win);
    }
  });

  // Power monitor: detect system sleep/wake to handle stale connections
  powerMonitor.on('resume', () => {
    logger.info(LOG_MODULE.MAIN, 'power.resumed', 'System resumed from sleep');
    windowManager.broadcast('system-resumed');
  });

  powerMonitor.on('unlock-screen', () => {
    logger.info(LOG_MODULE.MAIN, 'power.screen_unlocked', 'Screen unlocked');
    windowManager.broadcast('system-resumed');
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Shutdown plugin system and log service when application exits
app.on('before-quit', async () => {
  await windowManager.closeAll();
  const pluginManager = getPluginManager();
  await pluginManager.shutdown();
  logFileWriter.shutdown();
});

// Window control IPC handlers (Windows frameless window)
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// New window IPC handler
ipcMain.handle('window:create', (_event, options?: { hostToConnect?: any; localTerminal?: boolean }) => {
  const win = windowManager.createWindow(options);
  getPluginManager().registerWindow(win);
});

// ── Desktop Notification IPC ──
ipcMain.handle('notification:show', (event, options: { title: string; body: string }) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  // Only show notification when window is not focused
  if (senderWindow && !senderWindow.isDestroyed() && !senderWindow.isFocused()) {
    const notification = new Notification({
      title: options.title,
      body: options.body,
    });
    notification.on('click', () => {
      if (senderWindow && !senderWindow.isDestroyed()) {
        if (senderWindow.isMinimized()) senderWindow.restore();
        senderWindow.show();
        senderWindow.focus();
      }
    });
    notification.show();
  }
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Device fingerprint for license verification
ipcMain.handle('license:getMachineId', async () => {
  // Try cached value first
  const cacheFile = path.join(app.getPath('userData'), 'machine-id.json');
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached.machineId) return cached.machineId;
    }
  } catch {
    // Cache read failed, regenerate
  }

  // Get first non-internal MAC address
  const nets = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  const raw = `${mac}|${os.platform()}|${os.hostname()}`;
  const machineId = createHash('sha256').update(raw).digest('hex').substring(0, 32);

  // Cache to file
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ machineId }), 'utf-8');
  } catch {
    // Cache write failed, non-critical
  }

  return machineId;
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
    windowManager.registerConnection(event.sender.id, connectionId);

    // Trigger plugin SSH connection event
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
    // await ensures external plugins complete panel registration before SSH connection returns,
    // avoiding race conditions on the Renderer side
    await pluginManager.emitSSHConnect(connInfo);

    // Return passthrough mode info so renderer can handle proxy correctly
    const connection = sshService.getConnection(connectionId);
    const isShellPassthrough = !!connection?.shellPassthroughCmd;
    return { connectionId, isShellPassthrough };
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
    windowManager.unregisterConnection(event.sender.id, connectionId);

    // Trigger plugin SSH disconnect event
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
    windowManager.registerShell(event.sender.id, shellId);

    // Trigger plugin terminal open event
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

ipcMain.handle('ssh-close-shell', (_event, shellId: string) => {
  if (!sshService) return { success: false };
  windowManager.unregisterShell(_event.sender.id, shellId);
  const success = sshService.closeShell(shellId);
  return { success };
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
    // Send to renderer process via webContents.send so XTermTerminal's onFocusTerminal listener can receive it
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

// Get remote server operating system information
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
  windowManager.registerPty(event.sender.id, ptyId);

  // Expose the local PTY to plugins the same way SSH shells do.
  const pluginManager = getPluginManager();
  const terminalInfo = {
    sessionId: ptyId,
    hostId: 'local',
    title: 'Local Terminal',
    isActive: true,
  };
  pluginManager.registerTerminal(terminalInfo);
  pluginManager.emitTerminalOpen(terminalInfo);

  return { ptyId };
});

ipcMain.handle('local-pty-destroy', async (_event, ptyId: string) => {
  windowManager.unregisterPty(_event.sender.id, ptyId);
  const pluginManager = getPluginManager();
  const existing = {
    sessionId: ptyId,
    hostId: 'local',
    title: 'Local Terminal',
    isActive: false,
  };
  pluginManager.unregisterTerminal(ptyId);
  pluginManager.emitTerminalClose(existing);
  localPtyService.destroy(ptyId);
  return { success: true };
});

ipcMain.handle('local-pty-resize', async (_event, ptyId: string, cols: number, rows: number) => {
  return { success: localPtyService.resize(ptyId, cols, rows) };
});

// Renderer-driven active-tab change. Notifies plugins so panels (e.g. claude_code_power)
// can rebind to the currently focused terminal.
ipcMain.on('plugin:terminal:active-change', (_event, sessionId: string | null) => {
  getPluginManager().emitTerminalActiveChange(sessionId);
});

// Renderer-driven UI language change. Propagates the current I18nContext
// language to Main-process plugins so their panels translate in sync.
ipcMain.on('plugin:i18n:language-change', (_event, language: string) => {
  if (typeof language === 'string') getPluginManager().emitLanguageChange(language);
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

ipcMain.handle('local-pty-health-check', async (_event, ptyId: string) => {
  return localPtyService.healthCheck(ptyId);
});

ipcMain.handle('local-pty-rebuild', async (_event, ptyId: string, cols: number, rows: number) => {
  return localPtyService.rebuild(ptyId, _event.sender, cols, rows);
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

// ── Local Exec IPC Handler (used for system monitoring, etc.) ──

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
    // Check if local path is a directory; if so, start async directory upload and return transferId immediately
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
    // Start background directory upload and return transferId immediately
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

// File dialog handler
ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)!;
    return await dialog.showSaveDialog(parentWindow, options);
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
    const parentWindow = BrowserWindow.fromWebContents(event.sender)!;
    return await dialog.showOpenDialog(parentWindow, options);
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

    windowManager.registerTunnelConnection(event.sender.id, connectionId);

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

// Forward tunnel status updates to renderer process
tunnelService.onStatusUpdate((connectionId, status) => {
  const ctx = windowManager.findByConnectionId(connectionId);
  if (ctx && !ctx.window.isDestroyed()) {
    ctx.window.webContents.send('tunnel-status-update', connectionId, status);
  }
});
