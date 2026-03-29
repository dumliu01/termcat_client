/**
 * TabbedPanelGroup — Multi-panel Tab switch container at the same position
 *
 * When there are multiple panels in the same slot (left/right/bottom), use Tab to switch display.
 * Tab bar is not shown when there's only one panel.
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

  // When tabs list changes, ensure activeTabId is still valid
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  if (tabs.length === 0) return null;

  // Don't show tab bar when there's only one tab
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
      {/* Tab bar */}
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

      {/* Tab content */}
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
