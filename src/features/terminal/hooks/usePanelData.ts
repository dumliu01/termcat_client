/**
 * UI Contribution Point React Hooks
 *
 * Provides template-driven panel data subscription.
 */

import { useState, useEffect, useCallback } from 'react';
import { panelDataStore } from '@/plugins/ui-contribution/panel-data-store';
import type { PanelRegistration, SectionDescriptor } from '@/plugins/ui-contribution/types';

/** Get panel list for a specific slot */
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

/** Get sections data for a specific panel */
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
