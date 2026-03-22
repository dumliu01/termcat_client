/**
 * Mock AI Agent 连接
 *
 * 模拟 AIAgentConnection 的行为，无需真实 WebSocket。
 * 可编程模拟服务端消息序列，用于离线测试 AIAgent 状态机。
 *
 * 使用示例：
 * ```typescript
 * const mockConn = new MockAIAgentConnection();
 *
 * // 创建 agent（传入 mock 连接）
 * const agent = new AIAgent(mockConn as any, config);
 *
 * // 模拟服务端发来的消息
 * mockConn.simulateMessage({
 *   type: AIMessageType.ANSWER,
 *   content: 'Hello',
 *   is_complete: true,
 * });
 * ```
 */

import { AIMessage, AIMessageType, AIMessageCallback } from '../types';

/** 消息序列项：延迟 + 消息 */
export interface ScheduledMessage {
  message: Partial<AIMessage>;
  delayMs?: number;
}

export class MockAIAgentConnection {
  private globalCallbacks: AIMessageCallback[] = [];
  private taskCallbacks: Map<string, AIMessageCallback[]> = new Map();
  private _isConnected = false;
  private sentMessages: Array<Partial<AIMessage> & Record<string, any>> = [];

  /** 建立连接（模拟） */
  async connect(): Promise<void> {
    this._isConnected = true;
  }

  /** 断开连接（模拟） */
  disconnect(): void {
    this._isConnected = false;
    this.globalCallbacks = [];
    this.taskCallbacks.clear();
  }

  /** 检查连接状态 */
  isConnected(): boolean {
    return this._isConnected;
  }

  /** 发送消息（记录，不实际发送） */
  send(message: Partial<AIMessage> & Record<string, any>): void {
    this.sentMessages.push({ ...message });
  }

  /** 发送问题（记录） */
  sendQuestion(
    prompt: string,
    options?: {
      context?: Record<string, any>;
      model?: string;
      mode?: 'normal' | 'agent';
      sshMode?: 'associated' | 'independent';
      hostId?: string;
      sessionId?: string;
      uiLanguage?: string;
      files?: Array<{ id: string; name: string; size: number; type: string; content: string }>;
    }
  ): void {
    this.send({
      type: AIMessageType.QUESTION,
      prompt,
      model: options?.model,
      mode: options?.mode || 'normal',
      host_id: options?.hostId,
      session_id: options?.sessionId,
    });
  }

  /** 确认执行（记录） */
  confirmExecute(
    taskId: string,
    stepIndex: number,
    result: { command: string; success: boolean; output: string; error?: string },
    options?: { sessionId?: string; mode?: 'normal' | 'agent' }
  ): void {
    this.send({
      type: AIMessageType.CONFIRM_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
      command: result.command,
      success: result.success,
      output: result.output,
      error: result.error,
    });
  }

  /** 取消执行（记录） */
  cancelExecute(taskId: string, stepIndex: number): void {
    this.send({
      type: AIMessageType.CANCEL_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
    });
  }

  /** 停止任务（记录） */
  stopTask(taskId: string, frontendTaskId?: string): void {
    this.send({
      type: AIMessageType.STOP_TASK,
      task_id: taskId,
      frontend_task_id: frontendTaskId,
    });
  }

  /** 发送用户选择（记录） */
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

  /** 注册全局消息回调 */
  onMessage(callback: AIMessageCallback): () => void {
    this.globalCallbacks.push(callback);
    return () => {
      const index = this.globalCallbacks.indexOf(callback);
      if (index > -1) this.globalCallbacks.splice(index, 1);
    };
  }

