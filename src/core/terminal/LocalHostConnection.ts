/**
 * Local host connection
 *
 * Composes LocalTerminalBackend. No network connection required.
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

  /** After terminal connection, sync pty ID to fsHandler to support getting terminal cwd */
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
