/**
 * Terminal Session Manager Hook
 *
 * Manages activeSessions / currentSessionId state,
 * and tab drag-to-sort, rename and other interaction states.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Host, Session, ViewState } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

export function useSessionManager(setActiveView: (v: ViewState) => void) {
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Tab drag-to-sort
  const dragTabRef = useRef<{ sessionId: string; startIndex: number } | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  // Tab rename
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
   * Duplicate session: get source session current path, create new session of same type
   * Upper layer doesn't need to care about local / ssh difference
   */
  const duplicateSession = useCallback(async (sourceSession: Session) => {
    const session = activeSessions.find(s => s.id === sourceSession.id) || sourceSession;
    const isLocal = session.host.connectionType === 'local';

    // Unified way to get current path
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

  // When currentSessionId points to a session that has been removed, automatically switch to next available session
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
    // drag
    dragTabRef,
    dragOverTabId,
    setDragOverTabId,
    // rename
    renamingTabId,
    setRenamingTabId,
    renameValue,
    setRenameValue,
  };
}
