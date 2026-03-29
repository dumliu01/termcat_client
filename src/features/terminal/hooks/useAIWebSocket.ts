import { useState, useEffect, useCallback, useRef } from 'react';
import { aiWebSocketService, AIMessage, AIMessageType } from '@/base/websocket/aiWebSocketService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * AI WebSocket Connection Hook
 *
 * Manages WebSocket connection state with AI service
 */
export const useAIWebSocket = (token: string | undefined) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // Use ref to track connection state, avoid race condition in StrictMode
  const connectingRef = useRef(false);

  useEffect(() => {
    // If no token, don't attempt connection
    if (!token) {
      setIsConnected(false);
      return;
    }

    let isMounted = true;

    const connect = async () => {
      // If already connected, return directly
      if (aiWebSocketService.isConnected()) {
        setIsConnected(true);
        return;
      }

      // If already connecting, skip (use ref to avoid race condition)
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
        // Ignore "Connection already in progress" error
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
 * AI Message Listener Hook
 *
 * Provides message listening and unsubscribe functionality
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
 * Send AI Question Hook
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
 * Confirm Execute Command Hook
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
 * Cancel Execute Hook
 */
export const useAICancelExecute = () => {
  const cancelExecute = useCallback((taskId: string, stepIndex: number) => {
    aiWebSocketService.cancelExecute(taskId, stepIndex);
  }, []);

  return { cancelExecute };
};

/**
 * Stop Task Hook
 */
export const useAIStopTask = () => {
  const stopTask = useCallback((taskId: string, frontendTaskId?: string) => {
    aiWebSocketService.stopTask(taskId, frontendTaskId);
  }, []);

  return { stopTask };
};

