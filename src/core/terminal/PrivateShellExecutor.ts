/**
 * Private Shell Executor
 *
 * Creates an independent extra shell on the SSH connection and (for passthrough mode)
 * SSHes to the target host through it. Implements ICmdExecutor using a marker-based
 * protocol on this private shell — completely isolated from the user's terminal.
 *
 * Used for monitoring and other background operations that should not interfere
 * with the user's interactive terminal session.
 *
 * Lazy initialization: the extra shell is only created on the first execute() call,
 * so no resources are wasted if no commands are ever executed.
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

const DEFAULT_TIMEOUT = 30_000;
const MARKER_PREFIX = '___TERMCAT_PRIV';
const INIT_TIMEOUT = 15_000;

export interface PrivateShellExecutorConfig {
  /** Base SSH connection ID */
  connectionId: string;
  /** Passthrough SSH command to reach the target host (e.g., "ssh -tt user@host\n") */
  passthroughCmd?: string;
}

export class PrivateShellExecutor implements ICmdExecutor {
  private _config: PrivateShellExecutorConfig;
  private _shellId: string;
  private _initialized = false;
  private _initializing: Promise<void> | null = null;
  private _disposed = false;
  private _dataHandler: ((data: string) => void) | null = null;
  private _unsubData: (() => void) | null = null;
  private _running = false;
  private _queue: Array<() => void> = [];

  constructor(config: PrivateShellExecutorConfig) {
    this._config = config;
    // Use __monitor suffix so main process treats this as an extra shell
    this._shellId = `${config.connectionId}__monitor`;
  }

