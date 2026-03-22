import React, { useState, useCallback } from 'react';
import type { TemplateProps, TabsData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { getTemplate } from './index';

export const TabsTemplate: React.FC<TemplateProps<TabsData>> = ({ data, onEvent }) => {
  const [activeTab, setActiveTab] = useState(data.activeTab || data.tabs[0]?.id || '');

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    onEvent?.('tabs:change', { tabId });
  }, [onEvent]);

  const currentTab = data.tabs.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col">
      {/* Tab 栏 */}
      <div className="flex border-b overflow-x-auto no-scrollbar" style={{ borderColor: 'var(--border-color)' }}>
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

      {/* Tab 内容 */}
      {currentTab && (
        <div>
          {currentTab.sections.map((section, idx) => {
            const Template = getTemplate(section.template);
            if (!Template) return null;
            return <Template key={section.id || idx} data={section.data} variant={section.variant} onEvent={onEvent} />;
          })}
        </div>
      )}
    </div>
  );
};
