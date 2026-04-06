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
  localTerminal?: boolean;
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
      show: false, // Don't show until content is ready (prevents black screen flash)
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      titleBarStyle: isWin ? undefined : 'hiddenInset',
      frame: !isWin,
      backgroundColor: '#020617',
    });

    // Show window after renderer content is ready (eliminates black screen)
    win.once('ready-to-show', () => {
      win.show();
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
    const webContentsId = win.webContents.id;
    this.windows.set(webContentsId, ctx);

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
    } else if (options?.localTerminal) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('auto-connect-local');
      });
    }

    // Cleanup on close — capture webContentsId before window is destroyed
    win.on('closed', () => {
      this.cleanupWindow(webContentsId);
    });

    logger.info(LOG_MODULE.MAIN, 'window.created', 'New window created', {
      webContentsId,
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
