# Multi-Window Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support iTerm2-style multiple independent windows within a single Electron process.

**Architecture:** Introduce a `WindowManager` class in the Main process that tracks all `BrowserWindow` instances and their owned resources (SSH connections, shells, PTYs, tunnels). IPC handlers use `event.sender` for natural per-window routing. Plugin Manager switches from single `mainWindow` to multi-window broadcast/targeted messaging.

**Tech Stack:** Electron 28, TypeScript 5, React 18

**Spec:** `docs/superpowers/specs/2026-03-30-multi-window-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/main/window-manager.ts` | WindowManager class: window lifecycle, resource registration, cleanup, broadcast |
| Modify | `src/main/main.ts` | Replace global `mainWindow` with WindowManager, update IPC handlers, add menu items |
| Modify | `src/plugins/plugin-manager.ts` | Replace single `mainWindow` with multi-window Map, add broadcast/targeted send |
| Modify | `src/preload/preload.ts` | Add `window.create` IPC bridge and `auto-connect` listener |
| Modify | `src/features/dashboard/components/Dashboard.tsx` | Add right-click context menu with "Open in New Window" |
| Modify | `src/base/i18n/locales/zh.ts` | Add `openInNewWindow` i18n key |
| Modify | `src/base/i18n/locales/en.ts` | Add `openInNewWindow` i18n key |
| Modify | `src/base/i18n/locales/es.ts` | Add `openInNewWindow` i18n key |
| Modify | `src/renderer/App.tsx` | Add `auto-connect` listener for new windows opened with a host |
| Modify | `src/core/ssh/ssh-manager.ts` | Remove unused `webContents` field and `setWebContents` method |

---

### Task 1: Create WindowManager

**Files:**
- Create: `src/main/window-manager.ts`

- [ ] **Step 1: Create WindowManager class**

