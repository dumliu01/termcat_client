# TermCat Client Multi-Window Support Design

> Date: 2026-03-30
> Status: Approved
> Model: iTerm2-style — single process, multiple independent windows

---

## 1. Requirements

- Support multiple windows within a single Electron process
- Each window is fully independent: own Dashboard, terminal tabs, AI panel
- Persistent/server data (host list, auth token, settings) shared across windows
- Window creation via: menu + `Cmd+N`, Dashboard right-click "open in new window"
- Each window has its own AI WebSocket connection
- Window close = disconnect all SSH/PTY owned by that window

---

## 2. WindowManager Core

### Data Structure

```typescript
// src/main/window-manager.ts

interface WindowContext {
  window: BrowserWindow;
  connectionIds: Set<string>;       // SSH connections owned by this window
  shellIds: Set<string>;            // SSH shells owned by this window
  ptyIds: Set<string>;              // Local PTY instances owned by this window
  tunnelConnectionIds: Set<string>; // Tunnel parent connections owned by this window
}

class WindowManager {
  private windows: Map<number, WindowContext>;  // key = webContents.id

  // Lifecycle
  createWindow(options?: { hostToConnect?: HostConfig }): BrowserWindow;
  closeWindow(webContentsId: number): void;
  closeAll(): void;
  getContext(webContentsId: number): WindowContext | undefined;
  getAllWindows(): BrowserWindow[];
  getFocusedWindow(): BrowserWindow | null;

  // Resource registration (called from IPC handlers)
  registerConnection(webContentsId: number, connectionId: string): void;
  unregisterConnection(webContentsId: number, connectionId: string): void;
  registerShell(webContentsId: number, shellId: string): void;
  registerPty(webContentsId: number, ptyId: string): void;
  findByConnectionId(connectionId: string): WindowContext | undefined;

  // Broadcast (system events, power resume, etc.)
  broadcast(channel: string, ...args: any[]): void;
}
```

### Window Creation Flow

```
Cmd+N / Menu "New Window" / Right-click "Open in New Window"
  |
  v
windowManager.createWindow(options?)
  |
  v
new BrowserWindow(same webPreferences as current)
  |
  v
Load same URL (Vite dev server or index.html)
  |
  v
If hostToConnect provided -> webContents.send('auto-connect', hostConfig)
  |
  v
Register 'closed' event -> cleanup()
```

### Window Close Cleanup

```
window 'closed' event
  |
  v
Get WindowContext: all connectionIds / shellIds / ptyIds
  |
  v
Parallel cleanup:
  - sshService.closeShell(shellId)       for each shellId
  - sshService.disconnect(connectionId)  for each connectionId
  - localPtyService.destroy(ptyId)       for each ptyId
  - tunnelService.stopAllTunnels(...)    for each tunnel connection
  |
  v
pluginManager.unregisterWindow(webContentsId)
  |
  v
Remove from windows Map
```

---

## 3. Main Process Changes (main.ts)

### Removals

- `let mainWindow: BrowserWindow | null = null` global variable
- `sshService.setWebContents()` call (unused in critical paths; createShell takes webContents as parameter)

### Retained

- `requestSingleInstanceLock()` — keep single process
- `second-instance` event — protocol handling, route to focused window

### Key Changes

| Area | Current | New |
|------|---------|-----|
| `app.whenReady` | `createWindow()` | `windowManager.createWindow()` |
| `app.on('activate')` | Check `getAllWindows().length === 0` | Same logic, via windowManager |
| macOS menu | Send to `mainWindow` | Send to `windowManager.getFocusedWindow()` |
| Window menu | None | Add "New Window" + `Cmd+N` |
| Power events | `mainWindow.webContents.send` | `windowManager.broadcast(...)` |
| Notification click | `mainWindow.show()` | Focused window or first window |
| `termcat://` callback | Send to `mainWindow` | Send to focused window |
| Global shortcuts (F12) | Toggle on `mainWindow` | Toggle on `BrowserWindow.getFocusedWindow()` |

### IPC Handler Changes

Most handlers need **no changes** — `event.sender` is already the requesting window's webContents.

Handlers that need changes:

