import React, { useState, useCallback } from 'react';
import type { TemplateProps, ListData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { themeColorToText } from '../utils/theme-colors';

/** 虚拟滚动 hook */
function useVirtualScroll(totalCount: number, itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  const totalHeight = totalCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return { startIndex, endIndex, totalHeight, offsetY, onScroll };
}

export const ListTemplate: React.FC<TemplateProps<ListData>> = ({ data, onEvent }) => {
  const itemHeight = data.itemHeight || 40;
  const useVirtual = data.virtualScroll && data.items.length > 100;
  const maxItems = data.maxVisibleItems || data.items.length;
  const containerHeight = Math.min(maxItems, data.items.length) * itemHeight;

  const visibleItems = useVirtual ? data.items : (data.maxVisibleItems ? data.items.slice(0, data.maxVisibleItems) : data.items);

  const vs = useVirtualScroll(data.items.length, itemHeight, containerHeight);
  const virtualItems = useVirtual ? data.items.slice(vs.startIndex, vs.endIndex) : visibleItems;

  const renderItem = (item: typeof data.items[0], idx: number) => {
    const Icon = resolveIcon(item.icon);
    return (
      <div
        key={item.id}
        className={`px-4 flex items-center gap-2 border-b border-[var(--border-color)] ${
          data.selectable ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
        }`}
        style={useVirtual ? { height: `${itemHeight}px` } : { paddingTop: '8px', paddingBottom: '8px' }}
        onClick={data.selectable ? () => onEvent?.('list:select', { id: item.id }) : undefined}
      >
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${themeColorToText(item.color)}`} />}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--text-main)] truncate">{item.label}</div>
          {item.description && (
            <div className="text-[11px] text-[var(--text-dim)] truncate">{item.description}</div>
          )}
        </div>
        {item.badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${themeColorToText(item.badge.color)} bg-current/10`}>
            {item.badge.text}
          </span>
        )}
        {item.actions?.map(action => {
          const ActionIcon = resolveIcon(action.icon);
          return (
            <button
              key={action.id}
              onClick={(e) => { e.stopPropagation(); onEvent?.(action.id, { itemId: item.id }); }}
              className="text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors p-0.5 flex-shrink-0"
              title={action.tooltip || action.label}
            >
              {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>
    );
  };

  if (useVirtual) {
    return (
      <div
        className="overflow-y-auto"
        style={{ maxHeight: `${containerHeight}px` }}
        onScroll={vs.onScroll}
      >
        <div style={{ height: `${vs.totalHeight}px`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: `${vs.offsetY}px`, left: 0, right: 0 }}>
            {virtualItems.map((item, i) => renderItem(item, vs.startIndex + i))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {virtualItems.map((item, i) => renderItem(item, i))}
    </div>
  );
};
