/**
 * Abstract terminal backend interface
 *
 * SSH and local terminals each implement this interface independently,
 * upper-layer components only depend on this interface.
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
  /** Update backend ID after rebuild (optional, used for local PTY recovery) */
  updateId?(newId: string): Promise<void>;
}
