/**
 * 命令执行器接口
 *
 * 抽象 SSH 命令执行，支持不同的执行后端：
 * - ElectronShellExecutor: Electron IPC shell 执行（关联/独立 SSH）
 * - DirectSSHExecutor: 直接 SSH 连接（预留，给 auto_tuning 等非 Electron 场景）
 */

import { CommandResult } from './types';

export interface ICommandExecutor {
  /** 初始化执行器（建立连接、创建 shell 等） */
  initialize(): Promise<void>;

  /** 执行命令，返回结果 */
  execute(command: string, options?: ExecuteOptions): Promise<CommandResult>;

  /** 清理资源（关闭连接、取消监听等） */
  cleanup(): Promise<void>;

  /** 是否已就绪 */
  isReady(): boolean;
}

/** 执行选项 */
export interface ExecuteOptions {
  /** 超时时间（毫秒），默认 600000（10 分钟） */
  timeoutMs?: number;
  /** sudo 密码 */
  password?: string;
  /** 在子 shell 中执行命令，防止 exit 杀死主 shell 导致标记丢失 */
  subshell?: boolean;
}
