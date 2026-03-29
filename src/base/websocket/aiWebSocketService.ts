/**
 * AI WebSocket Service (Compatibility Layer)
 *
 * Retains the original singleton API, internally delegates to AIAgentConnection.
 * Existing code (useAIWebSocket, useAIMessageHandler, etc.) can continue to work without modification.
 *
 * New code should directly use AIAgentConnection:
 *   import { AIAgentConnection } from '@/core/ai-agent';
 */

import { AIAgentConnection } from '@/core/ai-agent/AIAgentConnection';
import { logger, LOG_MODULE } from '../logger/logger';

// ==================== Type Definitions (retained for backward compatibility) ====================

// Re-export from module, keeping external import paths unchanged
export {
  AIMessageType,
  TaskType,
} from '@/core/ai-agent/types';

export type {
  AIMessage,
  AIMessageCallback,
  ChoiceOption,
  OperationStep,
} from '@/core/ai-agent/types';

// Import internal types
import type { AIMessage, AIMessageCallback } from '@/core/ai-agent/types';
import { AIMessageType } from '@/core/ai-agent/types';

// ==================== Compatibility Layer Implementation ====================

class AIWebSocketService {
  private connection: AIAgentConnection | null = null;
  private token: string | null = null;
  private isConnectingFlag = false;

  /**
   * Connect to AI WebSocket service
   */
  connect(token: string): Promise<void> {
    if (this.connection?.isConnected()) {
      return Promise.resolve();
    }

    if (this.isConnectingFlag) {
      return Promise.reject(new Error('Connection already in progress'));
    }

    this.isConnectingFlag = true;
    this.token = token;

    const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8080';

    // Create new AIAgentConnection
    this.connection = new AIAgentConnection({ wsUrl: wsBaseUrl, token });

    return this.connection.connect()
      .then(() => {
        logger.info(LOG_MODULE.AI, 'ai.ws.connected', 'WebSocket connection established', { error: 0 });
        this.isConnectingFlag = false;
      })
      .catch((error) => {
        this.isConnectingFlag = false;
        throw error;
      });
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.token = null;
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  /**
   * Send question
   */
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
    if (!this.connection) {
      logger.error(LOG_MODULE.AI, 'ai.ws.send_failed', 'Cannot send, not connected', { error: 1 });
      return;
    }
    this.connection.sendQuestion(prompt, options);
  }

  /**
   * Confirm command execution
   */
  confirmExecute(
    taskId: string,
    stepIndex: number,
    result: { command: string; success: boolean; output: string; error?: string },
    options?: { sessionId?: string; mode?: 'normal' | 'agent' }
  ): void {
    if (!this.connection) return;
    this.connection.confirmExecute(taskId, stepIndex, result, options);
  }

  /**
   * Cancel execution
   */
  cancelExecute(taskId: string, stepIndex: number): void {
    if (!this.connection) return;
    this.connection.cancelExecute(taskId, stepIndex);
  }

  /**
   * Stop task
   */
  stopTask(taskId: string, frontendTaskId?: string): void {
    if (!this.connection) return;
    this.connection.stopTask(taskId, frontendTaskId);
  }

  /**
   * Send user choice response
   */
  sendUserChoice(
    taskId: string,
    stepIndex: number,
    choice: string,
    options?: { customInput?: string; cancelled?: boolean }
  ): void {
    if (!this.connection) return;
    logger.debug(LOG_MODULE.AI, 'ai.ws.user_choice', 'Sending user choice response', {
      task_id: taskId,
      step_index: stepIndex,
      choice,
      cancelled: options?.cancelled || false,
    });
    this.connection.sendUserChoice(taskId, stepIndex, choice, options);
  }

  /**
   * Send message (generic)
   */
  sendMessage(message: Partial<AIMessage>): void {
    if (!this.connection) return;
    this.connection.send(message as any);
  }

  /**
   * Register global message callback
   */
  onMessage(callback: AIMessageCallback): () => void {
    if (!this.connection) {
      // When connection is not established, cache callback, auto-register after connection
      // Simple handling: return empty cancel function
      logger.warn(LOG_MODULE.AI, 'ai.ws.no_connection', 'onMessage called before connection');
      return () => {};
    }
    return this.connection.onMessage(callback);
  }

  /**
   * Register task-specific message callback
   */
  onTaskMessage(taskId: string, callback: AIMessageCallback): () => void {
    if (!this.connection) return () => {};
    return this.connection.onTaskMessage(taskId, callback);
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * Get connection state
   */
  getReadyState(): number {
    return this.isConnected() ? WebSocket.OPEN : WebSocket.CLOSED;
  }

  /**
   * Get underlying AIAgentConnection instance (for new code)
   */
  getConnection(): AIAgentConnection | null {
    return this.connection;
  }
}

export const aiWebSocketService = new AIWebSocketService();
