/**
 * Shell Command Executor Base Class
 *
 * Encapsulates common execution logic for interactive shell:
 * - Command marker injection and detection (<<<EXIT_CODE>>>, <<<CMD_END>>>)
 * - Pager auto-exit
 * - Interactive prompt detection and response
 * - Command timeout
 *
 * Subclasses only need to implement low-level IO:
 *   writeRaw(data)       - Write data to shell
 *   setupShell()         - Establish shell connection
 *   onShellDataSetup()   - Register data listener, return unsubscribe function
 */

import { EventEmitter } from '../EventEmitter';
import { ICommandExecutor, ExecuteOptions } from '../ICommandExecutor';
import { CommandResult } from '../types';
import { buildCommandWithMarkers, extractExitCode, cleanOutputMarkers, isCommandComplete } from '../utils/markerDetector';
import { detectPager, getPagerQuitCommand } from '../utils/pagerDetector';
import { detectInteractivePrompt, detectUserTerminalInput } from '../utils/interactiveDetector';
import { buildCommandWithPassword, isSudoCommand, rewriteHeredoc, hasBalancedQuotes } from '../utils/shellCommandBuilder';

export abstract class BaseShellExecutor extends EventEmitter implements ICommandExecutor {
  protected _isReady = false;
  protected outputBuffer = '';
  protected unsubscribe: (() => void) | null = null;
  protected lastPagerQuitTime = 0;
  protected commandResolver: ((result: CommandResult) => void) | null = null;
  protected commandRejecter: ((error: Error) => void) | null = null;

  // Interactive prompt state
  protected waitingForInteraction = false;
  protected interactionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Command echo stripping state: prevent [?2004l] truncation triggering multiple times causing marker loss
  protected echoStripped = false;

  // Remote/local shell type (bash/zsh/powershell/pwsh/cmd), used to generate compatible command markers
  protected shellType: string | undefined;

  // Command timeout timer: must be cleared when command completes, prevent zombie timers cross-command pollution
  protected commandTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // The raw command string sent to shell (for fallback echo stripping when bracket paste mode is not active)
  protected lastSentCommand: string = '';

  // ==================== Subclasses Must Implement ====================

  /** Establish shell connection (connect SSH, create shell, etc.) */
  protected abstract setupShell(): Promise<void>;

  /** Write raw data to shell */
  protected abstract writeRaw(data: string): Promise<void>;

  /**
   * Register shell data listener, return unsubscribe function.
   * When data is received, call this.handleShellData(data).
   */
  protected abstract onShellDataSetup(): () => void;

  // ==================== Public Interface ====================

  async initialize(): Promise<void> {
    if (this._isReady) return;
    await this.setupShell();
    this.unsubscribe = this.onShellDataSetup();
    this._isReady = true;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    if (!this._isReady) {
      await this.initialize();
    }

    const timeoutMs = options?.timeoutMs ?? 600000;
    const isPowerShell = this.shellType === 'powershell' || this.shellType === 'pwsh';

    // Trim whitespace and newlines: AI-generated commands may have leading/trailing newlines,
    // sending to shell with leading \n causes PowerShell to enter >> continuation mode
    let finalCommand = command.trim();

    // The following processing only applies to bash/zsh etc., not needed for PowerShell
    if (!isPowerShell) {
      // heredoc transformation: must run before sudo password wrapping and marker appending,
      // otherwise heredoc terminator gets broken causing command to hang
      finalCommand = rewriteHeredoc(finalCommand) ?? finalCommand;

      // Handle sudo password
      if (options?.password && isSudoCommand(finalCommand)) {
        finalCommand = buildCommandWithPassword(finalCommand, options.password);
      }

      // Quote balance detection: AI models often generate commands like echo 'today's value',
      // unclosed quotes swallow command markers, causing bash to show > continuation prompt and hang forever.
      // Detect before adding markers, fail fast instead of letting command hang waiting for timeout.
      if (!hasBalancedQuotes(finalCommand)) {
        return Promise.reject(new Error(
          `Command has unbalanced quotes (will hang shell): ${finalCommand.substring(0, 200)}`
        ));
      }

      // Subshell wrapper: prevents AI-generated commands with exit N from killing main shell causing marker loss.
      if (options?.subshell) {
        finalCommand = `(${finalCommand})`;
      }
    }

    // Add markers (generate bash or PowerShell syntax based on shell type)
    const commandWithMarkers = buildCommandWithMarkers(finalCommand, this.shellType);

    // Clear output buffer, reset echo stripping state
    this.outputBuffer = '';
    this.echoStripped = false;
    // Store the full command with markers (minus trailing \n) for fallback echo stripping.
    // The terminal echoes the entire line including the marker suffix, not just the user command.
    this.lastSentCommand = commandWithMarkers.replace(/\n$/, '');

    // Clear zombie timers from previous command (if any)
    if (this.commandTimeoutTimer) {
      clearTimeout(this.commandTimeoutTimer);
      this.commandTimeoutTimer = null;
    }
    if (this.ctrlCTimer) {
      clearTimeout(this.ctrlCTimer);
      this.ctrlCTimer = null;
    }

    return new Promise<CommandResult>((resolve, reject) => {
      this.commandResolver = resolve;
      this.commandRejecter = reject;

      // Send command
      this.writeRaw(commandWithMarkers).catch((error) => {
        if (this.commandTimeoutTimer) {
          clearTimeout(this.commandTimeoutTimer);
          this.commandTimeoutTimer = null;
        }
        this.commandResolver = null;
        this.commandRejecter = null;
        reject(error);
      });

      // Timeout
      this.commandTimeoutTimer = setTimeout(() => {
        this.commandTimeoutTimer = null;
        if (this.commandResolver) {
          this.commandResolver = null;
          this.commandRejecter = null;
          reject(new Error(`Command execution timeout after ${timeoutMs / 1000} seconds`));
        }
      }, timeoutMs);
    });
  }

