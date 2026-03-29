/**
 * Mock Command Executor
 *
 * Used for headless mode verification and unit testing.
 * Does not depend on Electron or SSH, returns configurable mock results.
 *
 * Usage example:
 * ```typescript
 * const executor = new MockExecutor();
 *
 * // Add preset responses
 * executor.addResponse('ls -la', { success: true, output: 'file1\nfile2', exitCode: 0 });
 * executor.addResponse('cat /etc/hosts', { success: true, output: '127.0.0.1 localhost', exitCode: 0 });
 *
 * // Or set wildcard default response
 * executor.setDefaultResponse({ success: true, output: 'mock output', exitCode: 0 });
 *
 * agent.setExecutor(executor);
 * ```
 */

import { ICommandExecutor, ExecuteOptions } from '../ICommandExecutor';
import { CommandResult } from '../types';

export interface MockExecutorConfig {
  /** Default response, used when no matching preset exists */
  defaultResponse?: CommandResult;
  /** Mock execution delay in milliseconds, default 100 */
  delayMs?: number;
  /** Whether to record execution history */
  recordHistory?: boolean;
}

export interface ExecutionRecord {
  command: string;
  options?: ExecuteOptions;
  result: CommandResult;
  timestamp: number;
}

export class MockExecutor implements ICommandExecutor {
  private responses: Map<string, CommandResult> = new Map();
  private patternResponses: Array<{ pattern: RegExp; result: CommandResult }> = [];
  private defaultResponse: CommandResult;
  private delayMs: number;
  private _isReady = false;
  private history: ExecutionRecord[] = [];
  private recordHistory: boolean;

  constructor(config?: MockExecutorConfig) {
    this.defaultResponse = config?.defaultResponse ?? {
      success: true,
      output: '',
      exitCode: 0,
    };
    this.delayMs = config?.delayMs ?? 100;
    this.recordHistory = config?.recordHistory ?? true;
  }

  async initialize(): Promise<void> {
    this._isReady = true;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    if (!this._isReady) {
      throw new Error('MockExecutor not initialized. Call initialize() first.');
    }

    // Mock delay
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // Find exact match
    let result = this.responses.get(command);

    // Find regex match
    if (!result) {
      for (const { pattern, result: patternResult } of this.patternResponses) {
        if (pattern.test(command)) {
          result = patternResult;
          break;
        }
      }
    }

    // Use default response
    if (!result) {
      result = { ...this.defaultResponse };
    }

    // Record history
    if (this.recordHistory) {
      this.history.push({
        command,
        options,
        result: { ...result },
        timestamp: Date.now(),
      });
    }

    return { ...result };
  }

  async cleanup(): Promise<void> {
    this._isReady = false;
  }

  isReady(): boolean {
    return this._isReady;
  }

  // ==================== Configuration API ====================

  /** Add exact-match command response */
  addResponse(command: string, result: CommandResult): void {
    this.responses.set(command, result);
  }

  /** Add regex-match command response */
  addPatternResponse(pattern: RegExp, result: CommandResult): void {
    this.patternResponses.push({ pattern, result });
  }

  /** Set default response */
  setDefaultResponse(result: CommandResult): void {
    this.defaultResponse = result;
  }

  /** Set execution delay */
  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  // ==================== Query API ====================

  /** Get execution history */
  getHistory(): readonly ExecutionRecord[] {
    return this.history;
  }

  /** Get last execution record */
  getLastExecution(): ExecutionRecord | undefined {
    return this.history[this.history.length - 1];
  }

  /** Get execution count */
  getExecutionCount(): number {
    return this.history.length;
  }

  /** Check if a command was executed */
  wasExecuted(command: string): boolean {
    return this.history.some(r => r.command === command);
  }

  /** Clear history */
  clearHistory(): void {
    this.history = [];
  }

  /** Clear all preset responses */
  clearResponses(): void {
    this.responses.clear();
    this.patternResponses = [];
  }

  /** Reset all state */
  reset(): void {
    this.clearHistory();
    this.clearResponses();
  }
}
