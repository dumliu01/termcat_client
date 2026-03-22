/**
 * useSharedAIConnection — 用户级共享 AI WebSocket 连接管理
 *
 * 核心特性：
 * - 懒建连：不主动建连，通过 ensureConnected() 按需建连
 * - 空闲断连：所有会话空闲超时后自动断开（默认 2 分钟）
 * - 活跃任务保护：有进行中的任务时不会触发空闲断连
 * - 用户级共享：多个终端 Tab 共用同一条连接，切 Tab 零开销
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { AIAgentConnection } from '@/core/ai-agent';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 分钟

export type AIConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface SharedAIConnection {
  /** 当前连接实例（可能为 null） */
  connection: AIAgentConnection | null;
  /** 是否已连接 */
  isConnected: boolean;
  /** 连接状态：idle（未连接过）、connecting、connected、disconnected */
  connectionStatus: AIConnectionStatus;
  /** 确保连接已建立（懒建连入口） */
  ensureConnected: () => Promise<AIAgentConnection>;
  /** 标记活跃（收发消息时调用，重置空闲计时器） */
  markActive: () => void;
  /** 注册活跃任务（有任务期间不触发空闲断连） */
  holdConnection: (taskId: string) => void;
  /** 释放活跃任务（所有任务结束后恢复空闲倒计时） */
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

  // ---- 活跃任务追踪（用 Set 防止重复计数） ----
  const activeTasksRef = useRef<Set<string>>(new Set());

  const baseUrl = useMemo(() =>
    wsUrl
      || import.meta.env.VITE_AI_WS_BASE_URL
      || import.meta.env.VITE_WS_BASE_URL
      || 'ws://localhost:5001',
    [wsUrl]
  );

  // ---- 空闲计时器 ----
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    // 有活跃任务时不启动空闲倒计时
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

  // ---- 标记活跃 ----
  const markActive = useCallback(() => {
    if (connectionRef.current) {
      startIdleTimer();
    }
  }, [startIdleTimer]);

  // ---- 活跃任务管理 ----
  const holdConnection = useCallback((taskId: string) => {
    if (activeTasksRef.current.has(taskId)) return; // 同一任务不重复计数
    activeTasksRef.current.add(taskId);
    clearIdleTimer(); // 有任务了，取消正在进行的空闲倒计时
  }, [clearIdleTimer]);

  const releaseConnection = useCallback((taskId: string) => {
    if (!activeTasksRef.current.has(taskId)) return; // 未注册的任务忽略
    activeTasksRef.current.delete(taskId);
    // 所有任务都结束了，开始空闲倒计时
    if (activeTasksRef.current.size === 0) {
      startIdleTimer();
    }
  }, [startIdleTimer]);

  // ---- 懒建连 ----
  const ensureConnected = useCallback(async (): Promise<AIAgentConnection> => {
    // 已有可用连接
    if (connectionRef.current?.isConnected()) {
      startIdleTimer();
      return connectionRef.current;
    }

    const currentToken = tokenRef.current;
    if (!currentToken) {
      throw new Error('No auth token available');
    }

    // 清理旧连接（可能存在但已断开的）
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

  // ---- token 变化 / 登出清理 ----
  useEffect(() => {
    if (!token && connectionRef.current) {
      // 登出：立即断连
      clearIdleTimer();
      activeTasksRef.current.clear();
      connectionRef.current.disconnect();
      connectionRef.current = null;
      setIsConnected(false);
      setConnectionStatus('idle');
    }

    return () => {
      // token 引用变化时断开旧连接（下次 ensureConnected 用新 token）
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

  // ---- 组件卸载最终清理 ----
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
