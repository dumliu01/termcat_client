/**
 * 抽象终端后端接口
 *
 * SSH 终端和本地终端各自独立实现此接口，
 * 上层组件仅依赖此接口。
 */

import {
  TerminalBackendType,
  TerminalConnectOptions,
  TerminalDataCallback,
  TerminalCloseCallback,
} from './types';

export interface ITerminalBackend {
  readonly type: TerminalBackendType;
  readonly id: string;
  readonly isConnected: boolean;

  connect(options: TerminalConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: TerminalDataCallback): void;
  onClose(callback: TerminalCloseCallback): void;
  dispose(): void;
}