  async execute(command: string, timeout?: number): Promise<CmdResult> {
    if (this._disposed) {
      return { output: '', exitCode: -1 };
    }

    // Lazy initialization
    if (!this._initialized) {
      if (!this._initializing) {
        this._initializing = this._initialize();
      }
      await this._initializing;
    }

    // Serial execution queue
    if (this._running) {
      await new Promise<void>(resolve => this._queue.push(resolve));
    }

    this._running = true;
    try {
      return await this._executeInternal(command, timeout ?? DEFAULT_TIMEOUT);
    } finally {
      this._running = false;
      const next = this._queue.shift();
      if (next) next();
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._dataHandler = null;

    if (this._unsubData) {
      this._unsubData();
      this._unsubData = null;
    }

    // Close the extra shell
    if (this._initialized && window.electron?.sshCloseShell) {
      window.electron.sshCloseShell(this._shellId).catch(() => { /* ignore */ });
    }

    log.info('private-shell.disposed', 'Private shell executor disposed', {
      shell_id: this._shellId,
    });
  }

  // ── Initialization ──

  private async _initialize(): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');

      log.info('private-shell.creating', 'Creating private shell for monitoring', {
        connection_id: this._config.connectionId,
        has_passthrough: !!this._config.passthroughCmd,
      });

      // Create extra shell on the SSH connection
      // Pass shellId with __monitor suffix so main process creates an independent shell
      await window.electron.sshCreateShell(this._shellId);

      // Register data listener for the created shell
      this._unsubData = window.electron.onShellData((connId: string, data: string) => {
        if (connId === this._shellId) {
          this._dataHandler?.(data);
        }
      });

      // Disable echo on the jump host shell BEFORE passthrough SSH.
      // This prevents the PTY from echoing commands back, which would
      // confuse marker detection (markers appear in echo before actual output).
      await window.electron.sshShellWrite(this._shellId, 'stty -echo\n');
      await new Promise(resolve => setTimeout(resolve, 300));

      // If passthrough mode, SSH to target through the extra shell
      if (this._config.passthroughCmd) {
        await this._connectToTarget();
      }

      this._initialized = true;
      log.info('private-shell.ready', 'Private shell ready', {
        shell_id: this._shellId,
      });
    } catch (error) {
      log.error('private-shell.init_failed', 'Failed to initialize private shell', {
        shell_id: this._shellId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Send passthrough SSH command and wait for target shell to be ready */
  private _connectToTarget(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let buffer = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this._dataHandler = null;
          // Resolve anyway — the shell might work even without detecting the prompt
          log.warn('private-shell.connect_timeout', 'Target shell ready detection timed out, proceeding anyway', {
            shell_id: this._shellId,
          });
          resolve();
        }
      }, INIT_TIMEOUT);

      // Listen for target shell ready signal (prompt or login banner)
      this._dataHandler = (data: string) => {
        if (settled) return;
        buffer += data;

        // Detect that the target shell is ready (prompt appeared or login succeeded)
        if (/Last login:|Welcome to|\$\s*$|#\s*$/m.test(buffer)) {
          settled = true;
          clearTimeout(timer);
          this._dataHandler = null;

          // Disable echo on the private shell so command text isn't echoed back.
          // Without this, the echoed command confuses marker detection (markers
          // appear in the echo before the actual output).
          window.electron.sshShellWrite(this._shellId, 'stty -echo\n');

          // Wait for stty to take effect and the prompt to settle
          setTimeout(resolve, 800);
        }
      };

      // Send the SSH passthrough command
      window.electron.sshShellWrite(this._shellId, this._config.passthroughCmd!).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this._dataHandler = null;
          reject(err);
        }
      });
    });
  }

  // ── Command execution (marker protocol, same as TerminalCmdExecutor) ──

  private _executeInternal(command: string, timeout: number): Promise<CmdResult> {
    return new Promise<CmdResult>((resolve) => {
      const id = Math.random().toString(36).substring(2, 10);
      const startMarker = `${MARKER_PREFIX}_START_${id}___`;
      const exitMarkerPattern = new RegExp(`${MARKER_PREFIX}_EXIT_(\\d+)_${id}___`);
      const endMarker = `${MARKER_PREFIX}_END_${id}___`;

      // Flatten multi-line commands to single line (newlines in monitoring commands
      // cause bash to enter continuation mode, breaking marker detection).
      // Strip trailing semicolons to avoid ;; syntax error when wrapping with { cmd; }
      const singleLineCmd = command.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim().replace(/;+$/, '');
      const wrappedCommand =
        `echo '${startMarker}'; { ${singleLineCmd}; } 2>&1; echo "${MARKER_PREFIX}_EXIT_$?_${id}___"; echo '${endMarker}'\n`;

      let buffer = '';
      let started = false;
      let collected = '';
      let exitCode = -1;
      let settled = false;

      const settle = (result: CmdResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._dataHandler = null;
        resolve(result);
      };

      const timer = setTimeout(() => {
        log.warn('private-shell.cmd_timeout', `Command timed out after ${timeout}ms`, {
          command: command.substring(0, 100), id, shell_id: this._shellId,
        });
        settle({ output: collected, exitCode: -1 });
      }, timeout);

      // Match marker at the start of a line to skip echoed command text.
      // When stty -echo fails, the command itself is echoed back and contains
      // the marker inside the echo (e.g., "echo '___MARKER___'"). The actual
      // marker output always appears at the start of a line.
      const startLinePattern = new RegExp(`(?:^|\\n)${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      const endLinePattern = new RegExp(`(?:^|\\n)${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

      this._dataHandler = (data: string) => {
        buffer += data;

        if (!started) {
          const startMatch = startLinePattern.exec(buffer);
          if (!startMatch) return;
          const markerEnd = startMatch.index + startMatch[0].length;
          const afterStart = buffer.substring(markerEnd);
          buffer = afterStart.startsWith('\n')
            ? afterStart.substring(1)
            : afterStart.startsWith('\r\n')
              ? afterStart.substring(2)
              : afterStart;
          started = true;
        }

        const endMatch = endLinePattern.exec(buffer);
        if (!endMatch) {
          collected = buffer;
          return;
        }

        const content = buffer.substring(0, endMatch.index);
        const exitMatch = content.match(exitMarkerPattern);
        if (exitMatch) {
          exitCode = parseInt(exitMatch[1], 10);
        }

        const output = content
          .replace(exitMarkerPattern, '')
          .replace(/\r/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]/g, '')
          .replace(/\n\s*$/, '')
          .replace(/^\s*\n/, '');

        settle({ output, exitCode });
      };

      // Send command to private shell
      log.debug('private-shell.cmd_sending', 'Sending command to private shell', {
        shell_id: this._shellId, command: command.substring(0, 100), id,
      });
      window.electron.sshShellWrite(this._shellId, wrappedCommand).then((result) => {
        log.debug('private-shell.cmd_write_result', 'Shell write result', {
          shell_id: this._shellId, success: result?.success, id,
        });
      }).catch((err) => {
        log.error('private-shell.cmd_write_error', 'Shell write failed', {
          shell_id: this._shellId, error: String(err), id,
        });
        settle({ output: '', exitCode: -1 });
      });
    });
  }
}
