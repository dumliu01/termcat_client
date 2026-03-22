/**
 * Shell 命令执行器基类
 *
 * 封装交互式 shell 的通用执行逻辑：
 * - 命令标记注入与检测（<<<EXIT_CODE>>>、<<<CMD_END>>>）
 * - 分页器自动退出
 * - 交互式提示检测与响应
 * - 命令超时
 *
 * 子类只需实现底层 IO：
 *   writeRaw(data)       - 向 shell 写入数据
 *   setupShell()         - 建立 shell 连接
 *   onShellDataSetup()   - 注册数据监听，返回 unsubscribe 函数
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

  // 交互式提示状态
  protected waitingForInteraction = false;
  protected interactionTimeout: ReturnType<typeof setTimeout> | null = null;

  // 命令回显剥离状态：防止 [?2004l] 截断多次触发导致标记丢失
  protected echoStripped = false;

  // 远程/本地 shell 类型（bash/zsh/powershell/pwsh/cmd），用于生成兼容的命令标记
  protected shellType: string | undefined;

  // 命令超时定时器：必须在命令完成时清除，防止僵尸定时器跨命令污染
  protected commandTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // ==================== 子类必须实现 ====================

  /** 建立 shell 连接（连接 SSH、创建 shell 等） */
  protected abstract setupShell(): Promise<void>;

  /** 向 shell 写入原始数据 */
  protected abstract writeRaw(data: string): Promise<void>;

  /**
   * 注册 shell 数据监听，返回 unsubscribe 函数。
   * 监听到数据后调用 this.handleShellData(data)。
   */
  protected abstract onShellDataSetup(): () => void;

  // ==================== 公共接口 ====================

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

    // 去除前后空白和换行：AI 模型生成的命令可能带前导/尾部换行符，
    // 发送到 shell 时前导 \n 会被解释为空行，导致 PowerShell 进入 >> 续行模式
    let finalCommand = command.trim();

    // 以下处理仅适用于 bash/zsh 等 Unix shell，PowerShell 不需要
    if (!isPowerShell) {
      // heredoc 转换：必须在 sudo 密码包装和标记追加之前执行，
      // 否则 heredoc 终止符会被破坏导致命令挂死
      finalCommand = rewriteHeredoc(finalCommand) ?? finalCommand;

      // 处理 sudo 密码
      if (options?.password && isSudoCommand(finalCommand)) {
        finalCommand = buildCommandWithPassword(finalCommand, options.password);
      }

      // 引号平衡检测：AI 模型常生成 echo 'today's value' 这类错误，
      // 未关闭的引号会吞掉命令标记，导致 bash 显示 > 续行提示符永远挂死。
      // 在添加标记前检测，快速失败而非让命令挂死等超时。
      if (!hasBalancedQuotes(finalCommand)) {
        return Promise.reject(new Error(
          `Command has unbalanced quotes (will hang shell): ${finalCommand.substring(0, 200)}`
        ));
      }

      // 子 shell 包裹：防止 AI 生成的命令中 exit N 杀死主 shell 导致标记丢失。
      if (options?.subshell) {
        finalCommand = `(${finalCommand})`;
      }
    }

    // 添加标记（根据 shell 类型生成 bash 或 PowerShell 语法）
    const commandWithMarkers = buildCommandWithMarkers(finalCommand, this.shellType);

    // 清空输出缓冲区，重置回显剥离状态
    this.outputBuffer = '';
    this.echoStripped = false;

    // 清除上一条命令的僵尸定时器（如果有）
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

      // 发送命令
      this.writeRaw(commandWithMarkers).catch((error) => {
        if (this.commandTimeoutTimer) {
          clearTimeout(this.commandTimeoutTimer);
          this.commandTimeoutTimer = null;
        }
        this.commandResolver = null;
        this.commandRejecter = null;
        reject(error);
      });

      // 超时
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

  /** 设置 shell 类型（bash/zsh/powershell/pwsh/cmd），影响命令标记语法 */
  setShellType(shell: string): void {
    this.shellType = shell;
  }

  /** 直接写入数据到 shell（用于交互式响应） */
  async writeToShell(data: string): Promise<void> {
    if (!this._isReady) {
      throw new Error('Shell not ready');
    }
    await this.writeRaw(data);
  }

  /** 发送交互式响应（如 y/n） */
  async sendInteractiveResponse(response: string): Promise<void> {
    this.waitingForInteraction = false;
    if (this.interactionTimeout) {
      clearTimeout(this.interactionTimeout);
      this.interactionTimeout = null;
    }
    await this.writeRaw(response + '\n');
  }

  // ==================== 内部：Shell 数据处理 ====================

  protected handleShellData(data: string): void {
    this.outputBuffer += data;

    // 通知外部有数据活动（用于 codex 模式心跳，重置后端超时）
    this.emit('data:activity');

    // 清理命令回显（只在每条命令的首次 [?2004l] 出现时截断）
    // [?2004l] 是 bash bracket paste mode disable 信号，在命令开始执行时发送一次。
    // 如果不限制只截断一次，后续出现的 [?2004l]（如 sendInteractiveResponse 注入的
    // y\n 被 bash 作为新命令处理时再次发送）会把已累积的命令标记截掉，导致命令挂死。
    if (!this.echoStripped && data.includes('[?2004l')) {
      const echoEndIndex = this.outputBuffer.lastIndexOf('[?2004l');
      if (echoEndIndex >= 0) {
        this.outputBuffer = this.outputBuffer.substring(echoEndIndex + 7);
        this.echoStripped = true;
      }
    }

    // 检测分页器（优先级最高）
    const recentOutput = this.outputBuffer.slice(-500);
    if (detectPager(recentOutput)) {
      const now = Date.now();
      if (now - this.lastPagerQuitTime > 1000) {
        const quitCommand = getPagerQuitCommand();
        this.writeRaw(quitCommand).catch(() => {});
        this.lastPagerQuitTime = now;
      }
    }

    // 检测交互式提示
    if (!this.waitingForInteraction) {
      const fullRecentOutput = this.outputBuffer.slice(-1000);
      const prompt = detectInteractivePrompt(fullRecentOutput);
      if (prompt) {
        this.waitingForInteraction = true;
        this.emit('interactive:prompt', prompt);

        // 30 秒后自动响应 'y'
        this.interactionTimeout = setTimeout(() => {
          if (this.waitingForInteraction) {
            this.sendInteractiveResponse('y').catch(() => {});
          }
        }, 30000);
      }
    } else {
      // 等待交互期间检测用户是否在终端直接输入
      if (detectUserTerminalInput(data, this.outputBuffer)) {
        this.waitingForInteraction = false;
        if (this.interactionTimeout) {
          clearTimeout(this.interactionTimeout);
          this.interactionTimeout = null;
        }
      }
    }

    // 检测命令完成：[?2004h] 出现（shell 回到 prompt）
    if (isCommandComplete(this.outputBuffer) && this.commandResolver) {
      if (this.commandTimeoutTimer) {
        clearTimeout(this.commandTimeoutTimer);
        this.commandTimeoutTimer = null;
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
