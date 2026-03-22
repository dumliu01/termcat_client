/**
 * AI Agent 核心类
 *
 * 事件驱动的状态机，处理 AI WebSocket 协议。
 * 无 UI 依赖，通过 EventEmitter 将所有状态变更和交互请求通知外部。
 *
 * 逻辑提取自：
 * - useAIMessageHandler.ts → 消息处理状态机
 * - useCommandExecution.ts → 命令执行流程
 * - useAIOpsState.ts → 状态管理
 */

import { EventEmitter } from './EventEmitter';
import {
  AIMessage,
  AIMessageType,
  AIAgentConfig,
  AIAgentStatus,
  AIAgentEvents,
  AIAgentMode,
  CommandResult,
  OperationStep,
  ChoiceData,
  TokenUsage,
  StepDetailEvent,
  RiskLevel,
  AttachedFile,
} from './types';
import { AIAgentConnection } from './AIAgentConnection';
import { ICommandExecutor, ExecuteOptions } from './ICommandExecutor';
import { isSudoCommand, buildCommandWithPassword, rewriteHeredoc } from './utils/shellCommandBuilder';

/** 运维关键字列表，用于 normal 模式下检测是否应建议切换 agent 模式 */
const OPS_KEYWORDS = [
  'sudo', 'systemctl', 'service', 'docker', 'nginx', 'apache',
  'mysql', 'postgresql', 'redis', 'mongodb', 'kubernetes', 'k8s',
  'deploy', 'restart', 'stop', 'start', 'status', 'logs', 'tail',
  'grep', 'awk', 'sed', 'ps', 'top', 'netstat', 'ss', 'iptables',
  'firewall', 'ufw', 'selinux', 'chmod', 'chown', 'mount', 'umount',
  'disk', 'memory', 'cpu', 'load', 'performance', 'monitor',
  '执行步骤', '运维操作', '运维任务', 'bash', 'shell',
];

/** 生成唯一消息 ID */
let messageIdCounter = 0;
function generateId(): string {
  return `agent_${Date.now()}_${++messageIdCounter}`;
}

export class AIAgent extends EventEmitter {
  private connection: AIAgentConnection;
  private executor: ICommandExecutor | null = null;
  private config: AIAgentConfig;
  private _status: AIAgentStatus = 'idle';
  private _taskId: string | null = null;
  private frontendTaskId: string | null = null;
  private unsubscribeMessage: (() => void) | null = null;

  // 累积的回答内容（用于流式消息合并）
  private accumulatedContent = '';

  // 自动模式标志
  private autoExecuteEnabled = false;
  private autoChoiceEnabled = false;

  // 密码缓存（用于自动执行模式）
  private cachedPassword: string | null = null;

  constructor(connection: AIAgentConnection, config: AIAgentConfig) {
    super();
    this.connection = connection;
    this.config = { ...config };

    // 任务级连接：所有消息都是自己的，直接用 onMessage
    this.unsubscribeMessage = this.connection.onMessage((msg) => this.handleMessage(msg));
  }

  // ==================== 核心 API ====================

  /** 设置命令执行器 */
  setExecutor(executor: ICommandExecutor): void {
    this.executor = executor;
  }

  /** 发送提问 */
  ask(prompt: string, files?: AttachedFile[]): void {
    // 生成前端任务 ID
    this.frontendTaskId = generateId();
    this.accumulatedContent = '';
    this._taskId = null;

    this.setStatus('thinking');

    this.connection.sendQuestion(prompt, {
      model: this.config.model,
      mode: this.config.mode,
      sshMode: this.config.sshMode,
      hostId: this.config.hostId,
      sessionId: this.config.sessionId,
      uiLanguage: this.config.language,
      osType: this.config.osType,
      osVersion: this.config.osVersion,
      shell: this.config.shell,
      files,
    });
  }

  /** 停止当前任务（任务级连接下，外部会直接关闭连接） */
  stop(): void {
    this.setStatus('idle');
    this._taskId = null;
    this.frontendTaskId = null;
  }

  /** 更新配置 */
  configure(config: Partial<AIAgentConfig>): void {
    Object.assign(this.config, config);
  }

