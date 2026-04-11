/**
 * useTabManager — Unified Tab + Pane + Session management hook.
 * Wraps useSplitLayout (layout tree) and reuses session creation logic
 * from the existing useSessionManager pattern.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Host, Session, ViewState } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useSplitLayout } from './useSplitLayout';
import { findPaneNode, countPanes, collectAllPaneIds, removePaneFromTree, insertPaneAt, firstPaneId } from '../utils/split-layout';
import type { Tab, DropEdge } from '../types';

const MAX_PANES_PER_TAB = 9;

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function useTabManager(setActiveView: (v: ViewState) => void) {
  // --- Session state (flat list, same as old useSessionManager) ---
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);

  // --- Layout state ---
  const splitLayout = useSplitLayout();

  // --- Drag-to-sort (Tab level) ---
  // Uses `sessionId` field name for backward compatibility with TerminalTabBar
  const dragTabRef = useRef<{ sessionId: string; startIndex: number } | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  // --- Tab rename ---
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── Helpers ──

  const createSession = useCallback((host: Host, initialDirectory?: string): Session => {
    const sessionId = generateId();
    return { id: sessionId, host, lines: [], initialDirectory };
  }, []);

  const createLocalSession = useCallback((options?: {
    shell?: string;
    cwd?: string;
    name?: string;
  }): Session => {
    const sessionId = generateId();
    return {
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
  }, []);

  // ── Tab operations ──

  /** Create a new Tab with a single pane (SSH connection) */
  const handleConnect = useCallback((host: Host, initialDirectory?: string) => {
    logger.info(LOG_MODULE.APP, 'app.tab.connecting', 'Connecting to host (tab)', {
      module: LOG_MODULE.TERMINAL,
      host_id: host.id,
      host: host.hostname,
    });
    const session = createSession(host, initialDirectory);
    const tabId = generateId();
    const paneId = generateId();

    setActiveSessions(prev => [...prev, session]);
    splitLayout.addTab(tabId, paneId, session.id);
    setCurrentTabId(tabId);
    setActiveView('terminal');
  }, [setActiveView, createSession, splitLayout.addTab]);

  /** Create a new Tab with a local terminal */
  const handleLocalConnect = useCallback((options?: {
    shell?: string;
    cwd?: string;
    name?: string;
  }) => {
    logger.info(LOG_MODULE.APP, 'app.tab.local_connecting', 'Opening local terminal (tab)', {
      module: LOG_MODULE.TERMINAL,
      shell: options?.shell,
    });
    const session = createLocalSession(options);
    const tabId = generateId();
    const paneId = generateId();

    setActiveSessions(prev => [...prev, session]);
    splitLayout.addTab(tabId, paneId, session.id);
    setCurrentTabId(tabId);
    setActiveView('terminal');
  }, [setActiveView, createLocalSession, splitLayout.addTab]);

  /** Split the active pane of a tab */
  const splitPane = useCallback((
    tabId: string,
    paneId: string,
    direction: 'horizontal' | 'vertical',
  ) => {
    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Check max panes limit
    if (countPanes(tab.layout) >= MAX_PANES_PER_TAB) {
      logger.warn(LOG_MODULE.TERMINAL, 'tab.split.max_panes', 'Max panes per tab reached', {
        tabId,
        max: MAX_PANES_PER_TAB,
      });
      return;
    }

    // Get the source pane's session to determine host
    const sourcePane = findPaneNode(tab.layout, paneId);
    if (!sourcePane) return;

    const sourceSession = activeSessions.find(s => s.id === sourcePane.sessionId);
    if (!sourceSession) return;

    // Create new session with same host
    const isLocal = sourceSession.host.connectionType === 'local';
    const newSession = isLocal
      ? createLocalSession()
      : createSession(sourceSession.host);

    const newPaneId = generateId();

    setActiveSessions(prev => [...prev, newSession]);
    splitLayout.splitPane(tabId, paneId, direction, newPaneId, newSession.id);
  }, [splitLayout.tabs, activeSessions, createSession, createLocalSession, splitLayout.splitPane]);

  /** Close a single pane within a tab */
  const closePane = useCallback((tabId: string, paneId: string) => {
    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Find session to disconnect
    const pane = findPaneNode(tab.layout, paneId);
    if (pane) {
      setActiveSessions(prev => prev.filter(s => s.id !== pane.sessionId));
    }

    const shouldRemoveTab = splitLayout.closePane(tabId, paneId);

    if (shouldRemoveTab) {
      // Remove all sessions belonging to this tab
      const allPaneIds = collectAllPaneIds(tab.layout);
      const sessionIdsToRemove = new Set<string>();
      for (const pid of allPaneIds) {
        const p = findPaneNode(tab.layout, pid);
        if (p) sessionIdsToRemove.add(p.sessionId);
      }
      setActiveSessions(prev => prev.filter(s => !sessionIdsToRemove.has(s.id)));
      splitLayout.removeTab(tabId);

      // Switch to another tab or go to dashboard
      if (currentTabId === tabId) {
        const remaining = splitLayout.tabs.filter(t => t.id !== tabId);
        if (remaining.length > 0) {
          setCurrentTabId(remaining[0].id);
        } else {
          setCurrentTabId(null);
          setActiveView('dashboard');
        }
      }
    }
  }, [splitLayout.tabs, splitLayout.closePane, splitLayout.removeTab, currentTabId, setActiveView]);

  /** Close an entire tab */
  const closeTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Remove all sessions belonging to this tab
    const paneIds = collectAllPaneIds(tab.layout);
    const sessionIdsToRemove = new Set<string>();
    for (const pid of paneIds) {
      const p = findPaneNode(tab.layout, pid);
      if (p) sessionIdsToRemove.add(p.sessionId);
    }
    setActiveSessions(prev => prev.filter(s => !sessionIdsToRemove.has(s.id)));
    splitLayout.removeTab(tabId);

    if (currentTabId === tabId) {
      const remaining = splitLayout.tabs.filter(t => t.id !== tabId);
      if (remaining.length > 0) {
        setCurrentTabId(remaining[0].id);
      } else {
        setCurrentTabId(null);
        setActiveView('dashboard');
      }
    }
  }, [splitLayout.tabs, splitLayout.removeTab, currentTabId, setActiveView]);

  /** Set the active pane within a tab (with debounce for rapid clicks) */
  const setActivePane = useCallback((tabId: string, paneId: string) => {
    splitLayout.setActivePaneId(tabId, paneId);
  }, [splitLayout.setActivePaneId]);

  /** Get the currently active Session (active pane of the active tab) */
  const getActiveSession = useCallback((): Session | null => {
    const tab = splitLayout.tabs.find(t => t.id === currentTabId);
    if (!tab) return null;
    const pane = findPaneNode(tab.layout, tab.activePaneId);
    if (!pane) return null;
    return activeSessions.find(s => s.id === pane.sessionId) || null;
  }, [splitLayout.tabs, currentTabId, activeSessions]);

  /** Duplicate session: create new session with same host in a new tab */
  const duplicateSession = useCallback(async (sourceSession: Session) => {
    const session = activeSessions.find(s => s.id === sourceSession.id) || sourceSession;
    const isLocal = session.host.connectionType === 'local';

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

  const resetSessions = useCallback(() => {
    setActiveSessions([]);
    splitLayout.setTabs([]);
    setCurrentTabId(null);
  }, [splitLayout.setTabs]);

  // Auto-fix: when currentTabId no longer exists, switch to first available
  useEffect(() => {
    if (currentTabId && !splitLayout.tabs.find(t => t.id === currentTabId)) {
      if (splitLayout.tabs.length > 0) {
        setCurrentTabId(splitLayout.tabs[0].id);
      } else {
        setCurrentTabId(null);
        setActiveView('dashboard');
      }
    }
  }, [splitLayout.tabs, currentTabId, setActiveView]);

  // ── Drag-and-drop pane move operations ──

  /** Move a pane within the same tab to a new position */
  const movePaneToPane = useCallback((
    tabId: string,
    sourcePaneId: string,
    targetPaneId: string,
    edge: DropEdge,
  ) => {
    if (sourcePaneId === targetPaneId) return;

    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Find source pane's sessionId
    const sourcePane = findPaneNode(tab.layout, sourcePaneId);
    if (!sourcePane) return;
    const sessionId = sourcePane.sessionId;

    // Remove source pane from tree
    const { layout: layoutAfterRemove } = removePaneFromTree(tab.layout, sourcePaneId);
    if (!layoutAfterRemove) return; // should not happen since target still exists

    // Insert at target position
    const newPaneId = generateId();
    const newLayout = insertPaneAt(layoutAfterRemove, targetPaneId, newPaneId, sessionId, edge);

    splitLayout.setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      return { ...t, layout: newLayout, activePaneId: newPaneId };
    }));
  }, [splitLayout.tabs, splitLayout.setTabs]);

  /** Move an entire tab into another tab as a split pane */
  const moveTabToPane = useCallback((
    sourceTabId: string,
    targetTabId: string,
    targetPaneId: string,
    edge: DropEdge,
  ) => {
    if (sourceTabId === targetTabId) return;

    const sourceTab = splitLayout.tabs.find(t => t.id === sourceTabId);
    const targetTab = splitLayout.tabs.find(t => t.id === targetTabId);
    if (!sourceTab || !targetTab) return;

    // Get the active pane session from the source tab
    const activePane = findPaneNode(sourceTab.layout, sourceTab.activePaneId);
    if (!activePane) return;
    const keepSessionId = activePane.sessionId;

    // Remove all sessions from the source tab except the kept one
    const allSourcePaneIds = collectAllPaneIds(sourceTab.layout);
    const sessionIdsToRemove = new Set<string>();
    for (const pid of allSourcePaneIds) {
      const p = findPaneNode(sourceTab.layout, pid);
      if (p && p.sessionId !== keepSessionId) {
        sessionIdsToRemove.add(p.sessionId);
      }
    }
    if (sessionIdsToRemove.size > 0) {
      setActiveSessions(prev => prev.filter(s => !sessionIdsToRemove.has(s.id)));
    }

    // Remove source tab
    splitLayout.removeTab(sourceTabId);

    // Insert the kept session as a new pane in the target tab
    const newPaneId = generateId();
    const newLayout = insertPaneAt(targetTab.layout, targetPaneId, newPaneId, keepSessionId, edge);

    splitLayout.setTabs(prev => prev.map(t => {
      if (t.id !== targetTabId) return t;
      return { ...t, layout: newLayout, activePaneId: newPaneId };
    }));

    // Switch to target tab if source was current
    if (currentTabId === sourceTabId) {
      setCurrentTabId(targetTabId);
    }
  }, [splitLayout.tabs, splitLayout.removeTab, splitLayout.setTabs, currentTabId]);

  /** Move a pane from one tab to another tab */
  const movePaneBetweenTabs = useCallback((
    sourceTabId: string,
    sourcePaneId: string,
    targetTabId: string,
    targetPaneId: string,
    edge: DropEdge,
  ) => {
    if (sourceTabId === targetTabId) {
      // Same tab — use intra-tab move
      movePaneToPane(sourceTabId, sourcePaneId, targetPaneId, edge);
      return;
    }

    const sourceTab = splitLayout.tabs.find(t => t.id === sourceTabId);
    const targetTab = splitLayout.tabs.find(t => t.id === targetTabId);
    if (!sourceTab || !targetTab) return;

    const sourcePane = findPaneNode(sourceTab.layout, sourcePaneId);
    if (!sourcePane) return;
    const sessionId = sourcePane.sessionId;

    // Remove source pane from source tab
    const { layout: sourceLayoutAfter } = removePaneFromTree(sourceTab.layout, sourcePaneId);

    // Insert into target tab
    const newPaneId = generateId();
    const newTargetLayout = insertPaneAt(targetTab.layout, targetPaneId, newPaneId, sessionId, edge);

    splitLayout.setTabs(prev => {
      let result = prev;
      if (sourceLayoutAfter === null) {
        // Source tab had only one pane — remove it
        result = result.filter(t => t.id !== sourceTabId);
      } else {
        // Update source tab layout
        const newActivePaneId = sourceTab.activePaneId === sourcePaneId
          ? firstPaneId(sourceLayoutAfter)
          : sourceTab.activePaneId;
        result = result.map(t =>
          t.id === sourceTabId ? { ...t, layout: sourceLayoutAfter, activePaneId: newActivePaneId } : t
        );
      }
      // Update target tab layout
      result = result.map(t =>
        t.id === targetTabId ? { ...t, layout: newTargetLayout, activePaneId: newPaneId } : t
      );
      return result;
    });

    // Switch to target tab
    setCurrentTabId(targetTabId);
  }, [splitLayout.tabs, splitLayout.setTabs, movePaneToPane]);

  /** Extract a pane from a split tab into its own new tab */
  const extractPaneToTab = useCallback((sourceTabId: string, paneId: string) => {
    const tab = splitLayout.tabs.find(t => t.id === sourceTabId);
    if (!tab) return;

    const pane = findPaneNode(tab.layout, paneId);
    if (!pane) return;

    // If single pane, nothing to extract — it's already its own tab
    if (countPanes(tab.layout) <= 1) return;

    const sessionId = pane.sessionId;

    // Remove pane from source tab
    const { layout: sourceLayoutAfter } = removePaneFromTree(tab.layout, paneId);

    // Create new tab for the extracted pane
    const newTabId = generateId();
    const newPaneId = generateId();

    splitLayout.setTabs(prev => {
      let result = prev;
      if (sourceLayoutAfter === null) {
        result = result.filter(t => t.id !== sourceTabId);
      } else {
        const newActivePaneId = tab.activePaneId === paneId
          ? firstPaneId(sourceLayoutAfter)
          : tab.activePaneId;
        result = result.map(t =>
          t.id === sourceTabId ? { ...t, layout: sourceLayoutAfter, activePaneId: newActivePaneId } : t
        );
      }
      // Insert new tab after the source tab position
      const sourceIndex = result.findIndex(t => t.id === sourceTabId);
      const newTab: Tab = {
        id: newTabId,
        layout: { type: 'pane', paneId: newPaneId, sessionId },
        activePaneId: newPaneId,
      };
      const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : result.length;
      result = [...result.slice(0, insertAt), newTab, ...result.slice(insertAt)];
      return result;
    });

    setCurrentTabId(newTabId);
  }, [splitLayout.tabs, splitLayout.setTabs]);

  /** Extract a pane to a new Electron window */
  const extractPaneToNewWindow = useCallback((tabId: string, paneId: string) => {
    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const pane = findPaneNode(tab.layout, paneId);
    if (!pane) return;
    const session = activeSessions.find(s => s.id === pane.sessionId);
    if (!session) return;

    // Open new window with the same host
    const isLocal = session.host.connectionType === 'local';
    if (isLocal) {
      (window as any).electron?.windowCreate?.({ localTerminal: true });
    } else {
      (window as any).electron?.windowCreate?.({ hostToConnect: session.host });
    }

    // Close the pane in the current window
    closePane(tabId, paneId);
  }, [splitLayout.tabs, activeSessions, closePane]);

  /** Extract a tab to a new Electron window */
  const extractTabToNewWindow = useCallback((tabId: string) => {
    const tab = splitLayout.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Get the active pane's session for the new window
    const pane = findPaneNode(tab.layout, tab.activePaneId);
    if (!pane) return;
    const session = activeSessions.find(s => s.id === pane.sessionId);
    if (!session) return;

    // Open new window
    const isLocal = session.host.connectionType === 'local';
    if (isLocal) {
      (window as any).electron?.windowCreate?.({ localTerminal: true });
    } else {
      (window as any).electron?.windowCreate?.({ hostToConnect: session.host });
    }

    // Close the entire tab
    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
    closeTab(fakeEvent, tabId);
  }, [splitLayout.tabs, activeSessions, closeTab]);

  // ── Derived state ──

  /** Current tab object */
  const currentTab = splitLayout.tabs.find(t => t.id === currentTabId) || null;

  return {
    // Tab state
    tabs: splitLayout.tabs,
    currentTabId,
    setCurrentTabId,
    currentTab,

    // Session state (backward compat)
    activeSessions,
    setActiveSessions,

    // Tab operations
    handleConnect,
    handleLocalConnect,
    closeTab,
    duplicateSession,
    resetSessions,

    // Pane operations
    splitPane,
    closePane,
    setActivePane,
    resizePane: splitLayout.resizePane,
    reorderTabs: splitLayout.reorderTabs,
    movePaneToPane,
    moveTabToPane,
    movePaneBetweenTabs,
    extractPaneToTab,
    extractPaneToNewWindow,
    extractTabToNewWindow,

    // Derived
    getActiveSession,

    // Drag (tab level)
    dragTabRef,
    dragOverTabId,
    setDragOverTabId,

    // Rename
    renamingTabId,
    setRenamingTabId,
    renameValue,
    setRenameValue,
  };
}
