import React, { useState, useCallback } from 'react';
import type { TemplateProps, TabsData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { getTemplate } from './index';

export const TabsTemplate: React.FC<TemplateProps<TabsData>> = ({ data, onEvent }) => {
  const [activeTab, setActiveTab] = useState(data.activeTab || data.tabs[0]?.id || '');

  // Programmatic tab switching: when the plugin bumps `activeTabNonce`, force
  // local state to `data.activeTab` regardless of whether the user had clicked
  // elsewhere. Without the nonce, user clicks would be "sticky" and plugin
  // could never re-route to the same tab twice.
  const lastNonceRef = React.useRef(data.activeTabNonce);
  React.useEffect(() => {
    if (data.activeTabNonce !== undefined && data.activeTabNonce !== lastNonceRef.current) {
      if (data.activeTab) setActiveTab(data.activeTab);
      lastNonceRef.current = data.activeTabNonce;
    }
  }, [data.activeTabNonce, data.activeTab]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    onEvent?.('tabs:change', { tabId });
  }, [onEvent]);

  const currentTab = data.tabs.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab 栏 */}
      <div className="flex border-b overflow-x-auto no-scrollbar shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        {data.tabs.map(tab => {
          const Icon = resolveIcon(tab.icon);
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? 'text-indigo-500 border-indigo-500'
                  : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-main)]'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              {tab.badge && (
                <span className="text-[9px] bg-indigo-500/10 text-indigo-500 px-1 py-0.5 rounded-full font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 — flex-1 min-h-0 lets nested msg-viewer / scrollable templates
          size against the remaining vertical space. */}
      {currentTab && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {currentTab.sections.map((section, idx) => {
            const Template = getTemplate(section.template);
            if (!Template) return null;
            const rendered = (
              <Template key={section.id || idx} data={section.data} variant={section.variant} onEvent={onEvent} />
            );
            if (section.fill) {
              return (
                <div key={section.id || idx} className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {rendered}
                </div>
              );
            }
            return rendered;
          })}
        </div>
      )}
    </div>
  );
};
