/**
 * SSH command executor
 *
 * Executes commands on remote server via sshExecute IPC.
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';

export class SSHCmdExecutor implements ICmdExecutor {
  constructor(private connectionId: string) {}

  async execute(command: string): Promise<CmdResult> {
    if (!window.electron) throw new Error('Electron API not available');
    return window.electron.sshExecute(this.connectionId, command);
  }
}
