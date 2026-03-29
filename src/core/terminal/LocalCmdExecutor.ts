/**
 * Local command executor
 *
 * Executes local shell commands via localExec IPC in Main process.
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';

export class LocalCmdExecutor implements ICmdExecutor {
  async execute(command: string): Promise<CmdResult> {
    if (!window.electron?.localExec) throw new Error('Local exec API not available');
    return window.electron.localExec(command);
  }
}
