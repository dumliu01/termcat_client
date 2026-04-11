/**
 * useSplitLayout — React hook wrapping layout tree pure functions.
 * Manages Tab[] state and exposes split/close/resize operations.
 */

import { useState, useCallback } from 'react';
import type { Tab, LayoutNode } from '../types';
import {
  splitPane as splitPaneFn,
  closePane as closePaneFn,
  resizeSplit as resizeSplitFn,
  firstPaneId,
} from '../utils/split-layout';

export function useSplitLayout() {
  const [tabs, setTabs] = useState<Tab[]>([]);

  /** Add a new single-pane tab */
  const addTab = useCallback((tabId: string, paneId: string, sessionId: string): void => {
    const newTab: Tab = {
      id: tabId,
      layout: { type: 'pane', paneId, sessionId },
      activePaneId: paneId,
    };
    setTabs(prev => [...prev, newTab]);
  }, []);

  /** Remove a tab entirely */
  const removeTab = useCallback((tabId: string): void => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
  }, []);

  /** Split a pane within a tab, returns the new Tab state */
  const splitPane = useCallback((
    tabId: string,
    paneId: string,
    direction: 'horizontal' | 'vertical',
    newPaneId: string,
    newSessionId: string,
  ): void => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab;
      const newLayout = splitPaneFn(tab.layout, paneId, direction, newPaneId, newSessionId);
      // Keep current pane active — switching immediately would cause panel flash
      // because the new pane's portal container refs aren't set until after commit.
      return { ...tab, layout: newLayout };
    }));
  }, []);

  /** Close a pane. Returns true if the tab should be removed (last pane closed). */
  const closePane = useCallback((tabId: string, paneId: string): boolean => {
    let shouldRemoveTab = false;
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab;
      const newLayout = closePaneFn(tab.layout, paneId);
      if (newLayout === null) {
        shouldRemoveTab = true;
        return tab; // will be removed by caller
      }
      const newActivePaneId = tab.activePaneId === paneId
        ? firstPaneId(newLayout)
        : tab.activePaneId;
      return { ...tab, layout: newLayout, activePaneId: newActivePaneId };
    }));
    return shouldRemoveTab;
  }, []);

  /** Update the split ratio for a divider identified by path */
  const resizePane = useCallback((tabId: string, path: number[], ratio: number): void => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab;
      return { ...tab, layout: resizeSplitFn(tab.layout, path, ratio) };
    }));
  }, []);

  /** Set active pane within a tab */
  const setActivePaneId = useCallback((tabId: string, paneId: string): void => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, activePaneId: paneId } : tab
    ));
  }, []);

  /** Reorder tabs by an ordered list of tab ids */
  const reorderTabs = useCallback((orderedIds: string[]): void => {
    setTabs(prev => {
      const map = new Map(prev.map(t => [t.id, t]));
      return orderedIds.map(id => map.get(id)).filter(Boolean) as Tab[];
    });
  }, []);

  return {
    tabs,
    setTabs,
    addTab,
    removeTab,
    splitPane,
    closePane,
    resizePane,
    setActivePaneId,
    reorderTabs,
  };
}
