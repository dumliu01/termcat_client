/**
 * useSharedAIConnection — User-level shared AI WebSocket connection management
 *
 * Core features:
 * - Lazy connection: Does not connect proactively; connects on-demand via ensureConnected()
 * - Idle disconnect: Auto-disconnects after idle timeout (default 2 minutes)
 * - Active task protection: Active tasks prevent idle disconnect
 * - User-level sharing: Multiple terminal tabs share the same connection, zero overhead on tab switch
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { AIAgentConnection } from '@/core/ai-agent';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export type AIConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface SharedAIConnection {
  /** Current connection instance (may be null) */
  connection: AIAgentConnection | null;
  /** Whether connected */
  isConnected: boolean;
  /** Connection status: idle (never connected), connecting, connected, disconnected */
  connectionStatus: AIConnectionStatus;
  /** Ensure connection is established (lazy connection entry point) */
  ensureConnected: () => Promise<AIAgentConnection>;
  /** Mark as active (called when sending/receiving messages, resets idle timer) */
  markActive: () => void;
  /** Register active task (prevents idle disconnect during task execution) */
  holdConnection: (taskId: string) => void;
  /** Release active task (resumes idle countdown when all tasks are complete) */
  releaseConnection: (taskId: string) => void;
}

export function useSharedAIConnection(
  token?: string,
  wsUrl?: string,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
): SharedAIConnection {
  const connectionRef = useRef<AIAgentConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<AIConnectionStatus>('idle');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // ---- Active task tracking (use Set to prevent duplicate counting) ----
  const activeTasksRef = useRef<Set<string>>(new Set());

  const baseUrl = useMemo(() =>
    wsUrl
      || import.meta.env.VITE_AI_WS_BASE_URL
      || import.meta.env.VITE_WS_BASE_URL
      || 'ws://localhost:5001',
    [wsUrl]
  );

  // ---- Idle timer ----
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    // Skip idle timer when there are active tasks
    if (activeTasksRef.current.size > 0) return;
    idleTimerRef.current = setTimeout(() => {
      if (connectionRef.current) {
        logger.info(LOG_MODULE.AI, 'ai.shared_conn.idle_disconnect', 'Idle timeout, disconnecting shared connection');
        connectionRef.current.disconnect();
        connectionRef.current = null;
        setIsConnected(false);
        setConnectionStatus('idle');
      }
    }, idleTimeoutMs);
  }, [idleTimeoutMs, clearIdleTimer]);

  // ---- Mark active ----
  const markActive = useCallback(() => {
    if (connectionRef.current) {
      startIdleTimer();
    }
  }, [startIdleTimer]);

  // ---- Active task management ----
  const holdConnection = useCallback((taskId: string) => {
    if (activeTasksRef.current.has(taskId)) return; // Prevent duplicate counting for the same task
    activeTasksRef.current.add(taskId);
    clearIdleTimer(); // Cancel any ongoing idle timer when there are active tasks
  }, [clearIdleTimer]);

  const releaseConnection = useCallback((taskId: string) => {
    if (!activeTasksRef.current.has(taskId)) return; // Ignore unregistered tasks
    activeTasksRef.current.delete(taskId);
    // All tasks completed, start idle countdown
    if (activeTasksRef.current.size === 0) {
      startIdleTimer();
    }
  }, [startIdleTimer]);

  // ---- Lazy connection ----
  const ensureConnected = useCallback(async (): Promise<AIAgentConnection> => {
    // Already has an available connection
    if (connectionRef.current?.isConnected()) {
      startIdleTimer();
      return connectionRef.current;
    }

    const currentToken = tokenRef.current;
    if (!currentToken) {
      throw new Error('No auth token available');
    }

    // Clean up old connection (may exist but disconnected)
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }

    const { AIAgentConnection } = await import('@/core/ai-agent');
    const connection = new AIAgentConnection({ wsUrl: baseUrl, token: currentToken });
    connectionRef.current = connection;
    setConnectionStatus('connecting');

    try {
      await connection.connect();
      setIsConnected(true);
      setConnectionStatus('connected');
      startIdleTimer();
      logger.info(LOG_MODULE.AI, 'ai.shared_conn.connected', 'Shared AI connection established');
      return connection;
    } catch (err) {
      connectionRef.current = null;
      setIsConnected(false);
      setConnectionStatus('disconnected');
      logger.error(LOG_MODULE.AI, 'ai.shared_conn.connect_failed', 'Failed to establish shared connection', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }, [baseUrl, startIdleTimer]);

  // ---- Token change / Logout cleanup ----
  useEffect(() => {
    if (!token && connectionRef.current) {
      // Logout: disconnect immediately
      clearIdleTimer();
      activeTasksRef.current.clear();
      connectionRef.current.disconnect();
      connectionRef.current = null;
      setIsConnected(false);
      setConnectionStatus('idle');
    }

    return () => {
      // Disconnect old connection when token reference changes (use new token on next ensureConnected)
      if (connectionRef.current) {
        clearIdleTimer();
        activeTasksRef.current.clear();
        connectionRef.current.disconnect();
        connectionRef.current = null;
        setIsConnected(false);
        setConnectionStatus('idle');
      }
    };
  }, [token, clearIdleTimer]);

  // ---- Final cleanup on component unmount ----
  useEffect(() => {
    return () => {
      clearIdleTimer();
      activeTasksRef.current.clear();
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }
    };
  }, [clearIdleTimer]);

  return useMemo(() => ({
    connection: connectionRef.current,
    isConnected,
    connectionStatus,
    ensureConnected,
    markActive,
    holdConnection,
    releaseConnection,
  }), [isConnected, connectionStatus, ensureConnected, markActive, holdConnection, releaseConnection]);
}
