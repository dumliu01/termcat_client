/**
 * useBuiltinPlugins - 内置插件系统 React Hook
 *
 * 提供内置插件注册的侧栏面板和工具栏按钮的响应式访问。
 */

import { useState, useEffect, useCallback } from 'react';
import { builtinPluginManager } from '@/plugins/builtin';
import type { SidebarPanelRegistration, ToolbarToggleRegistration, BottomPanelRegistration } from '@/plugins/builtin';

/** 获取指定位置的侧栏面板 */
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

/** 获取底部面板列表 */
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

/** 获取工具栏切换按钮 */
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

/** 管理面板可见性状态 */
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

/** 管理面板宽度状态 */
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