```typescript
// src/main/window-manager.ts
import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { sshService } from '../core/ssh/ssh-manager';
import { localPtyService } from '../core/pty/local-pty-manager';
import { tunnelService } from '../core/tunnel/tunnel-manager';
import { logger, LOG_MODULE } from '../base/logger/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WindowContext {
  window: BrowserWindow;
  connectionIds: Set<string>;
  shellIds: Set<string>;
  ptyIds: Set<string>;
  tunnelConnectionIds: Set<string>;
}

export interface CreateWindowOptions {
  hostToConnect?: any; // Host type from src/utils/types/index.ts
}

export class WindowManager {
  private windows: Map<number, WindowContext> = new Map(); // key = webContents.id

  createWindow(options?: CreateWindowOptions): BrowserWindow {
    const isWin = process.platform === 'win32';

    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 500,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      titleBarStyle: isWin ? undefined : 'hiddenInset',
      frame: !isWin,
      backgroundColor: '#020617',
    });

    // Hide menu bar on Windows in production
    if (isWin && !process.env.VITE_DEV_SERVER_URL) {
      win.setMenuBarVisibility(false);
    }

    const ctx: WindowContext = {
      window: win,
      connectionIds: new Set(),
      shellIds: new Set(),
      ptyIds: new Set(),
      tunnelConnectionIds: new Set(),
    };
    this.windows.set(win.webContents.id, ctx);

    // Load content
    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Send auto-connect after page load
    if (options?.hostToConnect) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('auto-connect', options.hostToConnect);
      });
    }

    // Cleanup on close
    win.on('closed', () => {
      this.cleanupWindow(win.webContents.id);
    });

    logger.info(LOG_MODULE.MAIN, 'window.created', 'New window created', {
      webContentsId: win.webContents.id,
      hasAutoConnect: !!options?.hostToConnect,
    });

    return win;
  }

  private async cleanupWindow(webContentsId: number): Promise<void> {
    const ctx = this.windows.get(webContentsId);
    if (!ctx) return;

    logger.info(LOG_MODULE.MAIN, 'window.cleanup', 'Cleaning up window resources', {
      webContentsId,
      connections: ctx.connectionIds.size,
      shells: ctx.shellIds.size,
      ptys: ctx.ptyIds.size,
    });

    // Close shells first, then disconnect SSH
    for (const shellId of ctx.shellIds) {
      try {
        sshService.closeShell(shellId);
      } catch (e) {
        // Shell may already be closed
      }
    }

    for (const connectionId of ctx.connectionIds) {
      try {
        // Stop tunnels for this connection
        const connection = sshService.getConnection(connectionId);
        if (connection) {
          await tunnelService.stopAllTunnels(connection.client, connectionId);
        }
        await sshService.disconnect(connectionId);
      } catch (e) {
        // Connection may already be closed
      }
    }

    for (const ptyId of ctx.ptyIds) {
      try {
        localPtyService.destroy(ptyId);
      } catch (e) {
        // PTY may already be destroyed
      }
    }

    this.windows.delete(webContentsId);
  }

  // Resource registration
  registerConnection(webContentsId: number, connectionId: string): void {
    this.windows.get(webContentsId)?.connectionIds.add(connectionId);
  }

  unregisterConnection(webContentsId: number, connectionId: string): void {
    this.windows.get(webContentsId)?.connectionIds.delete(connectionId);
  }

  registerShell(webContentsId: number, shellId: string): void {
    this.windows.get(webContentsId)?.shellIds.add(shellId);
  }

  unregisterShell(webContentsId: number, shellId: string): void {
    this.windows.get(webContentsId)?.shellIds.delete(shellId);
  }

  registerPty(webContentsId: number, ptyId: string): void {
    this.windows.get(webContentsId)?.ptyIds.add(ptyId);
  }

  unregisterPty(webContentsId: number, ptyId: string): void {
    this.windows.get(webContentsId)?.ptyIds.delete(ptyId);
  }

  registerTunnelConnection(webContentsId: number, connectionId: string): void {
    this.windows.get(webContentsId)?.tunnelConnectionIds.add(connectionId);
  }

  // Queries
  getContext(webContentsId: number): WindowContext | undefined {
    return this.windows.get(webContentsId);
  }

  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).map(ctx => ctx.window);
  }

  getFocusedWindow(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow();
  }

  getFirstWindow(): BrowserWindow | null {
    const first = this.windows.values().next();
    return first.done ? null : first.value.window;
  }

  findByConnectionId(connectionId: string): WindowContext | undefined {
    for (const ctx of this.windows.values()) {
      if (ctx.connectionIds.has(connectionId)) return ctx;
    }
    return undefined;
  }

  // Broadcast to all windows
  broadcast(channel: string, ...args: any[]): void {
    for (const ctx of this.windows.values()) {
      if (!ctx.window.isDestroyed()) {
        ctx.window.webContents.send(channel, ...args);
      }
    }
  }

  // Cleanup all windows (for app quit)
  async closeAll(): Promise<void> {
    const ids = Array.from(this.windows.keys());
    for (const id of ids) {
      await this.cleanupWindow(id);
    }
  }

  get size(): number {
    return this.windows.size;
  }
}

export const windowManager = new WindowManager();
```

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client && npx tsc --noEmit src/main/window-manager.ts 2>&1 | head -20`

If there are import path issues, fix them. The file uses the same import patterns as `main.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/main/window-manager.ts
git commit -m "feat: add WindowManager class for multi-window support"
```

---

### Task 2: Remove sshService.setWebContents

**Files:**
- Modify: `src/core/ssh/ssh-manager.ts:60,114-116`
- Modify: `src/main/main.ts:137`

- [ ] **Step 1: Remove the field and method from ssh-manager.ts**

In `src/core/ssh/ssh-manager.ts`, remove line 60:
```typescript
// REMOVE this line:
private webContents: any;  // Reserved for backward compatibility
```

Remove lines 114-116:
```typescript
// REMOVE these lines:
// Set webContents for sending events to renderer (reserved for backward compatibility)
setWebContents(webContents: any) {
  this.webContents = webContents;
}
```

- [ ] **Step 2: Verify no other code references `this.webContents`**

Run: `cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client && grep -n 'this\.webContents' src/core/ssh/ssh-manager.ts`

Expected: No matches. All shell data routing uses the `webContents` parameter passed to `createShell()`.

If there ARE matches, they need to be changed to use the parameter `webContents` instead. Check the `createShell` method closure captures the parameter correctly.

- [ ] **Step 3: Remove the call in main.ts**

In `src/main/main.ts`, remove line 137:
```typescript
// REMOVE this line:
sshService.setWebContents(mainWindow.webContents);
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/core/ssh/ssh-manager.ts src/main/main.ts
git commit -m "refactor: remove unused sshService.setWebContents"
```

---

### Task 3: Refactor main.ts to Use WindowManager

**Files:**
- Modify: `src/main/main.ts`

This is the largest task. It replaces all `mainWindow` references with `windowManager` calls.

- [ ] **Step 1: Add WindowManager import and remove global mainWindow**

At the top of `src/main/main.ts`, add import:
```typescript
import { windowManager } from './window-manager';
```

Remove line 110:
```typescript
// REMOVE:
let mainWindow: BrowserWindow | null = null;
```

Remove the entire `createWindow()` function (lines 112-163) — its logic is now in `WindowManager.createWindow()`.

- [ ] **Step 2: Update auth callback (handleAuthCallback)**

Replace the `handleAuthCallback` function. Change `mainWindow` references to use focused/first window:

```typescript
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
```

- [ ] **Step 3: Update second-instance handler**

Replace the `second-instance` handler inside the `gotTheLock` block:

```typescript
app.on('second-instance', (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith('termcat://'));
  if (url) {
    handleAuthCallback(url);
  }
  // Focus most recent window
  const targetWindow = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
  if (targetWindow) {
    if (targetWindow.isMinimized()) targetWindow.restore();
    targetWindow.focus();
  }
});
```

- [ ] **Step 4: Update app.whenReady — window creation and plugin init**

Replace the section inside `app.whenReady().then(async () => { ... })`. After the menu setup:

```typescript
  chatHistoryService.registerHandlers();
  const firstWindow = windowManager.createWindow();

  // Initialize plugin system
  try {
    const pluginManager = getPluginManager();
    pluginManager.registerWindow(firstWindow);
    await pluginManager.initialize();
  } catch (err) {
    console.error('[Main] Plugin system initialization failed:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = windowManager.createWindow();
      getPluginManager().registerWindow(win);
    }
  });