```typescript
// SSH connect: register resource ownership
ipcMain.handle('ssh-connect', async (event, config) => {
  const connectionId = await sshService.connect(config);
  windowManager.registerConnection(event.sender.id, connectionId);  // NEW
  // ...plugin logic unchanged
  return connectionId;
});

// SSH disconnect: unregister resource ownership
ipcMain.handle('ssh-disconnect', async (event, connectionId) => {
  windowManager.unregisterConnection(event.sender.id, connectionId);  // NEW
  // ...existing disconnect + plugin logic unchanged
});

// SSH shell: register ownership
ipcMain.handle('ssh-create-shell', async (event, connectionId, encoding) => {
  const shellId = await sshService.createShell(connectionId, event.sender, encoding);
  windowManager.registerShell(event.sender.id, shellId);  // NEW
  return shellId;
});

// Local PTY: register ownership
ipcMain.handle('local-pty-create', async (event, options) => {
  const ptyId = localPtyService.create({ ...options, webContents: event.sender });
  windowManager.registerPty(event.sender.id, ptyId);  // NEW
  return { ptyId };
});

// File dialogs: use requesting window as parent
ipcMain.handle('show-save-dialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return await dialog.showSaveDialog(win!, options);
});

// Window controls: operate on requesting window
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.isMaximized() ? win.unmaximize() : win?.maximize();
});
ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// Tunnel status: route to owning window
tunnelService.onStatusUpdate((connectionId, status) => {
  const ctx = windowManager.findByConnectionId(connectionId);
  ctx?.window.webContents.send('tunnel-status-update', connectionId, status);
});

// New: create window IPC
ipcMain.handle('window:create', (_event, options?) => {
  windowManager.createWindow(options);
});
```

### App Quit

```typescript
app.on('before-quit', async () => {
  windowManager.closeAll();       // Clean up all windows' resources
  await pluginManager.shutdown();
  logFileWriter.shutdown();
});
```

---

## 4. Plugin System Adaptation

### Plugin Manager Changes

```typescript
// plugin-manager.ts

// REMOVE
private mainWindow: BrowserWindow | null = null;

// ADD
private windows: Map<number, BrowserWindow> = new Map();

registerWindow(win: BrowserWindow): void {
  this.windows.set(win.webContents.id, win);
  this.flushPendingMessages(win);
}

unregisterWindow(webContentsId: number): void {
  this.windows.delete(webContentsId);
}

// Broadcast: all windows
broadcastToRenderer(channel: string, data: unknown): void {
  for (const win of this.windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

// Targeted: specific window
sendToWindow(webContentsId: number, channel: string, data: unknown): void {
  const win = this.windows.get(webContentsId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}
```

### Event Routing Strategy

| Event | Routing | Reason |
|-------|---------|--------|
| `plugin:panel-registered` | Broadcast | Plugin panels available to all windows |
| `plugin:status-changed` | Broadcast | External plugin status globally visible |
| `plugin:ssh-connect` | Targeted | SSH connection belongs to specific window |
| `plugin:terminal-open` | Targeted | Terminal belongs to specific window |
| `plugin:data-push` | Targeted | Monitor data pushed to owning window |
| `local-agent-status` | Broadcast | Local plugin status globally visible |

### Builtin Plugin Manager

No changes needed — runs in Renderer process, each window has its own instance.

---

## 5. Renderer Changes

### App.tsx

Minimal changes. Each window loads the same React app with independent state.

```typescript
// Listen for auto-connect from new window with host
useEffect(() => {
  window.electronAPI.on('auto-connect', (hostConfig) => {
    setViewState('terminal');
    connectToHost(hostConfig);
  });
}, []);
```

### localStorage

No changes needed. All keys are either:
- Read-only caches (version check) — shared harmlessly
- User preferences (AI panel visibility) — read as initial default, runtime state in React
- Persistent data (host list, auth token) — shared by design

### Preload Addition

```typescript
// preload.ts — add to window.electronAPI
window: {
  create: (options?) => ipcRenderer.invoke('window:create', options),
}
```

### Dashboard Right-Click Menu

Add to host context menu in Dashboard.tsx:

```
Connect
Open in New Window    ← NEW
Edit
Delete
```

Click handler: `window.electronAPI.window.create({ hostToConnect: host })`

---

## 6. Boundary Cases

### termcat:// Protocol

Auth callback routes to `windowManager.getFocusedWindow()`. If no focused window, route to first available. Rationale: the focused window is where the user initiated OAuth login.

### sshService.setWebContents

Remove the call and the instance field. All code paths already pass `webContents` as a parameter to `createShell()`.

### Global Shortcuts (Dev Mode)

Change F12/Ctrl+Shift+I handler to operate on `BrowserWindow.getFocusedWindow()`.

### What Does NOT Change

| Item | Reason |
|------|--------|
| Renderer state management | React state naturally isolated per window |
| AI WebSocket | Independent connection per window (confirmed) |
| Builtin plugin system | Renderer-side, independent instance per window |
| i18n | Global setting, shared harmlessly |
| Auth state | Token in localStorage, shared across windows by design |
| Preload script | Stateless bridges, no window-specific state |
| SSH/PTY/Transfer services | Already route by connectionId/ptyId, not window |
