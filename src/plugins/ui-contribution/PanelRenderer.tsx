/**
 * 通用面板渲染器
 *
 * 将 SectionDescriptor[] 映射为模板组件并渲染。
 */

import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { getTemplate } from './templates';
import { panelEventBus } from './panel-data-store';
import type { SectionDescriptor } from './types';
import { usePanelSections } from '@/features/terminal/hooks/usePanelData';

/** 面板渲染器 Props */
interface PanelRendererProps {
  panelId: string;
}

/** 面板渲染器 — 从 PanelDataStore 获取 sections 并渲染 */
export const PanelRenderer: React.FC<PanelRendererProps> = ({ panelId }) => {
  const sections = usePanelSections(panelId);

  const handleEvent = useCallback((eventId: string, payload: unknown) => {
    panelEventBus.emit(panelId, eventId, payload);
  }, [panelId]);

  if (sections.length === 0) return null;

  return (
    <>
      {sections.map((section, idx) => {
        const Template = getTemplate(section.template);
        if (!Template) {
          if (section.template === 'divider') {
            return <DividerSection key={section.id || idx} />;
          }
          return null;
        }

        if (section.collapsible) {
          return (
            <CollapsibleSection
              key={section.id || idx}
              defaultCollapsed={section.collapsed}
            >
              <Template data={section.data} variant={section.variant} onEvent={handleEvent} />
            </CollapsibleSection>
          );
        }

        return <Template key={section.id || idx} data={section.data} variant={section.variant} onEvent={handleEvent} />;
      })}
    </>
  );
};

/** 可折叠区域包装 */
const CollapsibleSection: React.FC<{
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}> = ({ defaultCollapsed = false, children }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div>
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full px-4 py-1 flex items-center gap-1 text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors bg-black/[0.02]"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {!collapsed && children}
    </div>
  );
};

/** 分割线 */
const DividerSection: React.FC = () => (
  <div className="border-t mx-4 my-2" style={{ borderColor: 'var(--border-color)' }} />
);
