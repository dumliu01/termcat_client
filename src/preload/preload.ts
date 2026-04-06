import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Window controls (Windows frameless window)
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  // SSH functionality
  sshConnectTest: () => ipcRenderer.invoke('ssh-connect-test'),
  sshConnect: (config: any) => ipcRenderer.invoke('ssh-connect', config),
  sshExecute: (connectionId: string, command: string, options?: { useLoginShell?: boolean }) => ipcRenderer.invoke('ssh-execute', connectionId, command, options),
  sshDisconnect: (connectionId: string) => ipcRenderer.invoke('ssh-disconnect', connectionId),
  sshCreateShell: (connectionId: string, encoding?: string) => ipcRenderer.invoke('ssh-create-shell', connectionId, encoding),
  sshCloseShell: (shellId: string) => ipcRenderer.invoke('ssh-close-shell', shellId),
  sshShellWrite: (connectionId: string, data: string) => ipcRenderer.invoke('ssh-shell-write', connectionId, data),
  sshShellResize: (connectionId: string, cols: number, rows: number) => ipcRenderer.invoke('ssh-shell-resize', connectionId, cols, rows),
  sshIsConnected: (connectionId: string) => ipcRenderer.invoke('ssh-is-connected', connectionId),
  sshListDir: (connectionId: string, path: string) => ipcRenderer.invoke('ssh-list-dir', connectionId, path),
  sshPwd: (connectionId: string) => ipcRenderer.invoke('ssh-pwd', connectionId),
  sshUpdateCwd: (connectionId: string, newDirectory: string) => ipcRenderer.invoke('ssh-update-cwd', connectionId, newDirectory),
  sshFocusTerminal: (connectionId: string) => ipcRenderer.invoke('ssh-focus-terminal', connectionId),
  sshGetOSInfo: (connectionId: string) => ipcRenderer.invoke('ssh-get-os-info', connectionId),

  // Emit terminal focus gained event (triggered when user clicks terminal manually)
  sendTerminalFocusGained: (connectionId: string) => {
    //console.log('[Preload] Sending terminal-focus-gained event, connectionId:', connectionId);
    ipcRenderer.send('terminal-focus-gained', connectionId);
  },

  // Listen for focus terminal event (triggered when double-pressing Ctrl to switch to terminal mode)
  onFocusTerminal: (callback: (connectionId: string) => void) => {
    const listener = (_event: any, connectionId: string) => callback(connectionId);
    ipcRenderer.on('focus-terminal', listener);
    return () => ipcRenderer.removeListener('focus-terminal', listener);
  },

  // Listen for terminal focus gained event (triggered when user clicks terminal manually)
  onTerminalFocusGained: (callback: (connectionId: string) => void) => {
    const listener = (_event: any, connectionId: string) => callback(connectionId);
    ipcRenderer.on('terminal-focus-gained', listener);
    return () => ipcRenderer.removeListener('terminal-focus-gained', listener);
  },

  // Listen for shell data
  onShellData: (callback: (connectionId: string, data: string) => void) => {
    const listener = (_event: any, connectionId: string, data: string) => callback(connectionId, data);
    ipcRenderer.on('ssh-shell-data', listener);
    // Returns function to unsubscribe
    return () => ipcRenderer.removeListener('ssh-shell-data', listener);
  },

  // Listen for shell close
  onShellClose: (callback: (connectionId: string) => void) => {
    const listener = (_event: any, connectionId: string) => callback(connectionId);
    ipcRenderer.on('ssh-shell-close', listener);
    return () => ipcRenderer.removeListener('ssh-shell-close', listener);
  },

  // Listen for system resume (after sleep/lock screen)
  onSystemResumed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('system-resumed', listener);
    return () => ipcRenderer.removeListener('system-resumed', listener);
  },

  // [DEBUG] Listen for shell debug info
  onShellDebug: (callback: (connectionId: string, debugInfo: any) => void) => {
    const listener = (_event: any, connectionId: string, debugInfo: any) => callback(connectionId, debugInfo);
    ipcRenderer.on('ssh-shell-debug', listener);
    return () => ipcRenderer.removeListener('ssh-shell-debug', listener);
  },

  // File transfer API
  uploadFile: (connectionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('file-upload', connectionId, localPath, remotePath),

  downloadFile: (connectionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('file-download', connectionId, remotePath, localPath),

  uploadDirectory: (connectionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('file-upload-dir', connectionId, localPath, remotePath),

  downloadDirectory: (connectionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('file-download-dir', connectionId, remotePath, localPath),

  // Listen for transfer progress
  onTransferProgress: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transfer-progress', listener);
    return () => ipcRenderer.removeListener('transfer-progress', listener);
  },

  // Listen for transfer complete
  onTransferComplete: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transfer-complete', listener);
    return () => ipcRenderer.removeListener('transfer-complete', listener);
  },

  // Listen for transfer start
  onTransferStart: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transfer-start', listener);
    return () => ipcRenderer.removeListener('transfer-start', listener);
  },

  // Listen for transfer error
  onTransferError: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('transfer-error', listener);
    return () => ipcRenderer.removeListener('transfer-error', listener);
  },

  // File dialog
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),

  // Tunnel functionality
  tunnelStart: (connectionId: string, config: TunnelConfig) =>
    ipcRenderer.invoke('tunnel-start', connectionId, config),
  tunnelStop: (connectionId: string, tunnelId: string) =>
    ipcRenderer.invoke('tunnel-stop', connectionId, tunnelId),
  tunnelStopAll: (connectionId: string) =>
    ipcRenderer.invoke('tunnel-stop-all', connectionId),
  tunnelGetStatuses: (connectionId: string) =>
    ipcRenderer.invoke('tunnel-get-statuses', connectionId),

  // Listen for tunnel status update
  onTunnelStatusUpdate: (callback: (connectionId: string, status: TunnelStatus) => void) => {
    const listener = (_event: any, connectionId: string, status: TunnelStatus) =>
      callback(connectionId, status);
    ipcRenderer.on('tunnel-status-update', listener);
    return () => ipcRenderer.removeListener('tunnel-status-update', listener);
  },

  // Listen for termcat:// protocol callback (third-party login)
  onAuthCallback: (callback: (data: { token: string; user: string }) => void) => {
    const listener = (_event: any, data: { token: string; user: string }) => callback(data);
    ipcRenderer.on('auth-callback', listener);
    return () => ipcRenderer.removeListener('auth-callback', listener);
  },

  // Window management
  windowCreate: (options?: { hostToConnect?: any; localTerminal?: boolean }) => ipcRenderer.invoke('window:create', options),

  // Auto-connect listener (for windows opened with a host)
  onAutoConnect: (callback: (hostConfig: any) => void) => {
    const handler = (_event: any, hostConfig: any) => callback(hostConfig);
    ipcRenderer.on('auto-connect', handler);
    return () => ipcRenderer.removeListener('auto-connect', handler);
  },

  // Auto-connect local terminal listener
  onAutoConnectLocal: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('auto-connect-local', handler);
    return () => ipcRenderer.removeListener('auto-connect-local', handler);
  },

  // Listen for menu navigation event
  onNavigate: (callback: (view: string, tab?: string) => void) => {
    const listener = (_event: any, view: string, tab?: string) => callback(view, tab);
    ipcRenderer.on('navigate-to', listener);
    return () => ipcRenderer.removeListener('navigate-to', listener);
  },

  // Get terminal session current working directory (unified interface, abstract local/ssh differences)
  getSessionCwd: async (connectionId: string, connectionType: 'local' | 'ssh'): Promise<string | null> => {
    try {
      if (connectionType === 'local') {
        return await ipcRenderer.invoke('local-pty-get-cwd', connectionId);
      } else {
        const pwd = await ipcRenderer.invoke('ssh-pwd', connectionId);
        return pwd && pwd.startsWith('/') ? pwd : null;
      }
    } catch {
      return null;
    }
  },

  // Desktop notification (system-level, shown when window is not focused)
  showNotification: (options: { title: string; body: string }) =>
    ipcRenderer.invoke('notification:show', options),

  // Open external URL
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Plugin system
  plugin: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    getCachedPanels: () => ipcRenderer.invoke('plugin:get-cached-panels'),
    getSettings: (pluginId: string) => ipcRenderer.invoke('plugin:get-settings', pluginId),
    setSetting: (pluginId: string, key: string, value: unknown) => ipcRenderer.invoke('plugin:set-setting', pluginId, key, value),
    installFromUrl: (packageUrl: string, pluginName: string) => ipcRenderer.invoke('plugin:install', packageUrl, pluginName),
    uninstall: (pluginId: string) => ipcRenderer.invoke('plugin:uninstall', pluginId),
    onStateChanged: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:state:changed', listener);
      return () => ipcRenderer.removeListener('plugin:state:changed', listener);
    },
    onNotification: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:notification', listener);
      return () => ipcRenderer.removeListener('plugin:notification', listener);
    },
    onStatusBarUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('plugin:statusbar:updated', listener);
      return () => ipcRenderer.removeListener('plugin:statusbar:updated', listener);
    },
    // Callback registration when plugin requests renderer to perform operations
    onTerminalWrite: (callback: (data: { sessionId: string; data: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:terminal:write', listener);
      return () => ipcRenderer.removeListener('plugin:terminal:write', listener);
    },
    onTerminalExec: (callback: (data: { sessionId: string; command: string; responseChannel: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:terminal:exec', listener);
      return () => ipcRenderer.removeListener('plugin:terminal:exec', listener);
    },
    onSSHExec: (callback: (data: { sessionId: string; command: string; responseChannel: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:ssh:exec', listener);
      return () => ipcRenderer.removeListener('plugin:ssh:exec', listener);
    },
    // Respond to plugin requests
    sendResponse: (channel: string, data: any) => ipcRenderer.send(channel, data),
    // External plugin panel operations (Main -> Renderer)
    onPanelRegister: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:panel:register', listener);
      return () => ipcRenderer.removeListener('plugin:panel:register', listener);
    },
    onPanelUnregister: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:panel:unregister', listener);
      return () => ipcRenderer.removeListener('plugin:panel:unregister', listener);
    },
    onPanelSetData: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:panel:setData', listener);
      return () => ipcRenderer.removeListener('plugin:panel:setData', listener);
    },
    onPanelUpdateSection: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('plugin:panel:updateSection', listener);
      return () => ipcRenderer.removeListener('plugin:panel:updateSection', listener);
    },
    getLocalAgentStatus: () => ipcRenderer.invoke('plugin:get-local-agent-status'),
    onLocalAgentStarted: (callback: (data: { port: number; wsUrl: string; models?: any[] }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('local-agent:started', listener);
      return () => ipcRenderer.removeListener('local-agent:started', listener);
    },
    onLocalAgentStopped: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('local-agent:stopped', listener);
      return () => ipcRenderer.removeListener('local-agent:stopped', listener);
    },
  },

  // Log file
  log: {
    write: (line: string) => ipcRenderer.send('log:write', line),
    getLogDir: () => ipcRenderer.invoke('log:get-dir') as Promise<string>,
  },

  // License / device fingerprint
  license: {
    getMachineId: () => ipcRenderer.invoke('license:getMachineId') as Promise<string>,
  },

  // Chat history
  chatHistory: {
    create: (header: any) => ipcRenderer.invoke('chat-history:create', header),
    append: (userId: string, convId: string, createdAt: number, message: any) =>
      ipcRenderer.invoke('chat-history:append', userId, convId, createdAt, message),
    appendBatch: (userId: string, convId: string, createdAt: number, messages: any[]) =>
      ipcRenderer.invoke('chat-history:append-batch', userId, convId, createdAt, messages),
    updateHeader: (userId: string, convId: string, createdAt: number, updates: any) =>
      ipcRenderer.invoke('chat-history:update-header', userId, convId, createdAt, updates),
    list: (userId: string) => ipcRenderer.invoke('chat-history:list', userId),
    load: (userId: string, fileName: string) => ipcRenderer.invoke('chat-history:load', userId, fileName),
    delete: (userId: string, fileName: string) => ipcRenderer.invoke('chat-history:delete', userId, fileName),
  },

  // Local terminal
  localTerminal: {
    create: (options: { shell?: string; args?: string[]; cwd?: string; env?: Record<string, string>; cols: number; rows: number }) =>
      ipcRenderer.invoke('local-pty-create', options),
    destroy: (ptyId: string) =>
      ipcRenderer.invoke('local-pty-destroy', ptyId),
    resize: (ptyId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('local-pty-resize', ptyId, cols, rows),
    getShells: () =>
      ipcRenderer.invoke('local-pty-get-shells'),
    getDefaultShell: () =>
      ipcRenderer.invoke('local-pty-get-default-shell'),
    getCwd: (ptyId: string): Promise<string | null> =>
      ipcRenderer.invoke('local-pty-get-cwd', ptyId),
    write: (ptyId: string, data: string) =>
      ipcRenderer.send('local-pty-write', ptyId, data),
    healthCheck: (ptyId: string): Promise<boolean> =>
      ipcRenderer.invoke('local-pty-health-check', ptyId),
    rebuild: (ptyId: string, cols: number, rows: number): Promise<{ newPtyId: string } | null> =>
      ipcRenderer.invoke('local-pty-rebuild', ptyId, cols, rows),
    onData: (callback: (ptyId: string, data: string) => void) => {
      const handler = (_event: any, ptyId: string, data: string) => callback(ptyId, data);
      ipcRenderer.on('local-pty-data', handler);
      return () => ipcRenderer.removeListener('local-pty-data', handler);
    },
    onClose: (callback: (ptyId: string, exitCode: number) => void) => {
      const handler = (_event: any, ptyId: string, exitCode: number) => callback(ptyId, exitCode);
      ipcRenderer.on('local-pty-close', handler);
      return () => ipcRenderer.removeListener('local-pty-close', handler);
    },
  },

  // Local file system
  localFs: {
    list: (path: string) => ipcRenderer.invoke('local-fs-list', path),
    tree: (path: string, maxDepth: number) => ipcRenderer.invoke('local-fs-tree', path, maxDepth),
    readPreview: (path: string, maxLines: number) => ipcRenderer.invoke('local-fs-read-preview', path, maxLines),
    read: (path: string, maxSizeKB: number) => ipcRenderer.invoke('local-fs-read', path, maxSizeKB),
    write: (path: string, content: string) => ipcRenderer.invoke('local-fs-write', path, content),
    rename: (dir: string, oldName: string, newName: string) => ipcRenderer.invoke('local-fs-rename', dir, oldName, newName),
    delete: (dir: string, name: string, isDir: boolean) => ipcRenderer.invoke('local-fs-delete', dir, name, isDir),
    mkdir: (dir: string, name: string) => ipcRenderer.invoke('local-fs-mkdir', dir, name),
    createFile: (dir: string, name: string) => ipcRenderer.invoke('local-fs-create-file', dir, name),
    chmod: (dir: string, name: string, octal: string) => ipcRenderer.invoke('local-fs-chmod', dir, name, octal),
    pack: (dir: string, fileNames: string[]) => ipcRenderer.invoke('local-fs-pack', dir, fileNames),
    removeTempFile: (path: string) => ipcRenderer.invoke('local-fs-remove-temp', path),
    getHomedir: () => ipcRenderer.invoke('local-fs-homedir'),
    copyFile: (src: string, dest: string) => ipcRenderer.invoke('local-fs-copy-file', src, dest),
    copyDir: (src: string, dest: string) => ipcRenderer.invoke('local-fs-copy-dir', src, dest),
  },

  // Local command execution (used by system monitor, etc.)
  localExec: (command: string) =>
    ipcRenderer.invoke('local-exec', command),
});