  /** 注册任务消息回调 */
  onTaskMessage(taskId: string, callback: AIMessageCallback): () => void {
    if (!this.taskCallbacks.has(taskId)) {
      this.taskCallbacks.set(taskId, []);
    }
    this.taskCallbacks.get(taskId)!.push(callback);
    return () => {
      const callbacks = this.taskCallbacks.get(taskId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    };
  }

  // ==================== 模拟 API ====================

  /** 模拟收到一条服务端消息（同步触发回调） */
  simulateMessage(message: Partial<AIMessage>): void {
    const fullMessage = message as AIMessage;

    // 触发全局回调
    for (const cb of [...this.globalCallbacks]) {
      try { cb(fullMessage); } catch { /* ignore */ }
    }

    // 触发任务回调
    if (fullMessage.task_id) {
      const callbacks = this.taskCallbacks.get(fullMessage.task_id);
      if (callbacks) {
        for (const cb of [...callbacks]) {
          try { cb(fullMessage); } catch { /* ignore */ }
        }
      }
    }
  }

  /** 模拟一组消息序列（按延迟依次发送） */
  async simulateMessageSequence(messages: ScheduledMessage[]): Promise<void> {
    for (const item of messages) {
      if (item.delayMs && item.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, item.delayMs));
      }
      this.simulateMessage(item.message);
    }
  }

  /**
   * 模拟完整的 agent 模式流程：
   * 1. ANSWER（流式文本）
   * 2. OPERATION_PLAN（计划）
   * 3. EXECUTE_REQUEST（请求执行命令）
   * 4. COMPLETE（完成）
   *
   * 注意：步骤 3→4 之间需要 agent 的 confirmExecute 回传执行结果，
   * 所以 COMPLETE 需要在收到 CONFIRM_EXECUTE 后手动调用 simulateMessage。
   */
  simulateAgentFlow(options: {
    taskId: string;
    sessionId?: string;
    answerText?: string;
    planSteps?: Array<{ description: string; command: string; risk?: string }>;
    executeStepIndex?: number;
  }): void {
    const {
      taskId,
      sessionId,
      answerText = '我将为您执行以下操作',
      planSteps = [{ description: '检查服务状态', command: 'systemctl status nginx' }],
      executeStepIndex = 0,
    } = options;

    // 1. 流式回答
    this.simulateMessage({
      type: AIMessageType.ANSWER,
      task_id: taskId,
      session_id: sessionId,
      content: answerText,
      is_complete: false,
    });
    this.simulateMessage({
      type: AIMessageType.ANSWER,
      task_id: taskId,
      session_id: sessionId,
      content: '',
      is_complete: true,
    });

    // 2. 操作计划
    this.simulateMessage({
      type: AIMessageType.OPERATION_PLAN,
      task_id: taskId,
      session_id: sessionId,
      description: '操作计划',
      plan: planSteps.map((s, i) => ({
        index: i,
        description: s.description,
        command: s.command,
        risk: (s.risk || 'low') as any,
        status: 'pending' as const,
      })),
      total_steps: planSteps.length,
    });

    // 3. 执行请求
    const step = planSteps[executeStepIndex];
    this.simulateMessage({
      type: AIMessageType.EXECUTE_REQUEST,
      task_id: taskId,
      session_id: sessionId,
      step_index: executeStepIndex,
      command: step.command,
      risk: (step.risk || 'low') as any,
      description: step.description,
    });
  }

  /** 模拟任务完成 */
  simulateComplete(taskId: string, summary?: string, sessionId?: string): void {
    this.simulateMessage({
      type: AIMessageType.COMPLETE,
      task_id: taskId,
      session_id: sessionId,
      summary: summary || '任务已完成',
    });
  }

  /** 模拟错误 */
  simulateError(taskId: string, error: string, sessionId?: string): void {
    this.simulateMessage({
      type: AIMessageType.ERROR,
      task_id: taskId,
      session_id: sessionId,
      error,
    });
  }

  // ==================== 查询 API ====================

  /** 获取所有发送过的消息 */
  getSentMessages(): ReadonlyArray<Partial<AIMessage> & Record<string, any>> {
    return this.sentMessages;
  }

  /** 获取最后发送的消息 */
  getLastSentMessage(): (Partial<AIMessage> & Record<string, any>) | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /** 获取指定类型的发送消息 */
  getSentMessagesByType(type: AIMessageType): Array<Partial<AIMessage> & Record<string, any>> {
    return this.sentMessages.filter(m => m.type === type);
  }

  /** 清空发送历史 */
  clearSentMessages(): void {
    this.sentMessages = [];
  }
}
