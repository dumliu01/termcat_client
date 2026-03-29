/**
 * Local terminal backend
 *
 * Wraps Local PTY IPC calls, implements ITerminalBackend interface.
 */

import { ITerminalBackend } from './ITerminalBackend';
import {
  TerminalConnectOptions,
  LocalConnectOptions,
  TerminalDataCallback,
  TerminalCloseCallback,
} from './types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class LocalTerminalBackend implements ITerminalBackend {
  readonly type = 'local' as const;

  private _id: string = '';
  private _isConnected: boolean = false;
  private _dataCallbacks: TerminalDataCallback[] = [];
  private _closeCallbacks: TerminalCloseCallback[] = [];
  private _cleanupFns: (() => void)[] = [];
  private _localOptions: Partial<LocalConnectOptions>;

  get id(): string { return this._id; }
  get isConnected(): boolean { return this._isConnected; }

  constructor(options?: Partial<LocalConnectOptions>) {
    this._localOptions = options || {};
  }

  async connect(options: TerminalConnectOptions): Promise<void> {
    if (!window.electron?.localTerminal) {
      throw new Error('Local terminal API not available');
    }

    log.info('local-backend.connecting', 'LocalTerminalBackend connecting', {
      shell: this._localOptions.shell,
      cwd: this._localOptions.cwd,
    });

    const unsubData = window.electron.localTerminal.onData((ptyId, data) => {
      if (ptyId === this._id) {
        for (const cb of this._dataCallbacks) {
          cb(data);
        }
      }
    });
    this._cleanupFns.push(unsubData);

    const unsubClose = window.electron.localTerminal.onClose((ptyId) => {
      if (ptyId === this._id) {
        this._isConnected = false;
        for (const cb of this._closeCallbacks) {
          cb();
        }
      }
    });
    this._cleanupFns.push(unsubClose);

    const result = await window.electron.localTerminal.create({
      shell: this._localOptions.shell,
      args: this._localOptions.args,
      cwd: this._localOptions.cwd,
      env: this._localOptions.env,
      cols: options.cols,
      rows: options.rows,
    });

    this._id = result.ptyId;
    this._isConnected = true;

    log.info('local-backend.connected', 'LocalTerminalBackend connected', {
      pty_id: this._id,
    });
  }

  async disconnect(): Promise<void> {
    if (!window.electron?.localTerminal) return;
    if (this._id) {
      await window.electron.localTerminal.destroy(this._id);
    }
    this._isConnected = false;
    log.info('local-backend.disconnected', 'LocalTerminalBackend disconnected', {
      pty_id: this._id,
    });
  }

  write(data: string): void {
    if (!window.electron?.localTerminal || !this._id) return;
    window.electron.localTerminal.write(this._id, data);
  }

  resize(cols: number, rows: number): void {
    if (!window.electron?.localTerminal || !this._id) return;
    window.electron.localTerminal.resize(this._id, cols, rows);
  }

  /**
   * Update PTY ID after rebuild (e.g., recovery from sleep).
   * Re-registers IPC listeners for the new PTY ID.
   */
  async updateId(newPtyId: string): Promise<void> {
    // Cleanup old listeners
    for (const cleanup of this._cleanupFns) {
      cleanup();
    }
    this._cleanupFns = [];

    this._id = newPtyId;
    this._isConnected = true;

    // Re-register listeners for new PTY ID
    if (window.electron?.localTerminal) {
      const unsubData = window.electron.localTerminal.onData((ptyId, data) => {
        if (ptyId === this._id) {
          for (const cb of this._dataCallbacks) {
            cb(data);
          }
        }
      });
      this._cleanupFns.push(unsubData);

      const unsubClose = window.electron.localTerminal.onClose((ptyId) => {
        if (ptyId === this._id) {
          this._isConnected = false;
          for (const cb of this._closeCallbacks) {
            cb();
          }
        }
      });
      this._cleanupFns.push(unsubClose);
    }

    log.info('local-backend.id_updated', 'LocalTerminalBackend ID updated after rebuild', {
      new_pty_id: newPtyId,
    });
  }

  onData(callback: TerminalDataCallback): void {
    this._dataCallbacks.push(callback);
  }

  onClose(callback: TerminalCloseCallback): void {
    this._closeCallbacks.push(callback);
  }

  dispose(): void {
    for (const cleanup of this._cleanupFns) {
      cleanup();
    }
    this._cleanupFns = [];
    this._dataCallbacks = [];
    this._closeCallbacks = [];
    if (this._isConnected) {
      this.disconnect();
    }
  }
}