  /** 销毁，清理所有资源 */
  destroy(): void {
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }
    this.removeAllListeners();
  }

  // ==================== 人机交互 API ====================

  /** 确认执行命令（用户点击"执行"后调用） */
  async confirmExecute(stepIndex: number, command: string, password?: string, taskId?: string): Promise<void> {
    // 如果外部传入了 taskId（例如 sshMode 切换后 agent 重建，_taskId 丢失），优先恢复
    if (taskId && !this._taskId) {
      this._taskId = taskId;
    }
    if (!this._taskId) return;

    this.setStatus('thinking');

    try {
      let result: CommandResult;

      if (this.executor) {
        // heredoc 转换（必须在密码包装前执行，否则引号嵌套崩坏）
        let finalCommand = rewriteHeredoc(command) ?? command;

        // 处理密码
        if (password && isSudoCommand(finalCommand)) {
          finalCommand = buildCommandWithPassword(finalCommand, password);
        }

        result = await this.executor.execute(finalCommand);
      } else {
        // 没有 executor，通知外部处理
        // 外部应该监听 execute:request 事件并调用 submitExecuteResult
        return;
      }

      this.submitExecuteResult(stepIndex, command, result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.submitExecuteResult(stepIndex, command, {
        success: false,
        output: '',
        exitCode: -1,
      }, errorMsg);
    }
  }

  /** 提交执行结果（当外部自行执行命令后调用） */
  submitExecuteResult(stepIndex: number, command: string, result: CommandResult, error?: string): void {
    if (!this._taskId) return;

    const errorMessage = error || (!result.success ? `Exit code: ${result.exitCode}\n\nOutput:\n${result.output}` : undefined);

    this.connection.confirmExecute(
      this._taskId,
      stepIndex,
      {
        command,
        success: result.success,
        output: result.output,
        error: errorMessage,
      },
      { sessionId: this.config.sessionId, mode: this.config.mode }
    );
  }

  /** 取消执行命令 — 向终端发送 Ctrl+C 中断正在执行的命令，任务继续 */
  cancelExecute(stepIndex: number): void {
    if (!this._taskId) return;

    // 只向 shell 发送 Ctrl+C（\x03）中断当前命令
    // executor 的 handleShellData 检测到 ^C + [?2004h → resolve 为失败
    // 失败结果通过 EXECUTE_RESULT 发回服务端 → AI 看到命令被中断，决定下一步
    // 不发 cancel_execute 到服务端，避免整个任务被取消
    if (this.executor) {
      this.executor.writeToShell('\x03').catch(() => {});
    }
  }

  /** 发送用户选择 */
  sendUserChoice(stepIndex: number, choice: string, customInput?: string): void {
    if (!this._taskId) return;
    this.connection.sendUserChoice(this._taskId, stepIndex, choice, { customInput });
    this.setStatus('thinking');
  }

  /** 取消用户选择 */
  cancelUserChoice(stepIndex: number): void {
    if (!this._taskId) return;
    this.connection.sendUserChoice(this._taskId, stepIndex, '', { cancelled: true });
    this.setStatus('idle');
  }

  // ==================== 自动模式 API（headless 使用） ====================

  /** 启用自动确认执行 */
  enableAutoExecute(): void {
    this.autoExecuteEnabled = true;
  }

  /** 禁用自动确认执行 */
  disableAutoExecute(): void {
    this.autoExecuteEnabled = false;
  }

  /** 启用自动选择（收到 user_choice_request 自动选 recommended） */
  enableAutoChoice(): void {
    this.autoChoiceEnabled = true;
  }

  /** 禁用自动选择 */
  disableAutoChoice(): void {
    this.autoChoiceEnabled = false;
  }

  /** 设置密码缓存（用于自动执行 sudo 命令） */
  setPassword(password: string): void {
    this.cachedPassword = password;
  }

  // ==================== 状态查询 ====================

  getStatus(): AIAgentStatus {
    return this._status;
  }

  getTaskId(): string | null {
    return this._taskId;
  }

  getConfig(): Readonly<AIAgentConfig> {
    return { ...this.config };
  }

  // ==================== 内部：消息处理状态机 ====================

  private handleMessage(message: AIMessage): void {
    // 任务级连接：所有消息都是自己的，只需基本过滤
    if (!this.frontendTaskId) return;

    // 首次收到 server 返回的 task_id → 记录
    if (message.task_id && !this._taskId) {
      this._taskId = message.task_id;
      this.emit('task:start', message.task_id);
    }

    switch (message.type) {
      case AIMessageType.ANSWER:
        this.handleAnswerMessage(message);
        break;
      case AIMessageType.COMMAND:
        this.handleCommandMessage(message);
        break;
      case AIMessageType.OPERATION_PLAN:
        this.handleOperationPlanMessage(message);
        break;
      case AIMessageType.OPERATION_STEP:
        this.handleOperationStepMessage(message);
        break;
      case AIMessageType.STEP_DETAIL:
        this.handleStepDetailMessage(message);
        break;
      case AIMessageType.EXECUTE_REQUEST:
        this.handleExecuteRequestMessage(message);
        break;
      case AIMessageType.EXECUTE_CANCEL:
        this.handleExecuteCancelMessage(message);
        break;
      case AIMessageType.USER_CHOICE_REQUEST:
        this.handleUserChoiceRequestMessage(message);
        break;
      case AIMessageType.TOOL_PERMISSION_REQUEST:
        this.handleToolPermissionRequestMessage(message);
        break;
      case AIMessageType.USER_FEEDBACK_REQUEST:
        this.handleUserFeedbackRequestMessage(message);
        break;
      case AIMessageType.TOOL_USE:
        this.handleToolUseMessage(message);
        break;
      case AIMessageType.TOOL_RESULT:
        this.handleToolResultMessage(message);
        break;
      case AIMessageType.TOKEN_USAGE:
        this.handleTokenUsageMessage(message);
        break;
      case AIMessageType.COMPLETE:
        this.handleCompleteMessage(message);
        break;
      case AIMessageType.ERROR:
        this.handleErrorMessage(message);
        break;
    }
  }

  /** 处理 ANSWER 消息（流式文本回复） */
  private handleAnswerMessage(message: AIMessage): void {
    this.setStatus('generating');
    this.accumulatedContent += message.content || '';

    this.emit('answer:chunk', message.content || '', !!message.is_complete);

    if (message.is_complete) {
      this.emit('answer:complete', this.accumulatedContent);

      if (this.config.mode === 'normal') {
        this.setStatus('idle');
        this._taskId = null;

        // 检测运维关键字
        this.detectOpsKeywords(this.accumulatedContent);
      }
    }
  }

  /** 处理 COMMAND 消息（命令建议） */
  private handleCommandMessage(message: AIMessage): void {
    this.emit('command:suggestion', {
      command: message.command || '',
      explanation: message.explanation || '',
      risk: message.risk || 'medium',
    });
    this.setStatus('idle');
  }

  /** 处理 OPERATION_PLAN 消息 */
  private handleOperationPlanMessage(message: AIMessage): void {
    this.setStatus('generating');

    if (message.task_id) {
      this._taskId = message.task_id;
    }

    this.emit('plan', message.plan || [], message.description || '', message.task_id || '');
  }

  /** 处理 OPERATION_STEP 消息（更新步骤状态） */
  private handleOperationStepMessage(message: AIMessage): void {
    if (message.step_index !== undefined) {
      this.emit('step:update', message.step_index, message.status as any);
    }
  }

  /** 处理 STEP_DETAIL 消息 */
  private handleStepDetailMessage(message: AIMessage): void {
    const detail: StepDetailEvent = {
      taskId: message.task_id || '',
      stepIndex: message.step_index ?? 0,
      description: message.description || '',
      command: message.command,
      risk: message.risk,
      status: message.status || '',
      output: message.output,
      success: message.success,
      retryAttempt: message.retry_attempt,
      autoExecute: message.auto_execute,
    };

    // 当步骤等待用户确认时，切换到 waiting_user 状态
    // （持久连接模式下，不再依赖 COMPLETE("等待命令执行...") 来切换状态）
    if (detail.status === 'waiting_confirm' && detail.command) {
      this.setStatus('waiting_user');
    }

    this.emit('step:detail', detail.stepIndex, detail);
  }

  /** 处理 EXECUTE_REQUEST 消息（请求执行命令） */
  private handleExecuteRequestMessage(message: AIMessage): void {
    // Code / Codex 模式：remote_terminal_proxy 发来的执行请求（有 execution_id）
    if (message.execution_id) {
      console.log('[AIAgent] handleCodeModeExecuteRequest:', message.execution_id, message.tool_input?.command?.substring(0, 50));
      this.handleCodeModeExecuteRequest(message);
      return;
    }

    // Agent 模式：常规执行请求
    const stepIndex = message.step_index ?? 0;
    const command = message.command || '';
    const risk = message.risk || 'medium';
    const description = message.description || '';
    const taskId = message.task_id || '';

    if (message.task_id) {
      this._taskId = message.task_id;
    }

    // 自动执行模式
    if (this.autoExecuteEnabled && this.executor) {
      this.setStatus('thinking');
      this.confirmExecute(stepIndex, command, this.cachedPassword || undefined).catch(() => {});
      return;
    }

    // 非自动模式：通知外部
    this.setStatus('waiting_user');
    this.emit('execute:request', stepIndex, command, risk, description, taskId);
  }

  /** 处理 Code 模式远程执行请求（来自 remote_terminal_proxy） */
  private async handleCodeModeExecuteRequest(message: AIMessage): Promise<void> {
    const executionId = message.execution_id!;
    const toolInput = message.tool_input || {};
    const command = toolInput.command || '';

    if (!command || !this.executor) {
      this.connection.sendExecuteResult(executionId, {
        success: false,
        output: '',
        exitCode: -1,
        error: !command ? 'No command in execute_request' : 'No executor available',
      });
      return;
    }

    // 设置活动心跳：executor 收到 SSH 数据时通知后端重置超时
    let lastHeartbeat = 0;
    const HEARTBEAT_INTERVAL = 10_000; // 每 10 秒最多发一次心跳
    const onActivity = () => {
      const now = Date.now();
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        lastHeartbeat = now;
        this.connection.sendExecuteActivity(executionId);
      }
    };
    this.executor.on('data:activity', onActivity);

    try {
      // heredoc 转换
      let finalCommand = rewriteHeredoc(command) ?? command;

      // 密码处理
      if (this.cachedPassword && isSudoCommand(finalCommand)) {
        finalCommand = buildCommandWithPassword(finalCommand, this.cachedPassword);
      }

      const result = await this.executor.execute(finalCommand);

      this.connection.sendExecuteResult(executionId, {
        success: result.success,
        output: result.output,
        exitCode: result.exitCode,
        error: result.success ? undefined : `Exit code: ${result.exitCode}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.connection.sendExecuteResult(executionId, {
        success: false,
        output: '',
        exitCode: -1,
        error: errorMsg,
      });
    } finally {
      this.executor.off('data:activity', onActivity);
    }
  }

  /** 处理 EXECUTE_CANCEL 消息（后端命令超时，需要中断 SSH 会话恢复 shell） */
  private handleExecuteCancelMessage(message: AIMessage): void {
    console.log('[AIAgent] handleExecuteCancelMessage: execution timed out, sending Ctrl+C', message.execution_id);
    if (this.executor) {
      // 发送两次 Ctrl+C 确保中断（处理嵌套命令场景如 sudo 等待密码）
      this.executor.writeToShell('\x03').catch(() => {});
      setTimeout(() => {
        this.executor?.writeToShell('\x03').catch(() => {});
      }, 200);
    }
  }

  /** 处理 USER_CHOICE_REQUEST 消息 */
  private handleUserChoiceRequestMessage(message: AIMessage): void {
    const stepIndex = message.step_index ?? 0;
    const taskId = message.task_id || '';

    if (message.task_id) {
      this._taskId = message.task_id;
    }

    const choiceData: ChoiceData = {
      issue: message.issue || '',
      question: message.question || '',
      options: message.options || [],
      allowCustomInput: message.allow_custom_input || false,
      customInputPlaceholder: message.custom_input_placeholder,
      context: message.context,
    };

    // 自动选择模式
    if (this.autoChoiceEnabled) {
      const recommended = choiceData.options.find(o => o.recommended);
      const choice = recommended?.value || choiceData.options[0]?.value || '';
      this.sendUserChoice(stepIndex, choice);
      return;
    }

    // 非自动模式：通知外部
    this.setStatus('waiting_user');
    this.emit('choice:request', stepIndex, choiceData, taskId);
  }

  /** 处理 TOKEN_USAGE 消息 */
  private handleTokenUsageMessage(message: AIMessage): void {
    const usage: TokenUsage = {
      inputTokens: message.input_tokens || 0,
      outputTokens: message.output_tokens || 0,
      totalTokens: message.total_tokens || 0,
      costGems: message.cost_gems || 0,
      showTokens: message.show_tokens,
      showGems: message.show_gems,
    };
    this.emit('token:usage', usage);
  }

  /** 处理 COMPLETE 消息 */
  private handleCompleteMessage(message: AIMessage): void {
    this.setStatus('idle');
    this._taskId = null;

    // 在 COMPLETE 时也检测运维关键字
    if (this.config.mode === 'normal' && this.accumulatedContent) {
      this.detectOpsKeywords(this.accumulatedContent);
    }

    this.emit('task:complete', message.summary || '', message.stats?.gems_remaining);
    this.accumulatedContent = '';
  }

  /** 处理 ERROR 消息 */
  private handleErrorMessage(message: AIMessage): void {
    this.setStatus('idle');
    this._taskId = null;
    this.emit('task:error', message.error || 'Unknown error', message.code);
    this.accumulatedContent = '';
  }

  /** 处理 TOOL_PERMISSION_REQUEST 消息（Code 模式工具权限请求） */
  private handleToolPermissionRequestMessage(message: AIMessage): void {
    const permissionId = message.permission_id || '';
    const toolName = message.tool_name || '';
    const toolInput = message.tool_input || {};
    const taskId = message.task_id || '';
    const toolUseId = message.tool_use_id || '';
    const risk = (message as any).risk as string | undefined;
    const description = (message as any).description as string | undefined;

    this.setStatus('waiting_user');
    this.emit('tool:permission_request', permissionId, toolName, toolInput, taskId, toolUseId, risk, description);
  }

  /** 处理 USER_FEEDBACK_REQUEST 消息（Code 模式任务完成后反馈请求） */
  private handleUserFeedbackRequestMessage(message: AIMessage): void {
    const taskId = message.task_id || '';

    this.setStatus('waiting_user');
    this.emit('feedback:request', taskId);
  }

  // ==================== 工具权限和反馈 API ====================

  /** 批准工具执行 */
  approveToolPermission(permissionId: string): void {
    this.connection.sendToolPermissionResponse(permissionId, true);
    this.setStatus('thinking');
  }

  /** 拒绝工具执行 */
  denyToolPermission(permissionId: string, reason?: string): void {
    this.connection.sendToolPermissionResponse(permissionId, false, reason);
    this.setStatus('thinking');
  }

  /** 发送用户反馈（完成） */
  acceptFeedback(): void {
    if (!this._taskId) return;
    try {
      this.connection.sendUserFeedbackResponse(this._taskId, 'accept');
      this.setStatus('thinking');
    } catch {
      // WebSocket 已断开（服务端可能已关闭连接），本地完成任务
      this.setStatus('idle');
      this._taskId = null;
      this.emit('task:complete', '', undefined);
    }
  }

  /** 发送用户反馈（继续 + 新指令） */
  continueFeedback(message: string): void {
    if (!this._taskId) return;
    try {
      this.connection.sendUserFeedbackResponse(this._taskId, 'continue', message);
      this.setStatus('thinking');
    } catch {
      // WebSocket 已断开，本地完成任务
      this.setStatus('idle');
      this._taskId = null;
      this.emit('task:complete', '', undefined);
    }
  }

  /** 处理 TOOL_USE 消息（Code 模式工具调用） */
  private handleToolUseMessage(message: AIMessage): void {
    const toolName = message.tool_name || '';
    const toolInput = message.tool_input || {};
    const toolUseId = message.tool_use_id || '';
    const taskId = message.task_id || '';

    this.setStatus('generating');
    this.emit('tool:use', toolName, toolInput, toolUseId, taskId);
  }

  /** 处理 TOOL_RESULT 消息（Code 模式工具结果） */
  private handleToolResultMessage(message: AIMessage): void {
    const toolUseId = message.tool_use_id || '';
    const output = message.output || message.content || '';
    const isError = message.is_error || false;

    this.emit('tool:result', toolUseId, output, isError);
  }

  // ==================== 内部工具 ====================

  private setStatus(status: AIAgentStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.emit('status:change', status);
    }
  }


  private detectOpsKeywords(content: string): void {
    const contentLower = content.toLowerCase();
    const matched = OPS_KEYWORDS.filter(kw => contentLower.includes(kw));
    if (matched.length > 0) {
      this.emit('ops:detected', matched);
    }
  }
}
