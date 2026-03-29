/**
 * AI Agent WebSocket Connection Management
 *
 * Task-level connection: each AI task establishes independent connection, disconnects when task completes/cancels.
 * No reconnection (task-level disconnection = task end).
 */

import { AIMessage, AIMessageType, AIMessageCallback, OperationStep, RiskLevel } from './types';

export interface AIAgentConnectionConfig {
  /** WebSocket base URL (e.g., ws://localhost:5001 or wss://domain) */
  wsUrl: string;
  /** Authentication token */
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

  /** Establish WebSocket connection */
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

      // wsUrl may contain /ws suffix (e.g., ws://host:8080/ws), need to remove and concatenate API path
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
          // No reconnection for task-level connection
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /** Disconnect */
  disconnect(): void {
    this._isDisconnecting = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageCallbacks.clear();
    this.globalCallbacks = [];
  }

  /** Check connection status */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Send raw message */
  send(message: Partial<AIMessage> & Record<string, any>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  /** Send question */
  sendQuestion(
    prompt: string,
    options?: {
      context?: Record<string, any>;
      model?: string;
      mode?: 'normal' | 'agent' | 'code' | 'x-agent';
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

    // Inject remote server OS info into context
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

  /** Confirm command execution */
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

  /** Send remote execution result (Code mode, corresponds to remote_terminal_proxy) */
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

  /** Send execution activity heartbeat (notify backend that command is still running, reset timeout) */
  sendExecuteActivity(executionId: string): void {
    this.send({
      type: 'execute_activity' as AIMessageType,
      execution_id: executionId,
    });
  }

  /** Cancel execution */
  cancelExecute(taskId: string, stepIndex: number): void {
    this.send({
      type: AIMessageType.CANCEL_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
    });
  }

  /** Stop task */
  stopTask(taskId: string, frontendTaskId?: string): void {
    this.send({
      type: AIMessageType.STOP_TASK,
      task_id: taskId,
      frontend_task_id: frontendTaskId,
    });
  }

  /** Send tool permission response (Code mode) */
  sendToolPermissionResponse(
    permissionId: string,
    allowed: boolean,
    reason?: string,
    permanent?: boolean,
  ): void {
    this.send({
      type: AIMessageType.TOOL_PERMISSION_RESPONSE,
      permission_id: permissionId,
      allowed,
      reason,
      permanent,
    });
  }

  /** Send user feedback response (Code mode) */
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

  /** Send user choice response */
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

  /** Register global message callback, returns unsubscribe function */
  onMessage(callback: AIMessageCallback): () => void {
    this.globalCallbacks.push(callback);
    return () => {
      const index = this.globalCallbacks.indexOf(callback);
      if (index > -1) {
        this.globalCallbacks.splice(index, 1);
      }
    };
  }

  /** Register task-specific message callback, returns unsubscribe function */
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

  /** Handle received message */
  private handleMessage(message: AIMessage): void {
    // Global callbacks
    for (const callback of this.globalCallbacks) {
      try {
        callback(message);
      } catch {
        // Callback error, skip
      }
    }

    // Task-specific callbacks
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

        // Cleanup callbacks when task completes or errors
        if (message.type === AIMessageType.COMPLETE || message.type === AIMessageType.ERROR) {
          this.messageCallbacks.delete(message.task_id);
        }
      }
    }
  }
}
