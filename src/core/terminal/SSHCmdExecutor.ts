/**
 * SSH 命令执行器
 *
 * 通过 sshExecute IPC 在远程服务器执行命令。
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';

export class SSHCmdExecutor implements ICmdExecutor {
  constructor(private connectionId: string) {}

  async execute(command: string): Promise<CmdResult> {
    if (!window.electron) throw new Error('Electron API not available');
    return window.electron.sshExecute(this.connectionId, command);
  }
}
