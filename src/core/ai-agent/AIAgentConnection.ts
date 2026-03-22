/**
 * AI Agent WebSocket 连接管理
 *
 * 任务级连接：每个 AI 任务独立建连，任务完成/取消时断连。
 * 不重连（任务级连接断开 = 任务结束）。
 */

import { AIMessage, AIMessageType, AIMessageCallback, OperationStep, RiskLevel } from './types';

export interface AIAgentConnectionConfig {
  /** WebSocket 基础 URL（如 ws://localhost:5001 或 wss://domain） */
  wsUrl: string;
  /** 认证 token */
  token: string;
}

export class AIAgentConnection {
  private ws: WebSocket | null = null;
  private messageCallbacks: Map<string, AIMessageCallback[]> = new Map();
  private globalCallbacks: AIMessageCallback[] = [];
  private config: AIAgentConnectionConfig;
  private isConnecting = false;
  private _isDisconnecting = false;

  constructor(config: AIAgentConnectionConfig) {
    this.config = config;
  }

  /** 建立 WebSocket 连接 */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;
      this._isDisconnecting = false;

      // wsUrl 可能带 /ws 后缀（如 ws://host:8080/ws），需要去掉再拼接 API 路径
      const baseUrl = this.config.wsUrl.replace(/\/ws\/?$/, '');
      const wsUrl = `${baseUrl}/ws/ai?token=${encodeURIComponent(this.config.token)}`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: AIMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch {
            // Parse error, skip
          }
        };

        this.ws.onerror = () => {
          this.isConnecting = false;
        };

        this.ws.onclose = () => {
          // 任务级连接不重连
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /** 断开连接 */
  disconnect(): void {
    this._isDisconnecting = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageCallbacks.clear();
    this.globalCallbacks = [];
  }

  /** 检查连接状态 */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** 发送原始消息 */
  send(message: Partial<AIMessage> & Record<string, any>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  /** 发送问题 */
  sendQuestion(
    prompt: string,
    options?: {
      context?: Record<string, any>;
      model?: string;
      mode?: 'normal' | 'agent' | 'code' | 'codex';
      sshMode?: 'associated' | 'independent';
      hostId?: string;
      sessionId?: string;
      uiLanguage?: string;
      osType?: string;
      osVersion?: string;
      shell?: string;
      files?: Array<{ id: string; name: string; size: number; type: string; content: string }>;
    }
  ): void {
    const context: Record<string, any> = {
      ...options?.context,
      ssh_mode: options?.sshMode || 'associated',
    };

    // 注入远程服务器 OS 信息到 context
    if (options?.osType) {
      context.os_type = options.osType;
    }
    if (options?.osVersion) {
      context.os_version = options.osVersion;
    }
    if (options?.shell) {
      context.shell = options.shell;
    }

    this.send({
      type: AIMessageType.QUESTION,
      prompt,
      context,
      model: options?.model,
      mode: options?.mode || 'normal',
      host_id: options?.hostId,
      session_id: options?.sessionId,
      ui_language: options?.uiLanguage,
      files: options?.files,
    });
  }

  /** 确认执行命令 */
  confirmExecute(
    taskId: string,
    stepIndex: number,
    result: { command: string; success: boolean; output: string; error?: string },
    options?: { sessionId?: string; mode?: 'normal' | 'agent' | 'code' }
  ): void {
    this.send({
      type: AIMessageType.CONFIRM_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
      command: result.command,
      success: result.success,
      output: result.output,
      error: result.error,
      session_id: options?.sessionId,
      mode: options?.mode || 'normal',
    });
  }

  /** 发送远程执行结果（Code 模式，对应 remote_terminal_proxy） */
  sendExecuteResult(
    executionId: string,
    result: { success: boolean; output: string; exitCode: number; error?: string }
  ): void {
    this.send({
      type: AIMessageType.EXECUTE_RESULT,
      execution_id: executionId,
      success: result.success,
      output: result.output,
      exit_code: result.exitCode,
      error: result.error,
    });
  }

  /** 发送执行活动心跳（通知后端命令仍在运行，重置超时） */
  sendExecuteActivity(executionId: string): void {
    this.send({
      type: 'execute_activity' as AIMessageType,
      execution_id: executionId,
    });
  }

  /** 取消执行 */
  cancelExecute(taskId: string, stepIndex: number): void {
    this.send({
      type: AIMessageType.CANCEL_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
    });
  }

  /** 终止任务 */
  stopTask(taskId: string, frontendTaskId?: string): void {
    this.send({
      type: AIMessageType.STOP_TASK,
      task_id: taskId,
      frontend_task_id: frontendTaskId,
    });
  }

  /** 发送工具权限响应（Code 模式） */
  sendToolPermissionResponse(
    permissionId: string,
    allowed: boolean,
    reason?: string,
  ): void {
    this.send({
      type: AIMessageType.TOOL_PERMISSION_RESPONSE,
      permission_id: permissionId,
      allowed,
      reason,
    });
  }

  /** 发送用户反馈响应（Code 模式） */
  sendUserFeedbackResponse(
    taskId: string,
    action: 'accept' | 'continue',
    message?: string,
  ): void {
    this.send({
      type: AIMessageType.USER_FEEDBACK_RESPONSE,
      task_id: taskId,
      action,
      message,
    });
  }

  /** 发送用户选择响应 */
  sendUserChoice(
    taskId: string,
    stepIndex: number,
    choice: string,
    options?: { customInput?: string; cancelled?: boolean }
  ): void {
    this.send({
      type: AIMessageType.USER_CHOICE_RESPONSE,
      task_id: taskId,
      step_index: stepIndex,
      choice,
      custom_input: options?.customInput,
      cancelled: options?.cancelled || false,
    });
  }

  /** 注册全局消息回调，返回取消函数 */
  onMessage(callback: AIMessageCallback): () => void {
    this.globalCallbacks.push(callback);
    return () => {
      const index = this.globalCallbacks.indexOf(callback);
      if (index > -1) {
        this.globalCallbacks.splice(index, 1);
      }
    };
  }

  /** 注册任务特定的消息回调，返回取消函数 */
  onTaskMessage(taskId: string, callback: AIMessageCallback): () => void {
    if (!this.messageCallbacks.has(taskId)) {
      this.messageCallbacks.set(taskId, []);
    }
    this.messageCallbacks.get(taskId)!.push(callback);

    return () => {
      const callbacks = this.messageCallbacks.get(taskId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          this.messageCallbacks.delete(taskId);
        }
      }
    };
  }

  /** 处理收到的消息 */
  private handleMessage(message: AIMessage): void {
    // 全局回调
    for (const callback of this.globalCallbacks) {
      try {
        callback(message);
      } catch {
        // Callback error, skip
      }
    }

    // 任务特定回调
    if (message.task_id) {
      const callbacks = this.messageCallbacks.get(message.task_id);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback(message);
          } catch {
            // Callback error, skip
          }
        }

        // 任务完成或出错时清理回调
        if (message.type === AIMessageType.COMPLETE || message.type === AIMessageType.ERROR) {
          this.messageCallbacks.delete(message.task_id);
        }
      }
    }
  }
}
