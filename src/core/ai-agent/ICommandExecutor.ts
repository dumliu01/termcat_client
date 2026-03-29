/**
 * Command Executor Interface
 *
 * Abstract SSH command execution, supporting different execution backends:
 * - ElectronShellExecutor: Electron IPC shell execution (associated/independent SSH)
 * - DirectSSHExecutor: Direct SSH connection (reserved for non-Electron scenarios like auto_tuning)
 */

import { CommandResult } from './types';

export interface ICommandExecutor {
  /** Initialize executor (establish connection, create shell, etc.) */
  initialize(): Promise<void>;

  /** Execute command, return result */
  execute(command: string, options?: ExecuteOptions): Promise<CommandResult>;

  /** Cleanup resources (close connection, cancel listeners, etc.) */
  cleanup(): Promise<void>;

  /** Check if ready */
  isReady(): boolean;
}

/** Execution options */
export interface ExecuteOptions {
  /** Timeout in milliseconds, default 600000 (10 minutes) */
  timeoutMs?: number;
  /** sudo password */
  password?: string;
  /** Execute command in subshell to prevent exit from killing main shell causing marker loss */
  subshell?: boolean;
}
