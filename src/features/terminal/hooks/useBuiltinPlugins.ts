/**
 * useBuiltinPlugins - Builtin Plugin System React Hook
 *
 * Provides reactive access to builtin plugin registered sidebar panels and toolbar buttons.
 */

import { useState, useEffect, useCallback } from 'react';
import { builtinPluginManager } from '@/plugins/builtin';
import type { SidebarPanelRegistration, ToolbarToggleRegistration, BottomPanelRegistration } from '@/plugins/builtin';
import type { AIModeInfo, AIModelInfo } from '@/utils/types';

/** Get sidebar panels at a specific position */
export function useBuiltinSidebarPanels(position: 'left' | 'right') {
  const [panels, setPanels] = useState<SidebarPanelRegistration[]>([]);

  const refresh = useCallback(() => {
    setPanels(builtinPluginManager.getSidebarPanels(position));
  }, [position]);

  useEffect(() => {
    refresh();
    const disposable = builtinPluginManager.onUpdate(refresh);
    return () => disposable.dispose();
  }, [refresh]);

  return panels;
}

/** Get bottom panel list */
export function useBuiltinBottomPanels() {
  const [panels, setPanels] = useState<BottomPanelRegistration[]>([]);

  const refresh = useCallback(() => {
    setPanels(builtinPluginManager.getBottomPanels());
  }, []);

  useEffect(() => {
    refresh();
    const disposable = builtinPluginManager.onUpdate(refresh);
    return () => disposable.dispose();
  }, [refresh]);

  return panels;
}

/** Get toolbar toggle buttons */
export function useBuiltinToolbarToggles() {
  const [toggles, setToggles] = useState<ToolbarToggleRegistration[]>([]);

  const refresh = useCallback(() => {
    setToggles(builtinPluginManager.getToolbarToggles());
  }, []);

  useEffect(() => {
    refresh();
    const disposable = builtinPluginManager.onUpdate(refresh);
    return () => disposable.dispose();
  }, [refresh]);

  return toggles;
}

/** Get plugin-injected extra agent modes */
export function useExtraModes(): AIModeInfo[] {
  const [modes, setModes] = useState<AIModeInfo[]>([]);
  const refresh = useCallback(() => {
    setModes(builtinPluginManager.getExtraModes());
  }, []);
  useEffect(() => {
    refresh();
    const disposable = builtinPluginManager.onUpdate(refresh);
    return () => disposable.dispose();
  }, [refresh]);
  return modes;
}

/** Get plugin-injected extra AI models */
export function useExtraModels(): AIModelInfo[] {
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const refresh = useCallback(() => {
    setModels(builtinPluginManager.getExtraModels());
  }, []);
  useEffect(() => {
    refresh();
    const disposable = builtinPluginManager.onUpdate(refresh);
    return () => disposable.dispose();
  }, [refresh]);
  return models;
}

/** Manage panel visibility state */
export function usePanelVisibility(panelId: string, storageKeyPrefix?: string, defaultVisible = true) {
  const storageKey = storageKeyPrefix ? `${storageKeyPrefix}_visible` : `termcat_panel_${panelId}_visible`;

  const [isVisible, setIsVisible] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? saved === 'true' : defaultVisible;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, isVisible.toString());
  }, [isVisible, storageKey]);

  const toggle = useCallback(() => {
    setIsVisible(prev => !prev);
  }, []);

  return { isVisible, setIsVisible, toggle };
}

/** Manage panel width state */
export function usePanelWidth(panelId: string, storageKeyPrefix?: string, defaultWidth = 280) {
  const storageKey = storageKeyPrefix ? `${storageKeyPrefix}_width` : `termcat_panel_${panelId}_width`;

  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
  }, [width, storageKey]);

  return { width, setWidth };
}