```

- [ ] **Step 5: Update macOS menu**

In the menu template, update the handlers that reference `mainWindow`:

```typescript
{
  label: 'About TermCat',
  click: () => {
    const win = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
    win?.webContents.send('navigate-to', 'settings', 'help');
  },
},
```

```typescript
{
  label: 'Settings...',
  accelerator: 'Cmd+,',
  click: () => {
    const win = windowManager.getFocusedWindow() || windowManager.getFirstWindow();
    win?.webContents.send('navigate-to', 'settings');
  },
},
```

Add "New Window" to the Window menu submenu:

```typescript
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
```

- [ ] **Step 6: Update power monitor events**

Replace power event handlers to broadcast:

```typescript
powerMonitor.on('resume', () => {
  logger.info(LOG_MODULE.MAIN, 'power.resumed', 'System resumed from sleep');
  windowManager.broadcast('system-resumed');
});

powerMonitor.on('unlock-screen', () => {
  logger.info(LOG_MODULE.MAIN, 'power.screen_unlocked', 'Screen unlocked');
  windowManager.broadcast('system-resumed');
});
```

- [ ] **Step 7: Update window control IPC handlers**

Replace the three window control handlers:

```typescript
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
```

- [ ] **Step 8: Update notification handler**

Replace the notification click handler:

```typescript
ipcMain.handle('notification:show', (event, options: { title: string; body: string }) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
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
```

- [ ] **Step 9: Update file dialog handlers**

Replace `mainWindow!` with the sender's window:

```typescript
ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    return await dialog.showSaveDialog(win!, options);
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
    const win = BrowserWindow.fromWebContents(event.sender);
    return await dialog.showOpenDialog(win!, options);
  } catch (error: any) {
    logger.error(LOG_MODULE.SSH, 'dialog.open.failed', 'Open dialog failed', {
      module: LOG_MODULE.MAIN,
      error: 1,
      msg: error.message || String(error),
    });
    throw new Error(`Open dialog failed: ${error.message}`);
  }
});
```

- [ ] **Step 10: Add resource registration to SSH/PTY IPC handlers**

In `ssh-connect` handler, after `const connectionId = await sshService.connect(config);`, add:
```typescript
windowManager.registerConnection(event.sender.id, connectionId);
```

In `ssh-disconnect` handler, before the existing disconnect logic, add:
```typescript
windowManager.unregisterConnection(event.sender.id, connectionId);
```

In `ssh-create-shell` handler, after `const shellId = await sshService.createShell(...)`, add:
```typescript
windowManager.registerShell(event.sender.id, shellId);
```

In `ssh-close-shell` handler, add:
```typescript
windowManager.unregisterShell(event.sender.id, shellId);
```

In `local-pty-create` handler, after `const ptyId = localPtyService.create(...)`, add:
```typescript
windowManager.registerPty(event.sender.id, ptyId);
```

In `local-pty-destroy` handler, add:
```typescript
windowManager.unregisterPty(event.sender.id, ptyId);
```

In `tunnel-start` handler, add:
```typescript
windowManager.registerTunnelConnection(event.sender.id, connectionId);
```

- [ ] **Step 11: Update tunnel status push**

Replace the tunnel status listener:

```typescript
tunnelService.onStatusUpdate((connectionId, status) => {
  const ctx = windowManager.findByConnectionId(connectionId);
  if (ctx && !ctx.window.isDestroyed()) {
    ctx.window.webContents.send('tunnel-status-update', connectionId, status);
  }
});
```

- [ ] **Step 12: Update dev mode shortcuts**

Replace the dev tools toggle registration:

```typescript
if (process.env.VITE_DEV_SERVER_URL) {
  const toggleDevTools = () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.toggleDevTools();
    }
  };
  globalShortcut.register('F12', toggleDevTools);
  globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
}
```

Note: Move this out of `createWindow` — register once in `app.whenReady`. The `createWindow` function no longer exists.

- [ ] **Step 13: Update before-quit handler**

```typescript
app.on('before-quit', async () => {
  await windowManager.closeAll();
  const pluginManager = getPluginManager();
  await pluginManager.shutdown();
  logFileWriter.shutdown();
});
```

- [ ] **Step 14: Add new window IPC handler**

```typescript
ipcMain.handle('window:create', (_event, options?: { hostToConnect?: any }) => {
  const win = windowManager.createWindow(options);
  getPluginManager().registerWindow(win);
});
```

- [ ] **Step 15: Remove unused imports**

Remove `__filename` and `__dirname` declarations from `main.ts` (lines 107-108) since they are now in `window-manager.ts`. Also remove unused imports if `createWindow` logic is fully moved.

Check: `sshService` import is still needed for IPC handlers. `fileURLToPath` can be removed if `__filename`/`__dirname` are no longer used in main.ts.

- [ ] **Step 16: Verify build**

Run: `cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client && npx tsc --noEmit 2>&1 | head -30`

Fix any type errors.

- [ ] **Step 17: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/main/main.ts
git commit -m "refactor: replace global mainWindow with WindowManager in main process"
```

