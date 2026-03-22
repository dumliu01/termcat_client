/**
 * 本地 Host 连接
 *
 * 组合 LocalTerminalBackend。无需建立网络连接。
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';
import { LocalTerminalBackend } from './LocalTerminalBackend';
import { LocalFsHandler } from './LocalFsHandler';
import { LocalCmdExecutor } from './LocalCmdExecutor';
import { Host } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class LocalHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'local';

  private _id: string;
  private _terminal: LocalTerminalBackend;
  private _fsHandler: LocalFsHandler;
  private _cmdExecutor: ICmdExecutor;

  constructor(private host: Host) {
    this._id = `local-${Date.now()}`;
    this._terminal = new LocalTerminalBackend({
      shell: host.localConfig?.shell,
      cwd: host.localConfig?.cwd,
      env: host.localConfig?.env,
    });
    this._fsHandler = new LocalFsHandler();
    this._cmdExecutor = new LocalCmdExecutor();
  }

  get id(): string { return this._id; }
  get terminal(): LocalTerminalBackend { return this._terminal; }
  get fsHandler(): IFsHandler { return this._fsHandler; }
  get cmdExecutor(): ICmdExecutor { return this._cmdExecutor; }

  /** 终端连接后，将 pty ID 同步到 fsHandler 以支持获取终端 cwd */
  updatePtyId(ptyId: string): void {
    this._id = ptyId;
    this._fsHandler.setConnectionId(ptyId);
  }

  dispose(): void {
    log.info('local-host.disposing', 'LocalHostConnection disposing', {
      id: this._id,
    });
    this._terminal.dispose();
  }
}
