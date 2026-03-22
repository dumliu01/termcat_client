/**
 * 终端会话管理 Hook
 *
 * 管理 activeSessions / currentSessionId 状态，
 * 以及 Tab 拖拽排序、重命名等交互状态。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Host, Session, ViewState } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

export function useSessionManager(setActiveView: (v: ViewState) => void) {
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Tab 拖拽排序
  const dragTabRef = useRef<{ sessionId: string; startIndex: number } | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  // Tab 重命名
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleConnect = useCallback((host: Host, initialDirectory?: string) => {
    logger.info(LOG_MODULE.APP, 'app.session.connecting', 'Connecting to host', {
      module: LOG_MODULE.TERMINAL,
      host_id: host.id,
      host: host.hostname,
    });
    const sessionId = Math.random().toString(36).substr(2, 9);
    const newSession: Session = { id: sessionId, host: host, lines: [], initialDirectory };
    setActiveSessions(prev => [...prev, newSession]);
    setCurrentSessionId(sessionId);
    setActiveView('terminal');
  }, [setActiveView]);

  const handleLocalConnect = useCallback((options?: {
    shell?: string;
    cwd?: string;
    name?: string;
  }) => {
    logger.info(LOG_MODULE.APP, 'app.session.local_connecting', 'Opening local terminal', {
      module: LOG_MODULE.TERMINAL,
      shell: options?.shell,
    });
    const sessionId = Math.random().toString(36).substr(2, 9);
    const newSession: Session = {
      id: sessionId,
      host: {
        id: `local-${sessionId}`,
        name: options?.name || 'Local Terminal',
        hostname: 'localhost',
        username: '',
        port: 0,
        authType: 'password' as const,
        os: 'linux' as any,
        tags: [],
        connectionType: 'local' as const,
        localConfig: {
          shell: options?.shell,
          cwd: options?.cwd,
        },
      },
      lines: [],
    };
    setActiveSessions(prev => [...prev, newSession]);
    setCurrentSessionId(sessionId);
    setActiveView('terminal');
  }, [setActiveView]);

  /**
   * 复制会话：获取源 session 当前路径，创建同类型的新 session
   * 上层无需关心 local / ssh 差异
   */
  const duplicateSession = useCallback(async (sourceSession: Session) => {
    const session = activeSessions.find(s => s.id === sourceSession.id) || sourceSession;
    const isLocal = session.host.connectionType === 'local';

    // 统一获取当前路径
    let cwd: string | undefined;
    if (session.connectionId && (window as any).electron?.getSessionCwd) {
      const dir = await (window as any).electron.getSessionCwd(
        session.connectionId,
        isLocal ? 'local' : 'ssh',
      );
      if (dir) cwd = dir;
    }

    if (isLocal) {
      handleLocalConnect({ cwd });
    } else {
      handleConnect(session.host, cwd);
    }
  }, [activeSessions, handleConnect, handleLocalConnect]);

  const closeSession = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActiveSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (newSessions.length === 0) setActiveView('dashboard');
      return newSessions;
    });
    setCurrentSessionId(prev => {
      if (prev === id) return null;
      return prev;
    });
  }, [setActiveView]);

  // 当 currentSessionId 指向的 session 已被移除时，自动切换到下一个可用 session
  useEffect(() => {
    if (currentSessionId && !activeSessions.find(s => s.id === currentSessionId)) {
      if (activeSessions.length > 0) {
        setCurrentSessionId(activeSessions[0].id);
      } else {
        setCurrentSessionId(null);
        setActiveView('dashboard');
      }
    }
  }, [activeSessions, currentSessionId, setActiveView]);

  const resetSessions = useCallback(() => {
    setActiveSessions([]);
    setCurrentSessionId(null);
  }, []);

  return {
    activeSessions,
    setActiveSessions,
    currentSessionId,
    setCurrentSessionId,
    handleConnect,
    handleLocalConnect,
    duplicateSession,
    closeSession,
    resetSessions,
    // 拖拽
    dragTabRef,
    dragOverTabId,
    setDragOverTabId,
    // 重命名
    renamingTabId,
    setRenamingTabId,
    renameValue,
    setRenameValue,
  };
}
