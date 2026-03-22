import { useState, useEffect, useCallback, useRef } from 'react';
import { aiWebSocketService, AIMessage, AIMessageType } from '@/base/websocket/aiWebSocketService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * AI WebSocket 连接 Hook
 *
 * 管理与 AI 服务的 WebSocket 连接状态
 */
export const useAIWebSocket = (token: string | undefined) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // 使用 ref 跟踪连接状态，避免 StrictMode 下的竞态条件
  const connectingRef = useRef(false);

  useEffect(() => {
    // 如果没有 token，不尝试连接
    if (!token) {
      setIsConnected(false);
      return;
    }

    let isMounted = true;

    const connect = async () => {
      // 如果已经连接，直接返回
      if (aiWebSocketService.isConnected()) {
        setIsConnected(true);
        return;
      }

      // 如果正在连接中，跳过（使用 ref 避免竞态条件）
      if (connectingRef.current) {
        return;
      }

      connectingRef.current = true;
      setIsConnecting(true);

      try {
        await aiWebSocketService.connect(token);
        if (isMounted) {
          setIsConnected(true);
        }
      } catch (err) {
        // 忽略 "Connection already in progress" 错误
        if (err instanceof Error && err.message.includes('Connection already in progress')) {
          logger.warn(LOG_MODULE.AI, 'ai.ws.connection_in_progress', 'AI WebSocket connection already in progress, skipping', {
            module: LOG_MODULE.AI,
          });
        } else {
          logger.error(LOG_MODULE.AI, 'ai.ws.connection_failed', 'Failed to connect AI WebSocket', {
            module: LOG_MODULE.AI,
            error: 1,
            msg: err instanceof Error ? err.message : 'Unknown error',
          });
        }
        if (isMounted) {
          setIsConnected(false);
        }
      } finally {
        if (isMounted) {
          setIsConnecting(false);
        }
        connectingRef.current = false;
      }
    };

    connect();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return { isConnected, isConnecting };
};

/**
 * AI 消息监听 Hook
 *
 * 提供消息监听和取消监听的功能
 */
export const useAIMessageListener = (
  callback: (message: AIMessage) => void,
  deps: React.DependencyList = []
) => {
  useEffect(() => {
    if (!callback) return;

    const unsubscribe = aiWebSocketService.onMessage(callback);

    return () => {
      unsubscribe();
    };
  }, deps);
};

/**
 * 发送 AI 问题的 Hook
 */
export const useAISendQuestion = () => {
  const sendQuestion = useCallback((
    prompt: string,
    options?: {
      context?: Record<string, any>;
      model?: string;
      mode?: 'normal' | 'agent';
      hostId?: string;
      sessionId?: string;
    }
  ) => {
    aiWebSocketService.sendQuestion(prompt, options);
  }, []);

  return { sendQuestion };
};

/**
 * 确认执行命令的 Hook
 */
export const useAIConfirmExecute = () => {
  const confirmExecute = useCallback((
    taskId: string,
    stepIndex: number,
    result: {
      command: string;
      success: boolean;
      output: string;
      error?: string;
    },
    options?: {
      sessionId?: string;
      mode?: 'normal' | 'agent';
    }
  ) => {
    aiWebSocketService.confirmExecute(taskId, stepIndex, result, options);
  }, []);

  return { confirmExecute };
};

/**
 * 取消执行的 Hook
 */
export const useAICancelExecute = () => {
  const cancelExecute = useCallback((taskId: string, stepIndex: number) => {
    aiWebSocketService.cancelExecute(taskId, stepIndex);
  }, []);

  return { cancelExecute };
};

/**
 * 终止任务的 Hook
 */
export const useAIStopTask = () => {
  const stopTask = useCallback((taskId: string, frontendTaskId?: string) => {
    aiWebSocketService.stopTask(taskId, frontendTaskId);
  }, []);

  return { stopTask };
};