// SSH configuration interface
interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  proxy?: ProxyConfig;
}

// Proxy configuration interface
interface ProxyConfig {
  type: 'SOCKS5' | 'HTTP' | 'HTTPS';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

// Proxy configuration interface
interface ProxyConfig {
  type: 'SOCKS5' | 'HTTP' | 'HTTPS';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

// Tunnel configuration interface
interface TunnelConfig {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
}

// Tunnel status interface
interface TunnelStatus {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  connectionCount: number;
}

// Define TypeScript types for the exposed API
declare global {
  interface Window {
    electron: {
      getAppVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;

      // Window controls
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;

      // SSH methods
      sshConnectTest: () => Promise<{ message: string; timestamp: number }>;
      sshConnect: (config: SSHConfig) => Promise<string>;
      sshExecute: (connectionId: string, command: string, options?: { useLoginShell?: boolean }) => Promise<{ output: string; exitCode: number }>;
      sshDisconnect: (connectionId: string) => Promise<{ success: boolean }>;
      sshCreateShell: (connectionId: string, encoding?: string) => Promise<string>;
      sshCloseShell: (shellId: string) => Promise<{ success: boolean }>;
      sshShellWrite: (connectionId: string, data: string) => Promise<{ success: boolean }>;
      sshShellResize: (connectionId: string, cols: number, rows: number) => Promise<{ success: boolean }>;
      sshIsConnected: (connectionId: string) => Promise<boolean>;
      sshListDir: (connectionId: string, path: string) => Promise<string[]>;
      sshPwd: (connectionId: string) => Promise<string>;
      sshUpdateCwd: (connectionId: string, newDirectory: string) => Promise<{ success: boolean }>;
      getSessionCwd: (connectionId: string, connectionType: 'local' | 'ssh') => Promise<string | null>;
      sshFocusTerminal: (connectionId: string) => Promise<{ success: boolean }>;
      sshGetOSInfo: (connectionId: string) => Promise<{ osType: string; osVersion: string; kernel: string; shell: string } | null>;
      sendTerminalFocusGained: (connectionId: string) => void;

      // Focus event listener
      onFocusTerminal: (callback: (connectionId: string) => void) => () => void;
      onTerminalFocusGained: (callback: (connectionId: string) => void) => () => void;

      // SSH event listeners
      onShellData: (callback: (connectionId: string, data: string) => void) => () => void;
      onShellClose: (callback: (connectionId: string) => void) => () => void;
      onShellDebug: (callback: (connectionId: string, debugInfo: any) => void) => () => void;
      onSystemResumed: (callback: () => void) => () => void;

      // File transfer methods
      uploadFile: (connectionId: string, localPath: string, remotePath: string) => Promise<string>;
      downloadFile: (connectionId: string, remotePath: string, localPath: string) => Promise<string>;
      uploadDirectory: (connectionId: string, localPath: string, remotePath: string) => Promise<string>;
      downloadDirectory: (connectionId: string, remotePath: string, localPath: string) => Promise<string>;

      // File transfer event listeners
      onTransferProgress: (callback: (data: any) => void) => () => void;
      onTransferComplete: (callback: (data: any) => void) => () => void;
      onTransferStart: (callback: (data: any) => void) => () => void;
      onTransferError: (callback: (data: any) => void) => () => void;

      // Dialog methods
      showSaveDialog: (options: any) => Promise<any>;
      showOpenDialog: (options: any) => Promise<any>;

      // Tunnel methods
      tunnelStart: (connectionId: string, config: TunnelConfig) => Promise<TunnelStatus>;
      tunnelStop: (connectionId: string, tunnelId: string) => Promise<{ success: boolean }>;
      tunnelStopAll: (connectionId: string) => Promise<{ success: boolean }>;
      tunnelGetStatuses: (connectionId: string) => Promise<TunnelStatus[]>;

      // Tunnel event listeners
      onTunnelStatusUpdate: (callback: (connectionId: string, status: TunnelStatus) => void) => () => void;

      // Window management
      windowCreate: (options?: { hostToConnect?: any; localTerminal?: boolean }) => Promise<void>;
      onAutoConnect: (callback: (hostConfig: any) => void) => () => void;
      onAutoConnectLocal: (callback: () => void) => () => void;

      // Auth callback (termcat:// protocol)
      onAuthCallback: (callback: (data: { token: string; user: string }) => void) => () => void;

      // Desktop notification
      showNotification: (options: { title: string; body: string }) => Promise<void>;

      // Open external URL
      openExternal: (url: string) => Promise<void>;

      // Plugin system
      plugin: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        installFromUrl: (packageUrl: string, pluginName: string) => Promise<{ success: boolean; error?: string }>;
        uninstall: (pluginId: string) => Promise<{ success: boolean; error?: string }>;
        getSettings: (pluginId: string) => Promise<{ success: boolean; settings?: Record<string, any>; values?: Record<string, unknown>; error?: string }>;
        setSetting: (pluginId: string, key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
        onStateChanged: (callback: (data: any) => void) => () => void;
        onNotification: (callback: (data: any) => void) => () => void;
        onStatusBarUpdated: (callback: () => void) => () => void;
        onTerminalWrite: (callback: (data: { sessionId: string; data: string }) => void) => () => void;
        onTerminalExec: (callback: (data: { sessionId: string; command: string; responseChannel: string }) => void) => () => void;
        onSSHExec: (callback: (data: { sessionId: string; command: string; responseChannel: string }) => void) => () => void;
        sendResponse: (channel: string, data: any) => void;
        onPanelRegister: (callback: (data: any) => void) => () => void;
        onPanelUnregister: (callback: (data: any) => void) => () => void;
        onPanelSetData: (callback: (data: any) => void) => () => void;
        onPanelUpdateSection: (callback: (data: any) => void) => () => void;
        getLocalAgentStatus: () => Promise<{ port: number; wsUrl: string } | null>;
        onLocalAgentStarted: (callback: (data: { port: number; wsUrl: string; models?: any[] }) => void) => () => void;
        onLocalAgentStopped: (callback: () => void) => () => void;
      };

      // Log file
      log: {
        write: (line: string) => void;
        getLogDir: () => Promise<string>;
      };

      // License / device fingerprint
      license: {
        getMachineId: () => Promise<string>;
      };

      // Chat history
      chatHistory: {
        create: (header: any) => Promise<string>;
        append: (userId: string, convId: string, createdAt: number, message: any) => Promise<void>;
        appendBatch: (userId: string, convId: string, createdAt: number, messages: any[]) => Promise<void>;
        updateHeader: (userId: string, convId: string, createdAt: number, updates: any) => Promise<void>;
        list: (userId: string) => Promise<any[]>;
        load: (userId: string, fileName: string) => Promise<any | null>;
        delete: (userId: string, fileName: string) => Promise<boolean>;
      };

      // Local file system
      localFs: {
        list: (path: string) => Promise<any[]>;
        tree: (path: string, maxDepth: number) => Promise<any[]>;
        readPreview: (path: string, maxLines: number) => Promise<string>;
        read: (path: string, maxSizeKB: number) => Promise<string>;
        write: (path: string, content: string) => Promise<void>;
        rename: (dir: string, oldName: string, newName: string) => Promise<void>;
        delete: (dir: string, name: string, isDir: boolean) => Promise<void>;
        mkdir: (dir: string, name: string) => Promise<void>;
        createFile: (dir: string, name: string) => Promise<void>;
        chmod: (dir: string, name: string, octal: string) => Promise<void>;
        pack: (dir: string, fileNames: string[]) => Promise<string>;
        removeTempFile: (path: string) => Promise<void>;
        getHomedir: () => Promise<string>;
        copyFile: (src: string, dest: string) => Promise<string>;
        copyDir: (src: string, dest: string) => Promise<string>;
      };

      // Local command execution
      localExec: (command: string) => Promise<{ output: string; exitCode: number }>;

      // Local terminal
      localTerminal: {
        create: (options: { shell?: string; args?: string[]; cwd?: string; env?: Record<string, string>; cols: number; rows: number }) => Promise<{ ptyId: string }>;
        destroy: (ptyId: string) => Promise<{ success: boolean }>;
        resize: (ptyId: string, cols: number, rows: number) => Promise<{ success: boolean }>;
        getShells: () => Promise<Array<{ name: string; path: string; args?: string[] }>>;
        getDefaultShell: () => Promise<{ name: string; path: string; args?: string[] }>;
        write: (ptyId: string, data: string) => void;
        healthCheck: (ptyId: string) => Promise<boolean>;
        rebuild: (ptyId: string, cols: number, rows: number) => Promise<{ newPtyId: string } | null>;
        onData: (callback: (ptyId: string, data: string) => void) => () => void;
        onClose: (callback: (ptyId: string, exitCode: number) => void) => () => void;
      };
    };
  }
}
