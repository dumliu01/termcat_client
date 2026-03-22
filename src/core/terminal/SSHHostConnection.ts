/**
 * SSH Host 连接
 *
 * 组合 SSHTerminalBackend，管理 SSH 连接生命周期。
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';
import { SSHTerminalBackend } from './SSHTerminalBackend';
import { SSHFsHandler } from './SSHFsHandler';
import { SSHCmdExecutor } from './SSHCmdExecutor';
import { Host } from '@/utils/types';
import { sshService } from '@/core/ssh/sshService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class SSHHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'ssh';

  private _id: string = '';
  private _terminal: SSHTerminalBackend | null = null;
  private _fsHandler: IFsHandler | null = null;
  private _cmdExecutor: ICmdExecutor | null = null;
  private _isConnected = false;

  constructor(private host: Host) {}

  get id(): string { return this._id; }

  get terminal(): SSHTerminalBackend | null {
    return this._terminal;
  }

  get fsHandler(): IFsHandler | null {
    return this._fsHandler;
  }

  get cmdExecutor(): ICmdExecutor | null {
    return this._cmdExecutor;
  }

  async connect(): Promise<void> {
    log.info('ssh-host.connecting', 'SSHHostConnection connecting', {
      host_id: this.host.id, hostname: this.host.hostname,
    });

    const session = await sshService.connect(this.host);

    if (!session.connectionId) {
      throw new Error('SSH connection failed: no connectionId');
    }

    this._id = session.connectionId;
    this._terminal = new SSHTerminalBackend(
      session.connectionId,
      this.host.terminal?.encoding,
    );
    this._fsHandler = new SSHFsHandler(session.connectionId);
    this._cmdExecutor = new SSHCmdExecutor(session.connectionId);
    this._isConnected = true;

    log.info('ssh-host.connected', 'SSHHostConnection connected', {
      connection_id: this._id,
    });
  }

  async disconnect(): Promise<void> {
    if (this._id) {
      sshService.disconnectSession(this._id);
    }
    this._isConnected = false;
  }

  dispose(): void {
    this._terminal?.dispose();
    if (this._isConnected) {
      this.disconnect();
    }
    this._terminal = null;
  }
}
