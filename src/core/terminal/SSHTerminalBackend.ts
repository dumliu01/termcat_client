/**
 * SSH 终端后端
 *
 * 封装现有 SSH IPC 调用，实现 ITerminalBackend 接口。
 * 不改动 ssh-service.ts，仅做调用层封装。
 */

import { ITerminalBackend } from './ITerminalBackend';
import {
  TerminalConnectOptions,
  TerminalDataCallback,
  TerminalCloseCallback,
} from './types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class SSHTerminalBackend implements ITerminalBackend {
  readonly type = 'ssh' as const;

  private _id: string = '';
  private _isConnected: boolean = false;
  private _dataCallbacks: TerminalDataCallback[] = [];
  private _closeCallbacks: TerminalCloseCallback[] = [];
  private _cleanupFns: (() => void)[] = [];
  private _encoding?: string;

  get id(): string { return this._id; }
  get isConnected(): boolean { return this._isConnected; }

  constructor(private connectionId: string, encoding?: string) {
    this._id = connectionId;
    this._encoding = encoding;
  }

  async connect(options: TerminalConnectOptions): Promise<void> {
    if (!window.electron) {
      throw new Error('Electron API not available');
    }

    log.info('ssh-backend.connecting', 'SSHTerminalBackend connecting', {
      connection_id: this.connectionId,
    });

    // 注册数据监听（必须在 createShell 之前，确保不丢失 MOTD）
    const unsubData = window.electron.onShellData((connId, data) => {
      if (connId === this.connectionId) {
        for (const cb of this._dataCallbacks) {
          cb(data);
        }
      }
    });
    this._cleanupFns.push(unsubData);

    const unsubClose = window.electron.onShellClose((connId) => {
      if (connId === this.connectionId) {
        this._isConnected = false;
        for (const cb of this._closeCallbacks) {
          cb();
        }
      }
    });
    this._cleanupFns.push(unsubClose);

    // 创建 Shell
    await window.electron.sshCreateShell(this.connectionId, this._encoding);
    this._isConnected = true;

    // 通知后端当前终端大小
    await window.electron.sshShellResize(this.connectionId, options.cols, options.rows);

    log.info('ssh-backend.connected', 'SSHTerminalBackend connected', {
      connection_id: this.connectionId,
    });
  }

  async disconnect(): Promise<void> {
    // SSH 断连由上层 sshService 管理，这里不主动调 sshDisconnect
    this._isConnected = false;
    log.info('ssh-backend.disconnected', 'SSHTerminalBackend disconnected', {
      connection_id: this.connectionId,
    });
  }

  write(data: string): void {
    if (!window.electron) return;
    window.electron.sshShellWrite(this.connectionId, data)
      .then((result) => {
        if (!result.success) {
          log.error('ssh-backend.write_failed', 'Failed to write', {
            error: 3001, connection_id: this.connectionId,
          });
        }
      })
      .catch((error) => {
        log.error('ssh-backend.write_error', 'Error writing', {
          error: 3002, details: error instanceof Error ? error.message : 'Unknown',
          connection_id: this.connectionId,
        });
      });
  }

  resize(cols: number, rows: number): void {
    if (!window.electron) return;
    window.electron.sshShellResize(this.connectionId, cols, rows);
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
      this._isConnected = false;
    }
  }
}
