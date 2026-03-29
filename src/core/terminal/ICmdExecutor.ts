/**
 * One-time command executor abstraction interface
 *
 * Capability layer component, SSH and local implementations.
 * Held by IHostConnection, upper layers (SystemMonitorService etc.) execute commands through it.
 *
 * Note: Different from ai-agent's ICommandExecutor —
 * ICommandExecutor is an interactive shell executor (tag injection, output parsing, timeout management),
 * ICmdExecutor is a simple one-time command execution (exec mode).
 */

export interface CmdResult {
  output: string;
  exitCode: number;
}

export interface ICmdExecutor {
  /** Execute a command, return output and exit code */
  execute(command: string): Promise<CmdResult>;
}
