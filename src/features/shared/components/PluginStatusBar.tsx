/**
 * Plugin status bar component
 *
 * Renders at the bottom of the application, displaying status bar items registered by plugins.
 */

import React from 'react';
import { usePluginStatusBar } from '@/features/terminal/hooks/usePlugins';
import type { StatusBarItem } from '@/plugins/types';

export const PluginStatusBar: React.FC = () => {
  const { items, handleClick } = usePluginStatusBar();

  if (items.length === 0) return null;

  const leftItems = items.filter(i => i.position === 'left').sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const rightItems = items.filter(i => i.position === 'right').sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return (
    <div className="flex items-center justify-between h-6 px-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] text-[10px] text-[var(--text-tertiary)] select-none">
      <div className="flex items-center gap-3">
        {leftItems.map(item => (
          <StatusBarEntry key={item.id} item={item} onClick={handleClick} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        {rightItems.map(item => (
          <StatusBarEntry key={item.id} item={item} onClick={handleClick} />
        ))}
      </div>
    </div>
  );
};

const StatusBarEntry: React.FC<{
  item: StatusBarItem;
  onClick: (item: StatusBarItem) => void;
}> = ({ item, onClick }) => {
  return (
    <button
      onClick={() => onClick(item)}
      title={item.tooltip}
      className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
    >
      {item.icon && <span className="opacity-70">{item.icon}</span>}
      <span>{item.text}</span>
    </button>
  );
};
