/**
 * Mock 命令执行器
 *
 * 用于 headless 模式验证和单元测试。
 * 不依赖 Electron 或 SSH，返回可配置的模拟结果。
 *
 * 使用示例：
 * ```typescript
 * const executor = new MockExecutor();
 *
 * // 添加预设响应
 * executor.addResponse('ls -la', { success: true, output: 'file1\nfile2', exitCode: 0 });
 * executor.addResponse('cat /etc/hosts', { success: true, output: '127.0.0.1 localhost', exitCode: 0 });
 *
 * // 或设置通配符默认响应
 * executor.setDefaultResponse({ success: true, output: 'mock output', exitCode: 0 });
 *
 * agent.setExecutor(executor);
 * ```
 */

import { ICommandExecutor, ExecuteOptions } from '../ICommandExecutor';
import { CommandResult } from '../types';

export interface MockExecutorConfig {
  /** 默认响应，当没有匹配的预设时使用 */
  defaultResponse?: CommandResult;
  /** 模拟执行延迟（毫秒），默认 100 */
  delayMs?: number;
  /** 是否记录执行历史 */
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

    // 模拟延迟
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // 查找精确匹配
    let result = this.responses.get(command);

    // 查找正则匹配
    if (!result) {
      for (const { pattern, result: patternResult } of this.patternResponses) {
        if (pattern.test(command)) {
          result = patternResult;
          break;
        }
      }
    }

    // 使用默认响应
    if (!result) {
      result = { ...this.defaultResponse };
    }

    // 记录历史
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

  // ==================== 配置 API ====================

  /** 添加精确匹配的命令响应 */
  addResponse(command: string, result: CommandResult): void {
    this.responses.set(command, result);
  }

  /** 添加正则匹配的命令响应 */
  addPatternResponse(pattern: RegExp, result: CommandResult): void {
    this.patternResponses.push({ pattern, result });
  }

  /** 设置默认响应 */
  setDefaultResponse(result: CommandResult): void {
    this.defaultResponse = result;
  }

  /** 设置执行延迟 */
  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  // ==================== 查询 API ====================

  /** 获取执行历史 */
  getHistory(): readonly ExecutionRecord[] {
    return this.history;
  }

  /** 获取最后一条执行记录 */
  getLastExecution(): ExecutionRecord | undefined {
    return this.history[this.history.length - 1];
  }

  /** 获取执行次数 */
  getExecutionCount(): number {
    return this.history.length;
  }

  /** 检查某个命令是否被执行过 */
  wasExecuted(command: string): boolean {
    return this.history.some(r => r.command === command);
  }

  /** 清空历史 */
  clearHistory(): void {
    this.history = [];
  }

  /** 清空所有预设响应 */
  clearResponses(): void {
    this.responses.clear();
    this.patternResponses = [];
  }

  /** 重置所有状态 */
  reset(): void {
    this.clearHistory();
    this.clearResponses();
  }
}