  async cleanup(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.interactionTimeout) {
      clearTimeout(this.interactionTimeout);
      this.interactionTimeout = null;
    }
    if (this.commandTimeoutTimer) {
      clearTimeout(this.commandTimeoutTimer);
      this.commandTimeoutTimer = null;
    }
    if (this.ctrlCTimer) {
      clearTimeout(this.ctrlCTimer);
      this.ctrlCTimer = null;
    }
    this._isReady = false;
    this.outputBuffer = '';
    this.commandResolver = null;
    this.commandRejecter = null;
    this.waitingForInteraction = false;
    this.echoStripped = false;
  }

  isReady(): boolean {
    return this._isReady;
  }

  /** Set shell type (bash/zsh/powershell/pwsh/cmd), affects command marker syntax */
  setShellType(shell: string): void {
    this.shellType = shell;
  }

  /** Write data directly to shell (for interactive response) */
  async writeToShell(data: string): Promise<void> {
    if (!this._isReady) {
      throw new Error('Shell not ready');
    }
    await this.writeRaw(data);
  }

  /** Send interactive response (e.g., y/n) */
  async sendInteractiveResponse(response: string): Promise<void> {
    this.waitingForInteraction = false;
    if (this.interactionTimeout) {
      clearTimeout(this.interactionTimeout);
      this.interactionTimeout = null;
    }
    await this.writeRaw(response + '\n');
  }

  // ==================== Internal: Shell Data Processing ====================

  protected handleShellData(data: string): void {
    this.outputBuffer += data;

    // Notify external of data activity (used for X-Agent mode heartbeat, reset backend timeout)
    this.emit('data:activity');

    // Clean command echo (only strip on first [?2004l] appearance per command)
    // [?2004l] is bash bracket paste mode disable signal, sent once when command starts executing.
    // Without limiting to one strip, subsequent [?2004l] occurrences (e.g., from sendInteractiveResponse injecting
    // y\n being processed by bash as new command sending again) would strip accumulated command markers, causing command to hang.
    if (!this.echoStripped && data.includes('[?2004l')) {
      const echoEndIndex = this.outputBuffer.lastIndexOf('[?2004l');
      if (echoEndIndex >= 0) {
        this.outputBuffer = this.outputBuffer.substring(echoEndIndex + 7);
        this.echoStripped = true;
      }
    }

    // Detect pager (highest priority)
    const recentOutput = this.outputBuffer.slice(-500);
    if (detectPager(recentOutput)) {
      const now = Date.now();
      if (now - this.lastPagerQuitTime > 1000) {
        const quitCommand = getPagerQuitCommand();
        this.writeRaw(quitCommand).catch(() => {});
        this.lastPagerQuitTime = now;
      }
    }

    // Detect interactive prompts
    if (!this.waitingForInteraction) {
      const fullRecentOutput = this.outputBuffer.slice(-1000);
      const prompt = detectInteractivePrompt(fullRecentOutput);
      if (prompt) {
        this.waitingForInteraction = true;
        this.emit('interactive:prompt', prompt);

        // Auto-respond with 'y' after 30 seconds
        this.interactionTimeout = setTimeout(() => {
          if (this.waitingForInteraction) {
            this.sendInteractiveResponse('y').catch(() => {});
          }
        }, 30000);
      }
    } else {
      // During wait for interaction, detect if user directly inputs in terminal
      if (detectUserTerminalInput(data, this.outputBuffer)) {
        this.waitingForInteraction = false;
        if (this.interactionTimeout) {
          clearTimeout(this.interactionTimeout);
          this.interactionTimeout = null;
        }
      }
    }

    // Detect command completion: [?2004h] appears (shell returned to prompt)
    if (isCommandComplete(this.outputBuffer) && this.commandResolver) {
      if (this.commandTimeoutTimer) {
        clearTimeout(this.commandTimeoutTimer);
        this.commandTimeoutTimer = null;
      }

      // Fallback echo stripping: when bracket paste mode is not active (e.g., independent SSH shell),
      // [?2004l] never appears so echoStripped stays false. Strip the command echo by finding the
      // sent command text in the buffer and removing everything up to the first newline after it.
      if (!this.echoStripped && this.lastSentCommand) {
        const cmdIdx = this.outputBuffer.indexOf(this.lastSentCommand);
        if (cmdIdx >= 0) {
          const afterCmd = cmdIdx + this.lastSentCommand.length;
          const newlineIdx = this.outputBuffer.indexOf('\n', afterCmd);
          if (newlineIdx >= 0) {
            this.outputBuffer = this.outputBuffer.substring(newlineIdx + 1);
          } else {
            this.outputBuffer = this.outputBuffer.substring(afterCmd);
          }
        }
      }

      const buf = this.outputBuffer;
      const ctrlCIdx = buf.lastIndexOf('^C');
      const promptIdx = buf.lastIndexOf('[?2004h');
      const isCtrlC = ctrlCIdx >= 0 && promptIdx > ctrlCIdx;

      const cleanOutput = isCtrlC
        ? cleanOutputMarkers(buf.substring(0, ctrlCIdx))
        : cleanOutputMarkers(buf);

      const result: CommandResult = {
        success: !isCtrlC,
        output: cleanOutput,
        exitCode: isCtrlC ? 130 : 0,
      };

      const resolver = this.commandResolver;
      this.commandResolver = null;
      this.commandRejecter = null;
      this.outputBuffer = '';

      resolver(result);
    }
  }
}
