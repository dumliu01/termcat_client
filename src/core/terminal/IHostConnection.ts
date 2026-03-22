/**
 * Host 连接统一入口
 *
 * 能力层的组合接口，聚合终端 I/O 等基础能力。
 * SSH 和本地各自实现，上层仅持有此接口。
 */

import type { ITerminalBackend } from './ITerminalBackend';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';

export type HostConnectionType = 'ssh' | 'local';

export interface IHostConnection {
  /** 连接类型 */
  readonly type: HostConnectionType;

  /** 连接标识 */
  readonly id: string;

  /** 终端 I/O（连接断开时为 null） */
  readonly terminal: ITerminalBackend | null;

  /** 文件系统操作（连接断开时为 null） */
  readonly fsHandler: IFsHandler | null;

  /** 一次性命令执行（连接断开时为 null） */
  readonly cmdExecutor: ICmdExecutor | null;

  /** 释放所有资源 */
  dispose(): void;
}
