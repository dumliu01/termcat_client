/**
 * Mock AI Agent Connection
 *
 * Simulates AIAgentConnection behavior without real WebSocket.
 * Programmatically simulates server message sequences, used for offline testing of AIAgent state machine.
 *
 * Usage example:
 * ```typescript
 * const mockConn = new MockAIAgentConnection();
 *
 * // Create agent (pass mock connection)
 * const agent = new AIAgent(mockConn as any, config);
 *
 * // Simulate server-sent messages
 * mockConn.simulateMessage({
 *   type: AIMessageType.ANSWER,
 *   content: 'Hello',
 *   is_complete: true,
 * });
 * ```
 */

import { AIMessage, AIMessageType, AIMessageCallback } from '../types';

/** Scheduled message: delay + message */
export interface ScheduledMessage {
  message: Partial<AIMessage>;
  delayMs?: number;
}

export class MockAIAgentConnection {
  private globalCallbacks: AIMessageCallback[] = [];
  private taskCallbacks: Map<string, AIMessageCallback[]> = new Map();
  private _isConnected = false;
  private sentMessages: Array<Partial<AIMessage> & Record<string, any>> = [];

  /** Connect (mock) */
  async connect(): Promise<void> {
    this._isConnected = true;
  }

  /** Disconnect (mock) */
  disconnect(): void {
    this._isConnected = false;
    this.globalCallbacks = [];
    this.taskCallbacks.clear();
  }

  /** Check connection status */
  isConnected(): boolean {
    return this._isConnected;
  }

  /** Send message (record, don't actually send) */
  send(message: Partial<AIMessage> & Record<string, any>): void {
    this.sentMessages.push({ ...message });
  }

  /** Send question (record) */
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

  /** Confirm execution (record) */
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

  /** Cancel execution (record) */
  cancelExecute(taskId: string, stepIndex: number): void {
    this.send({
      type: AIMessageType.CANCEL_EXECUTE,
      task_id: taskId,
      step_index: stepIndex,
    });
  }

  /** Stop task (record) */
  stopTask(taskId: string, frontendTaskId?: string): void {
    this.send({
      type: AIMessageType.STOP_TASK,
      task_id: taskId,
      frontend_task_id: frontendTaskId,
    });
  }

  /** Send user choice (record) */
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

  /** Register global message callback */
  onMessage(callback: AIMessageCallback): () => void {
    this.globalCallbacks.push(callback);
    return () => {
      const index = this.globalCallbacks.indexOf(callback);
      if (index > -1) this.globalCallbacks.splice(index, 1);
    };
  }

  /** Register task message callback */
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

  // ==================== Simulation API ====================

  /** Simulate receiving a server message (triggers callbacks synchronously) */
  simulateMessage(message: Partial<AIMessage>): void {
    const fullMessage = message as AIMessage;

    // Trigger global callbacks
    for (const cb of [...this.globalCallbacks]) {
      try { cb(fullMessage); } catch { /* ignore */ }
    }

    // Trigger task callbacks
    if (fullMessage.task_id) {
      const callbacks = this.taskCallbacks.get(fullMessage.task_id);
      if (callbacks) {
        for (const cb of [...callbacks]) {
          try { cb(fullMessage); } catch { /* ignore */ }
        }
      }
    }
  }

  /** Simulate a sequence of messages (send sequentially with delays) */
  async simulateMessageSequence(messages: ScheduledMessage[]): Promise<void> {
    for (const item of messages) {
      if (item.delayMs && item.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, item.delayMs));
      }
      this.simulateMessage(item.message);
    }
  }

  /**
   * Simulate complete agent mode flow:
   * 1. ANSWER (streaming text)
   * 2. OPERATION_PLAN (plan)
   * 3. EXECUTE_REQUEST (request command execution)
   * 4. COMPLETE (complete)
   *
   * Note: Step 3→4 requires agent's confirmExecute to send execution result back,
   * so COMPLETE needs to manually call simulateMessage after receiving CONFIRM_EXECUTE.
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

    // 1. Streaming answer
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

    // 2. Operation plan
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

    // 3. Execution request
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

  /** Simulate task complete */
  simulateComplete(taskId: string, summary?: string, sessionId?: string): void {
    this.simulateMessage({
      type: AIMessageType.COMPLETE,
      task_id: taskId,
      session_id: sessionId,
      summary: summary || '任务已完成',
    });
  }

  /** Simulate error */
  simulateError(taskId: string, error: string, sessionId?: string): void {
    this.simulateMessage({
      type: AIMessageType.ERROR,
      task_id: taskId,
      session_id: sessionId,
      error,
    });
  }

  // ==================== Query API ====================

  /** Get all sent messages */
  getSentMessages(): ReadonlyArray<Partial<AIMessage> & Record<string, any>> {
    return this.sentMessages;
  }

  /** Get last sent message */
  getLastSentMessage(): (Partial<AIMessage> & Record<string, any>) | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /** Get sent messages of specified type */
  getSentMessagesByType(type: AIMessageType): Array<Partial<AIMessage> & Record<string, any>> {
    return this.sentMessages.filter(m => m.type === type);
  }

  /** Clear sent messages history */
  clearSentMessages(): void {
    this.sentMessages = [];
  }
}
