/**
 * TabbedPanelGroup — 同一位置多面板 Tab 切换容器
 *
 * 当同一个 slot（左/右/底部）有多个面板时，用 Tab 切换显示。
 * 只有一个面板时不显示 Tab 栏。
 */

import React, { useState, useEffect } from 'react';
import { resolveIcon } from '@/plugins/ui-contribution/utils/icon-resolver';

export interface TabItem {
  id: string;
  title: string;
  icon?: string | React.ReactNode;
  content: React.ReactNode;
}

interface TabbedPanelGroupProps {
  tabs: TabItem[];
  defaultActiveTab?: string;
  className?: string;
}

export const TabbedPanelGroup: React.FC<TabbedPanelGroupProps> = ({
  tabs,
  defaultActiveTab,
  className = '',
}) => {
  const [activeTabId, setActiveTabId] = useState<string>(
    defaultActiveTab || tabs[0]?.id || ''
  );

  // 当 tabs 列表变化时，确保 activeTabId 仍然有效
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  if (tabs.length === 0) return null;

  // 只有一个 tab 时不显示 tab 栏
  if (tabs.length === 1) {
    return <>{tabs[0].content}</>;
  }

  const renderIcon = (icon: string | React.ReactNode | undefined) => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      const IconComp = resolveIcon(icon);
      if (IconComp) return <IconComp className="w-3.5 h-3.5" />;
      return null;
    }
    return icon;
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Tab 栏 */}
      <div
        className="flex items-center shrink-0 border-b overflow-x-auto no-scrollbar"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-white/5'
              }`}
            >
              {renderIcon(tab.icon)}
              <span>{tab.title}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="h-full"
            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};
