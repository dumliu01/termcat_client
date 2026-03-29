/**
 * Unified entry point for Host connections
 *
 * Capability layer composition interface, aggregating terminal I/O and other basic capabilities.
 * SSH and local implementations each hold this interface for upper layers.
 */

import type { ITerminalBackend } from './ITerminalBackend';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';

export type HostConnectionType = 'ssh' | 'local';

export interface IHostConnection {
  /** Connection type */
  readonly type: HostConnectionType;

  /** Connection identifier */
  readonly id: string;

  /** Terminal I/O (null when disconnected) */
  readonly terminal: ITerminalBackend | null;

  /** File system operations (null when disconnected) */
  readonly fsHandler: IFsHandler | null;

  /** One-time command execution (null when disconnected) */
  readonly cmdExecutor: ICmdExecutor | null;

  /** Release all resources */
  dispose(): void;
}
