/**
 * Local Private Shell Executor
 *
 * Creates an independent local PTY and SSHes to the target host through it.
 * Implements ICmdExecutor using marker-based protocol, completely isolated
 * from the user's terminal. Used for monitoring when SSH jump is detected
 * in a local terminal.
 *
 * Lazy initialization: PTY is only created on first execute() call.
 */

import type { ICmdExecutor, CmdResult } from './ICmdExecutor';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });
const DEFAULT_TIMEOUT = 30_000;
const MARKER_PREFIX = '___TERMCAT_LPRIV';
const INIT_TIMEOUT = 15_000;

export interface LocalPrivateShellConfig {
  /** SSH command to reach target host (e.g., "ssh dum@access.oa.zego.im") */
  sshCommand: string;
}

export class LocalPrivateShellExecutor implements ICmdExecutor {
  private _config: LocalPrivateShellConfig;
  private _ptyId: string = '';
  private _initialized = false;
  private _initializing: Promise<void> | null = null;
  private _disposed = false;
  private _dataHandler: ((data: string) => void) | null = null;
  private _unsubData: (() => void) | null = null;
  private _running = false;
  private _queue: Array<() => void> = [];

  constructor(config: LocalPrivateShellConfig) {
    this._config = config;
  }

  async execute(command: string, timeout?: number): Promise<CmdResult> {
    if (this._disposed) return { output: '', exitCode: -1 };
    if (!this._initialized) {
      if (!this._initializing) this._initializing = this._initialize();
      await this._initializing;
    }
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
    if (this._unsubData) { this._unsubData(); this._unsubData = null; }
    if (this._ptyId && window.electron?.localTerminal) {
      window.electron.localTerminal.destroy(this._ptyId).catch(() => {});
    }
    log.info('local-private-shell.disposed', 'Local private shell disposed', { pty_id: this._ptyId });
  }

  private async _initialize(): Promise<void> {
    try {
      if (!window.electron?.localTerminal) throw new Error('Local terminal API not available');

      log.info('local-private-shell.creating', 'Creating local private shell', {
        ssh_command: this._config.sshCommand,
      });

      // Create a new local PTY
      const result = await window.electron.localTerminal.create({ cols: 80, rows: 24 });
      this._ptyId = result.ptyId;

      // Register data listener
      this._unsubData = window.electron.localTerminal.onData((ptyId: string, data: string) => {
        if (ptyId === this._ptyId) {
          this._dataHandler?.(data);
        }
      });

      // Disable echo on local shell (write is fire-and-forget, not async)
      window.electron.localTerminal.write(this._ptyId, 'stty -echo\n');
      await new Promise(resolve => setTimeout(resolve, 300));

      // SSH to target host
      await this._connectToTarget();

      this._initialized = true;
      log.info('local-private-shell.ready', 'Local private shell ready', { pty_id: this._ptyId });
    } catch (error) {
      log.error('local-private-shell.init_failed', 'Failed to initialize', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private _connectToTarget(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let buffer = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this._dataHandler = null;
          log.warn('local-private-shell.connect_timeout', 'Target connection timed out, proceeding anyway');
          resolve();
        }
      }, INIT_TIMEOUT);

      this._dataHandler = (data: string) => {
        if (settled) return;
        buffer += data;
        if (/Last login:|Welcome to|\$\s*$|#\s*$/m.test(buffer)) {
          settled = true;
          clearTimeout(timer);
          this._dataHandler = null;
          // Disable echo on target shell too, then wait for it to take effect
          window.electron.localTerminal.write(this._ptyId, 'stty -echo\n');
          setTimeout(resolve, 800);
        }
      };

      // Send SSH command (write is fire-and-forget)
      window.electron.localTerminal.write(this._ptyId, this._config.sshCommand + '\n');
    });
  }

  private _executeInternal(command: string, timeout: number): Promise<CmdResult> {
    return new Promise<CmdResult>((resolve) => {
      const id = Math.random().toString(36).substring(2, 10);
      const startMarker = `${MARKER_PREFIX}_START_${id}___`;
      const exitMarkerPattern = new RegExp(`${MARKER_PREFIX}_EXIT_(\\d+)_${id}___`);
      const endMarker = `${MARKER_PREFIX}_END_${id}___`;

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
          buffer = afterStart.startsWith('\n') ? afterStart.substring(1)
            : afterStart.startsWith('\r\n') ? afterStart.substring(2) : afterStart;
          started = true;
        }
        const endMatch = endLinePattern.exec(buffer);
        if (!endMatch) { collected = buffer; return; }
        const content = buffer.substring(0, endMatch.index);
        const exitMatch = content.match(exitMarkerPattern);
        if (exitMatch) exitCode = parseInt(exitMatch[1], 10);
        const output = content
          .replace(exitMarkerPattern, '')
          .replace(/\r/g, '')
          .replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]/g, '')
          .replace(/\n\s*$/, '')
          .replace(/^\s*\n/, '');
        settle({ output, exitCode });
      };

      // Write is fire-and-forget (ipcRenderer.send, not invoke)
      window.electron.localTerminal.write(this._ptyId, wrappedCommand);
    });
  }
}
