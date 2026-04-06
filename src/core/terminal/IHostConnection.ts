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

  /**
   * Independent command executor for background operations (monitoring, etc.).
   * Uses a private shell channel that doesn't interfere with the user's terminal.
   * Lazy-initialized: resources are only allocated on first use.
   * null when not available (e.g., local connections, direct SSH without passthrough).
   */
  readonly monitorCmdExecutor?: ICmdExecutor | null;

  /** Release all resources */
  dispose(): void;

  /**
   * Currently effective hostname (follows nested SSH jumps).
   * Returns the nested host's name when inside a nested SSH session,
   * or null when on the original host.
   * Only used for UI display (tab title, panel headers).
   */
  readonly effectiveHostname?: string | null;

  /**
   * Subscribe to host change events (optional, SSH connections only).
   * Fires when user enters/exits a nested SSH session.
   * Only used for UI display, NOT for business logic (proxy handles routing transparently).
   * Returns unsubscribe function.
   */
  onHostChanged?(cb: (hostname: string) => void): () => void;
}