---

### Task 4: Adapt Plugin Manager for Multi-Window

**Files:**
- Modify: `src/plugins/plugin-manager.ts:41,61-66,941,945-960`

- [ ] **Step 1: Replace mainWindow field with windows Map**

In `src/plugins/plugin-manager.ts`, replace line 41:
```typescript
// REMOVE:
private mainWindow: BrowserWindow | null = null;

// ADD:
private windows: Map<number, BrowserWindow> = new Map(); // key = webContents.id
```

- [ ] **Step 2: Replace setMainWindow with registerWindow/unregisterWindow**

Replace lines 61-66:
```typescript
// REMOVE:
/** 设置主窗口引用（用于 IPC 事件推送） */
setMainWindow(win: BrowserWindow): void {
  this.mainWindow = win;
  // 补发在 mainWindow 就绪前暂存的事件
  this.flushPendingMessages();
}

// ADD:
/** Register a window for IPC event delivery */
registerWindow(win: BrowserWindow): void {
  this.windows.set(win.webContents.id, win);
  // Flush pending messages to the new window
  this.flushPendingMessagesToWindow(win);

  // Clean up when window closes
  win.on('closed', () => {
    this.windows.delete(win.webContents.id);
  });
}

unregisterWindow(webContentsId: number): void {
  this.windows.delete(webContentsId);
}
```

- [ ] **Step 3: Replace sendToRenderer with broadcastToRenderer and sendToWindow**

