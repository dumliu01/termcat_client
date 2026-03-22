/**
 * UI 贡献点 React Hooks
 *
 * 提供模板驱动面板的数据订阅。
 */

import { useState, useEffect, useCallback } from 'react';
import { panelDataStore } from '@/plugins/ui-contribution/panel-data-store';
import type { PanelRegistration, SectionDescriptor } from '@/plugins/ui-contribution/types';

/** 获取指定插槽的面板列表 */
export function usePanelList(slot?: string): PanelRegistration[] {
  const [panels, setPanels] = useState<PanelRegistration[]>([]);

  const refresh = useCallback(() => {
    setPanels(panelDataStore.getPanels(slot));
  }, [slot]);

  useEffect(() => {
    refresh();
    const disposable = panelDataStore.onPanelListChange(refresh);
    return () => disposable.dispose();
  }, [refresh]);

  return panels;
}

/** 获取某个面板的 sections 数据 */
export function usePanelSections(panelId: string): SectionDescriptor[] {
  const [sections, setSections] = useState<SectionDescriptor[]>([]);

  const refresh = useCallback(() => {
    setSections(panelDataStore.getSections(panelId));
  }, [panelId]);

  useEffect(() => {
    refresh();
    const disposable = panelDataStore.onPanelDataChange(panelId, refresh);
    return () => disposable.dispose();
  }, [refresh, panelId]);

  return sections;
}
