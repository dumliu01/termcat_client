/**
 * 一次性命令执行器抽象接口
 *
 * 能力层组件，SSH 和本地各自实现。
 * 由 IHostConnection 持有，上层（SystemMonitorService 等）通过它执行命令。
 *
 * 注意：与 ai-agent 的 ICommandExecutor 不同 —
 * ICommandExecutor 是交互式 Shell 执行器（标记注入、输出解析、超时管理），
 * ICmdExecutor 是简单的一次性命令执行（exec 模式）。
 */

export interface CmdResult {
  output: string;
  exitCode: number;
}

export interface ICmdExecutor {
  /** 执行一条命令，返回输出和退出码 */
  execute(command: string): Promise<CmdResult>;
}