Replace lines 945-960:
```typescript
// REMOVE:
private sendToRenderer(channel: string, data: unknown): void {
  if (this.mainWindow && !this.mainWindow.isDestroyed()) {
    this.mainWindow.webContents.send(channel, data);
  } else {
    this.pendingRendererMessages.push({ channel, data });
  }
}

private flushPendingMessages(): void {
  if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
  for (const { channel, data } of this.pendingRendererMessages) {
    this.mainWindow.webContents.send(channel, data);
  }
  this.pendingRendererMessages = [];
}

// ADD:
private broadcastToRenderer(channel: string, data: unknown): void {
  if (this.windows.size === 0) {
    this.pendingRendererMessages.push({ channel, data });
    return;
  }
  for (const win of this.windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

private sendToWindow(webContentsId: number, channel: string, data: unknown): void {
  const win = this.windows.get(webContentsId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

private flushPendingMessagesToWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  for (const { channel, data } of this.pendingRendererMessages) {
    win.webContents.send(channel, data);
  }
  this.pendingRendererMessages = [];
}
```

- [ ] **Step 4: Update all sendToRenderer call sites**

Search for all `this.sendToRenderer(` calls in `plugin-manager.ts`. Replace each one with `this.broadcastToRenderer(` — this is safe because plugin panel registrations and status updates should reach all windows.

Run: `grep -n 'this\.sendToRenderer(' src/plugins/plugin-manager.ts`

Replace every occurrence of `this.sendToRenderer(` with `this.broadcastToRenderer(`.

- [ ] **Step 5: Verify build**

Run: `cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client && npx tsc --noEmit 2>&1 | head -30`

Fix any type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/plugins/plugin-manager.ts
git commit -m "refactor: plugin manager supports multiple windows"
```

---

### Task 5: Update Preload and Add i18n Keys

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/base/i18n/locales/zh.ts`
- Modify: `src/base/i18n/locales/en.ts`
- Modify: `src/base/i18n/locales/es.ts`

- [ ] **Step 1: Add window IPC to preload**

In `src/preload/preload.ts`, inside the `contextBridge.exposeInMainWorld('electron', { ... })` block, add a new section (alongside existing sections like `plugin`, `log`, `license`):

```typescript
  // Window management
  windowCreate: (options?: { hostToConnect?: any }) => ipcRenderer.invoke('window:create', options),

  // Auto-connect listener (for windows opened with a host)
  onAutoConnect: (callback: (hostConfig: any) => void) => {
    const handler = (_event: any, hostConfig: any) => callback(hostConfig);
    ipcRenderer.on('auto-connect', handler);
    return () => ipcRenderer.removeListener('auto-connect', handler);
  },
```

- [ ] **Step 2: Add i18n keys**

In `src/base/i18n/locales/zh.ts`, find the `dashboard` section and add:

```typescript
openInNewWindow: '在新窗口中打开',
```

In `src/base/i18n/locales/en.ts`, find the `dashboard` section and add:

```typescript
openInNewWindow: 'Open in New Window',
```

In `src/base/i18n/locales/es.ts`, find the `dashboard` section and add:

```typescript
openInNewWindow: 'Abrir en nueva ventana',
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/preload/preload.ts src/base/i18n/locales/zh.ts src/base/i18n/locales/en.ts src/base/i18n/locales/es.ts
git commit -m "feat: add window creation IPC and i18n keys for multi-window"
```

---

### Task 6: Add Right-Click Context Menu to Dashboard

**Files:**
- Modify: `src/features/dashboard/components/Dashboard.tsx`

- [ ] **Step 1: Add onContextMenu to host card**

In `src/features/dashboard/components/Dashboard.tsx`, find the host card `<div>` (around line 265-270, the `filteredHosts.map(host => (` block). Add `onContextMenu` handler to the card div:

```tsx
<div
  key={host.id}
  draggable
  onDragStart={(e) => handleDragStart(e, host.id)}
  onDragEnd={handleDragEnd}
  onContextMenu={(e) => {
    e.preventDefault();
    setContextMenu({ host, x: e.clientX, y: e.clientY });
  }}
  className={`group relative ...existing classes...`}
>
```

- [ ] **Step 2: Add context menu state and component**

Add state at the top of the Dashboard component (near other useState declarations):

```tsx
const [contextMenu, setContextMenu] = useState<{ host: Host; x: number; y: number } | null>(null);
```

Add a useEffect to close menu on click outside:

```tsx
useEffect(() => {
  if (!contextMenu) return;
  const handleClick = () => setContextMenu(null);
  window.addEventListener('click', handleClick);
  return () => window.removeEventListener('click', handleClick);
}, [contextMenu]);
```

