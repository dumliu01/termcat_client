/**
 * 本地命令执行器
 *
 * 通过 localExec IPC 在 Main 进程执行本地 Shell 命令。
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';

export class LocalCmdExecutor implements ICmdExecutor {
  async execute(command: string): Promise<CmdResult> {
    if (!window.electron?.localExec) throw new Error('Local exec API not available');
    return window.electron.localExec(command);
  }
}
