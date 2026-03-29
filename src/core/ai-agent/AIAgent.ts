/**
 * AI Agent Core Class
 *
 * Event-driven state machine that handles AI WebSocket protocol.
 * No UI dependencies - all state changes and interaction requests are notified to external components via EventEmitter.
 *
 * Logic extracted from:
 * - useAIMessageHandler.ts → Message handling state machine
 * - useCommandExecution.ts → Command execution flow
 * - useAIOpsState.ts → State management
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

/**
 * Multi-step ops keywords — only suggest Agent mode when the task
 * clearly requires multiple steps, not for single-command queries.
 */
const OPS_KEYWORDS = [
  'deploy', 'kubernetes', 'k8s', 'cluster',
  'migrate', 'migration', 'backup', 'restore',
  'troubleshoot', 'diagnose', 'performance tuning',
  '部署', '迁移', '排查', '故障排查', '性能优化', '集群',
  '执行步骤', '运维操作', '运维任务', '多步骤',
];

/** Generate unique message ID */
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

  // Accumulated response content (for streaming message merging)
  private accumulatedContent = '';
  // Whether a COMMAND message was received (single command = no need to suggest Agent)
  private receivedCommandSuggestion = false;

  // Auto mode flags
  private autoExecuteEnabled = false;
  private autoChoiceEnabled = false;

  // Password cache (for auto-execute mode)
  private cachedPassword: string | null = null;

  constructor(connection: AIAgentConnection, config: AIAgentConfig) {
    super();
    this.connection = connection;
    this.config = { ...config };

    // Task-level connection: all messages are for this agent, use onMessage directly
    this.unsubscribeMessage = this.connection.onMessage((msg) => this.handleMessage(msg));
  }

  // ==================== Core API ====================

  /** Set command executor */
  setExecutor(executor: ICommandExecutor): void {
    this.executor = executor;
  }

  /** Send question */
  ask(prompt: string, files?: AttachedFile[]): void {
    // Generate frontend task ID
    this.frontendTaskId = generateId();
    this.accumulatedContent = '';
    this.receivedCommandSuggestion = false;
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

  /** Stop current task (for task-level connection, external will close connection directly) */
  stop(): void {
    this.setStatus('idle');
    this._taskId = null;
    this.frontendTaskId = null;
  }

  /** Update configuration */
  configure(config: Partial<AIAgentConfig>): void {
    Object.assign(this.config, config);
  }

  /** Destroy and cleanup all resources */
  destroy(): void {
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }
    this.removeAllListeners();
  }

  // ==================== Human-Computer Interaction API ====================

  /** Confirm command execution (called after user clicks "Execute") */
  async confirmExecute(stepIndex: number, command: string, password?: string, taskId?: string): Promise<void> {
    // If external passed taskId (e.g., after sshMode switch agent rebuilt, _taskId lost), restore it
    if (taskId && !this._taskId) {
      this._taskId = taskId;
    }
    if (!this._taskId) return;

    this.setStatus('thinking');

    try {
      let result: CommandResult;

      if (this.executor) {
        // heredoc transformation (must run before password wrapping, otherwise quote nesting breaks)
        let finalCommand = rewriteHeredoc(command) ?? command;

        // Handle password
        if (password && isSudoCommand(finalCommand)) {
          finalCommand = buildCommandWithPassword(finalCommand, password);
        }

        result = await this.executor.execute(finalCommand);
      } else {
        // No executor, notify external
        // External should listen to execute:request event and call submitExecuteResult
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

  /** Submit execution result (called when external executes command) */
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

  /** Cancel command execution — sends Ctrl+C to terminal to interrupt running command, task continues */
  cancelExecute(stepIndex: number): void {
    if (!this._taskId) return;

    // Only send Ctrl+C (\x03) to shell to interrupt current command
    // Executor handleShellData detects ^C + [?2004h → resolve as failure
    // Failure result sent back to server via EXECUTE_RESULT → AI decides next step
    // Don't send cancel_execute to server to avoid cancelling entire task
    if (this.executor) {
      this.executor.writeToShell('\x03').catch(() => {});
    }
  }

  /** Send user choice */
  sendUserChoice(stepIndex: number, choice: string, customInput?: string): void {
    if (!this._taskId) return;
    this.connection.sendUserChoice(this._taskId, stepIndex, choice, { customInput });
    this.setStatus('thinking');
  }

  /** Cancel user choice */
  cancelUserChoice(stepIndex: number): void {
    if (!this._taskId) return;
    this.connection.sendUserChoice(this._taskId, stepIndex, '', { cancelled: true });
    this.setStatus('idle');
  }

  // ==================== Auto Mode API (headless usage) ====================

  /** Enable auto-confirm execution */
  enableAutoExecute(): void {
    this.autoExecuteEnabled = true;
  }

  /** Disable auto-confirm execution */
  disableAutoExecute(): void {
    this.autoExecuteEnabled = false;
  }

  /** Enable auto-choice (auto-select recommended when receiving user_choice_request) */
  enableAutoChoice(): void {
    this.autoChoiceEnabled = true;
  }

  /** Disable auto-choice */
  disableAutoChoice(): void {
    this.autoChoiceEnabled = false;
  }

  /** Set password cache (for auto-executing sudo commands) */
  setPassword(password: string): void {
    this.cachedPassword = password;
  }

  // ==================== Status Query ====================

  getStatus(): AIAgentStatus {
    return this._status;
  }

  getTaskId(): string | null {
    return this._taskId;
  }

  getConfig(): Readonly<AIAgentConfig> {
    return { ...this.config };
  }

  // ==================== Internal: Message Handling State Machine ====================

  private handleMessage(message: AIMessage): void {
    // Task-level connection: all messages are for this agent, just basic filtering
    if (!this.frontendTaskId) return;

    // First time receiving server task_id → record
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

  /** Handle ANSWER message (streaming text response) */
  private handleAnswerMessage(message: AIMessage): void {
    this.setStatus('generating');
    this.accumulatedContent += message.content || '';

    this.emit('answer:chunk', message.content || '', !!message.is_complete);

    if (message.is_complete) {
      this.emit('answer:complete', this.accumulatedContent);

      if (this.config.mode === 'normal') {
        this.setStatus('idle');
        this._taskId = null;

        // Detect ops keywords
        this.detectOpsKeywords(this.accumulatedContent);
      }
    }
  }

  /** Handle COMMAND message (command suggestion) */
  private handleCommandMessage(message: AIMessage): void {
    this.receivedCommandSuggestion = true;
    this.emit('command:suggestion', {
      command: message.command || '',
      explanation: message.explanation || '',
      risk: message.risk || 'medium',
    });
    this.setStatus('idle');
  }

  /** Handle OPERATION_PLAN message */
  private handleOperationPlanMessage(message: AIMessage): void {
    this.setStatus('generating');

    if (message.task_id) {
      this._taskId = message.task_id;
    }

    this.emit('plan', message.plan || [], message.description || '', message.task_id || '');
  }

  /** Handle OPERATION_STEP message (update step status) */
  private handleOperationStepMessage(message: AIMessage): void {
    if (message.step_index !== undefined) {
      this.emit('step:update', message.step_index, message.status as any);
    }
  }

  /** Handle STEP_DETAIL message */
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

    // When step is waiting for user confirmation, switch to waiting_user status
    // (In persistent connection mode, no longer relies on COMPLETE("Waiting for command execution...") to switch status)
    if (detail.status === 'waiting_confirm' && detail.command) {
      this.setStatus('waiting_user');
    }

    this.emit('step:detail', detail.stepIndex, detail);
  }

  /** Handle EXECUTE_REQUEST message (request command execution) */
  private handleExecuteRequestMessage(message: AIMessage): void {
    // Code/X-Agent mode: execution request from remote_terminal_proxy (has execution_id)
    if (message.execution_id) {
      console.log('[AIAgent] handleCodeModeExecuteRequest:', message.execution_id, message.tool_input?.command?.substring(0, 50));
      this.handleCodeModeExecuteRequest(message);
      return;
    }

    // Agent mode: regular execution request
    const stepIndex = message.step_index ?? 0;
    const command = message.command || '';
    const risk = message.risk || 'medium';
    const description = message.description || '';
    const taskId = message.task_id || '';

    if (message.task_id) {
      this._taskId = message.task_id;
    }

    // Auto execute mode
    if (this.autoExecuteEnabled && this.executor) {
      this.setStatus('thinking');
      this.confirmExecute(stepIndex, command, this.cachedPassword || undefined).catch(() => {});
      return;
    }

    // Non-auto mode: notify external
    this.setStatus('waiting_user');
    this.emit('execute:request', stepIndex, command, risk, description, taskId);
  }

  /** Handle Code mode remote execution request (from remote_terminal_proxy) */
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

    // Set activity heartbeat: executor notifies backend to reset timeout when receiving SSH data
    let lastHeartbeat = 0;
    const HEARTBEAT_INTERVAL = 10_000; // Send heartbeat at most once every 10 seconds
    const onActivity = () => {
      const now = Date.now();
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        lastHeartbeat = now;
        this.connection.sendExecuteActivity(executionId);
      }
    };
    this.executor.on('data:activity', onActivity);

    try {
      // heredoc transformation
      let finalCommand = rewriteHeredoc(command) ?? command;

      // Password handling
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

  /** Handle EXECUTE_CANCEL message (backend command timeout, need to interrupt SSH session to restore shell) */
  private handleExecuteCancelMessage(message: AIMessage): void {
    console.log('[AIAgent] handleExecuteCancelMessage: execution timed out, sending Ctrl+C', message.execution_id);
    if (this.executor) {
      // Send Ctrl+C twice to ensure interruption (handle nested command scenarios like sudo waiting for password)
      this.executor.writeToShell('\x03').catch(() => {});
      setTimeout(() => {
        this.executor?.writeToShell('\x03').catch(() => {});
      }, 200);
    }
  }

  /** Handle USER_CHOICE_REQUEST message */
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

    // Auto-choice mode
    if (this.autoChoiceEnabled) {
      const recommended = choiceData.options.find(o => o.recommended);
      const choice = recommended?.value || choiceData.options[0]?.value || '';
      this.sendUserChoice(stepIndex, choice);
      return;
    }

    // Non-auto mode: notify external
    this.setStatus('waiting_user');
    this.emit('choice:request', stepIndex, choiceData, taskId);
  }

  /** Handle TOKEN_USAGE message */
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

  /** Handle COMPLETE message */
  private handleCompleteMessage(message: AIMessage): void {
    this.setStatus('idle');
    this._taskId = null;

    // Also detect ops keywords on COMPLETE
    if (this.config.mode === 'normal' && this.accumulatedContent) {
      this.detectOpsKeywords(this.accumulatedContent);
    }

    this.emit('task:complete', message.summary || '', message.stats?.gems_remaining);
    this.accumulatedContent = '';
  }

  /** Handle ERROR message */
  private handleErrorMessage(message: AIMessage): void {
    this.setStatus('idle');
    this._taskId = null;
    this.emit('task:error', message.error || (message as any).message || 'Unknown error', message.code, (message as any).error_params);
    this.accumulatedContent = '';
  }

  /** Handle TOOL_PERMISSION_REQUEST message (Code mode tool permission request) */
  private handleToolPermissionRequestMessage(message: AIMessage): void {
    const permissionId = message.permission_id || '';
    const toolName = message.tool_name || '';
    const toolInput = message.tool_input || {};
    const taskId = message.task_id || '';
    const toolUseId = message.tool_use_id || '';
    const risk = (message as any).risk as string | undefined;
    const description = (message as any).description as string | undefined;
    const title = (message as any).title as string | undefined;
    const allowPermanent = !!(message as any).allow_permanent;

    this.setStatus('waiting_user');
    this.emit('tool:permission_request', permissionId, toolName, toolInput, taskId, toolUseId, risk, description, title, allowPermanent);
  }

  /** Handle USER_FEEDBACK_REQUEST message (Code mode feedback request after task completion) */
  private handleUserFeedbackRequestMessage(message: AIMessage): void {
    const taskId = message.task_id || '';

    this.setStatus('waiting_user');
    this.emit('feedback:request', taskId);
  }

  // ==================== Tool Permission and Feedback API ====================

  /** Approve tool execution */
  approveToolPermission(permissionId: string, permanent?: boolean): void {
    this.connection.sendToolPermissionResponse(permissionId, true, undefined, permanent);
    this.setStatus('thinking');
  }

  /** Deny tool execution */
  denyToolPermission(permissionId: string, reason?: string): void {
    this.connection.sendToolPermissionResponse(permissionId, false, reason);
    this.setStatus('thinking');
  }

  /** Send user feedback (accept) */
  acceptFeedback(): void {
    if (!this._taskId) return;
    try {
      this.connection.sendUserFeedbackResponse(this._taskId, 'accept');
      this.setStatus('thinking');
    } catch {
      // WebSocket disconnected (server may have closed connection), complete task locally
      this.setStatus('idle');
      this._taskId = null;
      this.emit('task:complete', '', undefined);
    }
  }

  /** Send user feedback (continue + new instruction) */
  continueFeedback(message: string): void {
    if (!this._taskId) return;
    try {
      this.connection.sendUserFeedbackResponse(this._taskId, 'continue', message);
      this.setStatus('thinking');
    } catch {
      // WebSocket disconnected, complete task locally
      this.setStatus('idle');
      this._taskId = null;
      this.emit('task:complete', '', undefined);
    }
  }

  /** Handle TOOL_USE message (Code mode tool invocation) */
  private handleToolUseMessage(message: AIMessage): void {
    const toolName = message.tool_name || '';
    const toolInput = message.tool_input || {};
    const toolUseId = message.tool_use_id || '';
    const taskId = message.task_id || '';

    this.setStatus('generating');
    this.emit('tool:use', toolName, toolInput, toolUseId, taskId);
  }

  /** Handle TOOL_RESULT message (Code mode tool result) */
  private handleToolResultMessage(message: AIMessage): void {
    const toolUseId = message.tool_use_id || '';
    const output = message.output || message.content || '';
    const isError = message.is_error || false;

    this.emit('tool:result', toolUseId, output, isError);
  }

  // ==================== Internal Utilities ====================

  private setStatus(status: AIAgentStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.emit('status:change', status);
    }
  }


  private detectOpsKeywords(content: string): void {
    // If AI already gave a command suggestion, the task is simple — don't suggest Agent
    if (this.receivedCommandSuggestion) return;

    const contentLower = content.toLowerCase();
    const matched = OPS_KEYWORDS.filter(kw => contentLower.includes(kw));
    if (matched.length > 0) {
      this.emit('ops:detected', matched);
    }
  }
}