Add the context menu JSX at the bottom of the component's return (before the closing `</div>` or `</>` of the component):

```tsx
{contextMenu && (
  <div
    className="fixed z-50 min-w-[180px] py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl backdrop-blur-xl"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={() => setContextMenu(null)}
  >
    <button
      className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 text-[var(--text-primary)]"
      onClick={() => onConnect(contextMenu.host)}
    >
      {t.dashboard.launch}
    </button>
    <button
      className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 text-[var(--text-primary)]"
      onClick={() => (window as any).electron.windowCreate({ hostToConnect: contextMenu.host })}
    >
      {t.dashboard.openInNewWindow}
    </button>
    <div className="my-1 border-t border-[var(--border-color)]" />
    <button
      className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 text-[var(--text-primary)]"
      onClick={() => { setEditingHost(contextMenu.host); setShowAddModal(true); }}
    >
      {t.common.edit}
    </button>
    <button
      className="w-full px-4 py-2 text-left text-xs hover:bg-white/5 text-rose-400"
      onClick={() => onDelete(contextMenu.host.id)}
    >
      {t.common.delete}
    </button>
  </div>
)}
```

- [ ] **Step 3: Import Host type if not already imported**

Check the file's imports. `Host` is likely already imported since the component receives it as props. Verify with: `grep 'import.*Host' src/features/dashboard/components/Dashboard.tsx`

- [ ] **Step 4: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/features/dashboard/components/Dashboard.tsx
git commit -m "feat: add host right-click context menu with 'Open in New Window'"
```

---

### Task 7: Add Auto-Connect in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add auto-connect listener**

In `src/renderer/App.tsx`, find the main component function. Add a useEffect near other effect hooks:

```tsx
// Auto-connect: handle new windows opened with a specific host
useEffect(() => {
  const cleanup = (window as any).electron.onAutoConnect((hostConfig: any) => {
    // Switch to terminal view and connect
    setViewState('terminal');
    handleConnect(hostConfig);
  });
  return cleanup;
}, []);
```

Note: `handleConnect` is the function that triggers SSH connection. Check the actual function name used in App.tsx — it may be called differently. Look for how `onConnect` prop is passed to `Dashboard`:

Run: `grep -n 'onConnect' src/renderer/App.tsx`

Use whatever function is passed as the `onConnect` prop to Dashboard.

- [ ] **Step 2: Verify the connect function is available in scope**

The auto-connect callback needs access to the same connect function that Dashboard's `onConnect` uses. Verify this function is defined in App.tsx (not inside a child component). If it's defined inside a sub-component or hook, it may need to be lifted.

- [ ] **Step 3: Commit**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client
git add src/renderer/App.tsx
git commit -m "feat: handle auto-connect for windows opened with a host"
```

---

### Task 8: Manual Testing

No automated test framework exists in this project. Test manually.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/dum/Vmware_Share/dum_dev/termcat/termcat_client && npm run dev
```

- [ ] **Step 2: Test basic multi-window**

1. App opens normally (single window, Dashboard visible)
2. Press `Cmd+N` — a second window opens with its own Dashboard
3. Both windows function independently
4. Close one window — the other remains open
5. Close all windows on macOS — app stays in Dock. Click Dock icon → new window created

- [ ] **Step 3: Test SSH connection isolation**

1. Open two windows
2. In Window 1, connect to a host → terminal opens
3. In Window 2, connect to a different host → terminal opens
4. Close Window 1 → SSH connection for Window 1 is disconnected, Window 2 unaffected
5. Window 2's terminal still works

- [ ] **Step 4: Test right-click "Open in New Window"**

1. In Dashboard, right-click a host → context menu appears
2. Click "Open in New Window" → new window opens and auto-connects to that host
3. Original window is unaffected

- [ ] **Step 5: Test AI panel**

1. Open two windows, both connect to hosts
2. Open AI panel in both windows
3. Send a question in Window 1's AI panel
4. Window 2's AI panel is unaffected (independent WebSocket)

- [ ] **Step 6: Test edge cases**

1. Notifications from Window 2 don't focus Window 1
2. File dialogs (upload/download) open attached to the correct window
3. macOS menu "Settings" opens in the focused window
4. `termcat://` protocol callback works (login flow)
