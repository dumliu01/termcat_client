/**
 * AI WebSocket 服务（兼容层）
 *
 * 保留原有单例 API，内部委托给 AIAgentConnection。
 * 现有代码（useAIWebSocket、useAIMessageHandler 等）无需修改即可继续工作。
 *
 * 新代码应直接使用 AIAgentConnection：
 *   import { AIAgentConnection } from '@/core/ai-agent';
 */

import { AIAgentConnection } from '@/core/ai-agent/AIAgentConnection';
import { logger, LOG_MODULE } from '../logger/logger';

// ==================== 类型定义（保留原有导出，向后兼容） ====================

// 从模块 re-export，保持外部 import 路径不变
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

// 导入内部使用的类型
import type { AIMessage, AIMessageCallback } from '@/core/ai-agent/types';
import { AIMessageType } from '@/core/ai-agent/types';

// ==================== 兼容层实现 ====================

class AIWebSocketService {
  private connection: AIAgentConnection | null = null;
  private token: string | null = null;
  private isConnectingFlag = false;

  /**
   * 连接到 AI WebSocket 服务
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

    // 创建新的 AIAgentConnection
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
   * 断开连接
   */
  disconnect(): void {
    this.token = null;
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  /**
   * 发送问题
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
   * 确认执行命令
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
   * 取消执行
   */
  cancelExecute(taskId: string, stepIndex: number): void {
    if (!this.connection) return;
    this.connection.cancelExecute(taskId, stepIndex);
  }

  /**
   * 终止任务
   */
  stopTask(taskId: string, frontendTaskId?: string): void {
    if (!this.connection) return;
    this.connection.stopTask(taskId, frontendTaskId);
  }

  /**
   * 发送用户选择响应
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
   * 发送消息（通用）
   */
  sendMessage(message: Partial<AIMessage>): void {
    if (!this.connection) return;
    this.connection.send(message as any);
  }

  /**
   * 注册全局消息回调
   */
  onMessage(callback: AIMessageCallback): () => void {
    if (!this.connection) {
      // 连接还没建立时，缓存 callback，等连接后自动注册
      // 简单处理：返回空取消函数
      logger.warn(LOG_MODULE.AI, 'ai.ws.no_connection', 'onMessage called before connection');
      return () => {};
    }
    return this.connection.onMessage(callback);
  }

  /**
   * 注册任务特定的消息回调
   */
  onTaskMessage(taskId: string, callback: AIMessageCallback): () => void {
    if (!this.connection) return () => {};
    return this.connection.onTaskMessage(taskId, callback);
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * 获取连接状态
   */
  getReadyState(): number {
    return this.isConnected() ? WebSocket.OPEN : WebSocket.CLOSED;
  }

  /**
   * 获取底层 AIAgentConnection 实例（供新代码使用）
   */
  getConnection(): AIAgentConnection | null {
    return this.connection;
  }
}

export const aiWebSocketService = new AIWebSocketService();
