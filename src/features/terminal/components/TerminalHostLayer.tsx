/**
 * TerminalHostLayer — Flat layer that hosts every active session's TerminalView
 * at App root. Each session owns a stable detached <div> container; createPortal
 * renders the TerminalView into that container once and never changes target.
 * When a session moves between panes/tabs, we physically re-parent the stable
 * container with appendChild (a native DOM operation that does NOT cause React
 * to unmount the portaled subtree). This preserves the xterm instance and the
 * underlying SSH/PTY connection across cross-tab drags.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TerminalView } from './TerminalView';
import { findPaneNode, countPanes, collectAllPaneIds } from '../utils/split-layout';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import type { Tab } from '../types';
import type { Session, ThemeType, TerminalThemeType } from '@/utils/types';
import type { MinimalPanelStates } from '@/features/shared/components/Header';

interface PanelPortalsEntry {
  left: { current: HTMLDivElement | null };
  bottom: { current: HTMLDivElement | null };
  right: { current: HTMLDivElement | null };
}

export interface TerminalHostLayerProps {
  activeSessions: Session[];
  tabs: Tab[];
  currentTabId: string | null;
  slotMap: Map<string, HTMLDivElement>;
  stagingRef: React.MutableRefObject<HTMLDivElement | null>;
  panePortalMapRef: React.MutableRefObject<Map<string, PanelPortalsEntry>>;
  portalVersion: number;
  theme: ThemeType;
  terminalTheme: TerminalThemeType;
  terminalFontSize: number;
  defaultFocusTarget: 'input' | 'terminal';
  minimalPanelStates: MinimalPanelStates;
  setMinimalPanelStates: (s: MinimalPanelStates) => void;
  setEffectiveHostnameMap: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  setActivePane: (tabId: string, paneId: string) => void;
  setActiveSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  closePane: (tabId: string, paneId: string) => void;
}

export const TerminalHostLayer: React.FC<TerminalHostLayerProps> = (props) => {
  // Per-session stable portal containers. These DOM nodes are the only target
  // createPortal ever sees — they never change reference, so the portaled
  // TerminalView fiber is never unmounted.
  const containersRef = useRef(new Map<string, HTMLDivElement>());

  // Reverse map: sessionId → { tabId, paneId }
  const sessionLocation = useMemo(() => {
    const map = new Map<string, { tabId: string; paneId: string }>();
    for (const tab of props.tabs) {
      for (const pid of collectAllPaneIds(tab.layout)) {
        const pane = findPaneNode(tab.layout, pid);
        if (pane) map.set(pane.sessionId, { tabId: tab.id, paneId: pid });
      }
    }
    return map;
  }, [props.tabs]);

  // Lazily create a stable container for a session on first access.
  // Called synchronously during render — the `Map.has` guard makes it idempotent
  // so React StrictMode double-invocation is safe.
  const ensureContainer = (sessionId: string): HTMLDivElement => {
    let container = containersRef.current.get(sessionId);
    if (!container) {
      container = document.createElement('div');
      // display:contents removes the container's own box from layout; its children
      // (TerminalView's root with `flex h-full`) lay out as if they were direct
      // children of whatever slot currently holds this container. This avoids a
      // fragile `height: 100%` inheritance hop that breaks xterm's fit after
      // cross-tab reparent.
      container.style.display = 'contents';
      container.setAttribute('data-session-container', sessionId);
      containersRef.current.set(sessionId, container);
    }
    return container;
  };

  // Reparent stable containers to their current slot (or staging if no slot).
  // Runs whenever slotMap or activeSessions changes. Uses native appendChild,
  // which moves the DOM node without triggering React reconciliation.
  // useLayoutEffect so appendChild runs synchronously after DOM updates — before
  // XTermTerminal's isActive useEffect fires its deferred FitAddon.fit(). That
  // ensures fit measures the new slot's dimensions, not the detached / staging
  // state.
  useLayoutEffect(() => {
    for (const session of props.activeSessions) {
      const container = containersRef.current.get(session.id);
      if (!container) continue;
      const slot = props.slotMap.get(session.id);
      const staging = props.stagingRef.current;
      const target = slot ?? staging;
      if (target && container.parentElement !== target) {
        target.appendChild(container);
      }
    }
  }, [props.slotMap, props.activeSessions, props.stagingRef]);

  // Destroy stable containers for sessions that have been closed.
  useEffect(() => {
    const activeIds = new Set(props.activeSessions.map((s) => s.id));
    for (const id of Array.from(containersRef.current.keys())) {
      if (!activeIds.has(id)) {
        const el = containersRef.current.get(id);
        el?.remove();
        containersRef.current.delete(id);
      }
    }
  }, [props.activeSessions]);

  // Subscribe to plugin-initiated focus requests. When a plugin asks us to
  // move keyboard focus to a session's xterm, find the stable container
  // for that session and focus the embedded helper textarea.
  useEffect(() => {
    const api = (window as any).electron?.plugin?.onTerminalFocus;
    if (typeof api !== 'function') return;
    const off = api((data: { sessionId: string }) => {
      const container = containersRef.current.get(data.sessionId);
      if (!container) return;
      const textarea = container.querySelector(
        '.xterm-helper-textarea',
      ) as HTMLTextAreaElement | null;
      textarea?.focus();
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  return (
    <>
      {props.activeSessions.map((session) => {
        const loc = sessionLocation.get(session.id);
        if (!loc) {
          logger.warn(
            LOG_MODULE.TERMINAL,
            'terminal.session.orphan',
            'Session has no pane in layout — rendering to staging',
            { session_id: session.id, host: session.host.hostname },
          );
        }
        const tab = loc ? props.tabs.find((t) => t.id === loc.tabId) : null;
        const isActiveTab = loc?.tabId === props.currentTabId;
        const isPaneActive = tab ? tab.activePaneId === loc?.paneId : false;
        const isMultiPane = tab ? countPanes(tab.layout) > 1 : false;
        const panelPortals =
          isMultiPane && loc
            ? props.panePortalMapRef.current.get(loc.paneId)
            : undefined;

        const container = ensureContainer(session.id);

        return createPortal(
          <TerminalView
            host={session.host}
            onClose={() => {
              if (loc) {
                props.closePane(loc.tabId, loc.paneId);
              } else {
                // Orphan session — no pane to close; remove from activeSessions directly.
                props.setActiveSessions((prev) =>
                  prev.filter((s) => s.id !== session.id),
                );
              }
            }}
            theme={props.theme}
            terminalTheme={props.terminalTheme}
            terminalFontSize={props.terminalFontSize}
            isActive={isActiveTab}
            isPaneActive={isPaneActive}
            onPaneFocus={() =>
              loc && props.setActivePane(loc.tabId, loc.paneId)
            }
            paneOnly={isMultiPane && (!isPaneActive || !isActiveTab)}
            panelPortals={panelPortals}
            portalVersion={props.portalVersion}
            defaultFocusTarget={props.defaultFocusTarget}
            minimalPanelStates={props.minimalPanelStates}
            onMinimalPanelStatesChange={props.setMinimalPanelStates}
            initialDirectory={session.initialDirectory}
            onConnectionReady={(connId) => {
              props.setActiveSessions((prev) =>
                prev.map((s) =>
                  s.id === session.id ? { ...s, connectionId: connId } : s,
                ),
              );
            }}
            onEffectiveHostnameChange={(hostname) => {
              props.setEffectiveHostnameMap((prev) => ({
                ...prev,
                [session.id]: hostname,
              }));
            }}
          />,
          container,
          session.id,
        );
      })}
    </>
  );
};

TerminalHostLayer.displayName = 'TerminalHostLayer';
