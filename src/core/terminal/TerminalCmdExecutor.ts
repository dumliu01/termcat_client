/**
 * Terminal command executor
 *
 * Executes commands by writing to a terminal's stdin and parsing stdout
 * using unique markers. Used when nested SSH makes the original SSH exec
 * channel unreachable — we fall back to injecting marker-wrapped commands
 * into the interactive terminal stream.
 *
 * Output suppression: accepts optional onMuteChange callback so
 * SSHHostConnection can mute xterm display during execution.
 * After the last command in a batch, absorbs the post-command shell prompt
 * before unmuting, so no extra prompts appear in the terminal.
 */

import type { ITerminalBackend } from './ITerminalBackend';
import type { ICmdExecutor, CmdResult } from './ICmdExecutor';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

const DEFAULT_TIMEOUT = 30_000;
const MARKER_PREFIX = '___TERMCAT_CMD';

/** Max time to wait for the shell prompt after the last command before force-unmuting */
const PROMPT_ABSORB_TIMEOUT = 500;

export interface TerminalCmdExecutorOptions {
  timeout?: number;
  /** Called to mute/unmute terminal display during command execution */
  onMuteChange?: (muted: boolean) => void;
  /** Register a raw data callback that bypasses display muting */
  registerRawData?: (callback: (data: string) => void) => void;
}

export class TerminalCmdExecutor implements ICmdExecutor {
  private _running = false;
  private _queue: Array<() => void> = [];
  private _dataHandler: ((data: string) => void) | null = null;
  private _timeout: number;
  private _onMuteChange?: (muted: boolean) => void;
  /** When true, the next raw data chunk is the post-command prompt — absorb it then unmute */
  private _pendingUnmute = false;
  private _pendingUnmuteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private terminal: ITerminalBackend,
    options?: TerminalCmdExecutorOptions,
  ) {
    this._timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this._onMuteChange = options?.onMuteChange;

    // Register data callback — use raw channel if available (bypasses muting),
    // otherwise fall back to public onData.
    const registerFn = options?.registerRawData ?? ((cb: (data: string) => void) => {
      this.terminal.onData(cb);
    });
    registerFn((data: string) => {
      // After the last command, absorb the shell prompt then unmute
      if (this._pendingUnmute) {
        this._pendingUnmute = false;
        if (this._pendingUnmuteTimer) {
          clearTimeout(this._pendingUnmuteTimer);
          this._pendingUnmuteTimer = null;
        }
        this._onMuteChange?.(false);
        return; // Don't pass prompt data to handler
      }
      this._dataHandler?.(data);
    });
  }

  async execute(command: string): Promise<CmdResult> {
    if (this._running) {
      await new Promise<void>((resolve) => {
        this._queue.push(resolve);
      });
    }

    this._running = true;
    try {
      return await this._executeInternal(command);
    } finally {
      this._running = false;
      const next = this._queue.shift();
      if (next) {
        // More commands queued — keep muted, start next immediately
        next();
      } else {
        // Queue empty — absorb the next data chunk (shell prompt) then unmute.
        // Safety timeout: if no prompt arrives within PROMPT_ABSORB_TIMEOUT, unmute anyway.
        this._pendingUnmute = true;
        this._pendingUnmuteTimer = setTimeout(() => {
          if (this._pendingUnmute) {
            this._pendingUnmute = false;
            this._onMuteChange?.(false);
          }
          this._pendingUnmuteTimer = null;
        }, PROMPT_ABSORB_TIMEOUT);
      }
    }
  }

  private _executeInternal(command: string): Promise<CmdResult> {
    return new Promise<CmdResult>((resolve) => {
      const id = Math.random().toString(36).substring(2, 10);
      const startMarker = `${MARKER_PREFIX}_START_${id}___`;
      const exitMarkerPattern = new RegExp(
        `${MARKER_PREFIX}_EXIT_(\\d+)_${id}___`,
      );
      const endMarker = `${MARKER_PREFIX}_END_${id}___`;

      // stty -echo suppresses input echo so the command text itself doesn't
      // appear in the output stream (prevents echoed command from being parsed as output).
      // stty echo restores normal echo after execution.
      const wrappedCommand =
        `stty -echo 2>/dev/null; echo '${startMarker}'; { ${command}; } 2>&1; echo "${MARKER_PREFIX}_EXIT_$?_${id}___"; echo '${endMarker}'; stty echo 2>/dev/null`;

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
        log.warn(
          'terminal.cmd.timeout',
          `Command timed out after ${this._timeout}ms`,
          { command, id },
        );
        settle({ output: collected, exitCode: -1 });
      }, this._timeout);

      // Install data handler
      this._dataHandler = (data: string) => {
        buffer += data;

        if (!started) {
          const startIdx = buffer.indexOf(startMarker);
          if (startIdx === -1) return;

          const afterStart = buffer.substring(
            startIdx + startMarker.length,
          );
          buffer = afterStart.startsWith('\n')
            ? afterStart.substring(1)
            : afterStart.startsWith('\r\n')
              ? afterStart.substring(2)
              : afterStart;
          started = true;
        }

        const endIdx = buffer.indexOf(endMarker);
        if (endIdx === -1) {
          collected = buffer;
          return;
        }

        const content = buffer.substring(0, endIdx);

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

        log.debug('terminal.cmd.completed', 'Command completed', {
          command,
          id,
          exitCode,
        });

        settle({ output, exitCode });
      };

      // Cancel any pending unmute from a previous command — the new command's
      // mute will cover the old prompt, so no need to absorb it separately.
      if (this._pendingUnmute) {
        this._pendingUnmute = false;
        if (this._pendingUnmuteTimer) {
          clearTimeout(this._pendingUnmuteTimer);
          this._pendingUnmuteTimer = null;
        }
      }

      // Mute terminal display, then send the command
      this._onMuteChange?.(true);
      this.terminal.write(wrappedCommand + '\n');
    });
  }
}
