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

export const ListTemplate: React.FC<TemplateProps<ListData>> = ({ data, variant, onEvent }) => {
  const itemHeight = data.itemHeight || 40;
  const useVirtual = data.virtualScroll && data.items.length > 100;
  const maxItems = data.maxVisibleItems || data.items.length;
  const containerHeight = Math.min(maxItems, data.items.length) * itemHeight;

  const visibleItems = useVirtual ? data.items : (data.maxVisibleItems ? data.items.slice(0, data.maxVisibleItems) : data.items);

  const vs = useVirtualScroll(data.items.length, itemHeight, containerHeight);
  const virtualItems = useVirtual ? data.items.slice(vs.startIndex, vs.endIndex) : visibleItems;

  const nested = variant === 'nested';
  // Items in a nested list: extra left indent, subtle background tint, indigo
  // accent border on the left to show they belong to the parent row above.
  const itemPaddingX = nested ? 'pl-10 pr-4' : 'px-4';

  const renderItem = (item: typeof data.items[0], idx: number) => {
    const Icon = resolveIcon(item.icon);
    const LeadingIcon = item.leadingAction ? resolveIcon(item.leadingAction.icon) : null;
    return (
      <div
        key={item.id}
        className={`${itemPaddingX} flex items-center gap-2 border-b border-[var(--border-color)] ${
          data.selectable ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
        }`}
        style={useVirtual ? { height: `${itemHeight}px` } : { paddingTop: '8px', paddingBottom: '8px' }}
        onClick={data.selectable ? () => onEvent?.('list:select', { id: item.id }) : undefined}
        title={item.tooltip}
      >
        {item.leadingAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEvent?.(item.leadingAction!.id, { itemId: item.id });
            }}
            className="shrink-0 w-5 h-5 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded"
            title={item.leadingAction.tooltip || item.leadingAction.label}
          >
            {LeadingIcon && <LeadingIcon className="w-3.5 h-3.5" />}
          </button>
        )}
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${themeColorToText(item.color)}`} />}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--text-main)] truncate select-text cursor-text">{item.label}</div>
          {item.inlineBadges && item.inlineBadges.length > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              {item.inlineBadges.map((b, bi) => {
                const BadgeIcon = resolveIcon(b.icon);
                return (
                  <span
                    key={bi}
                    className={`inline-flex items-center gap-0.5 text-[11px] ${themeColorToText(b.color)}`}
                  >
                    {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                    <span className="select-text cursor-text">{b.text}</span>
                  </span>
                );
              })}
            </div>
          )}
          {item.description && !item.inlineBadges && (
            <div className="text-[11px] text-[var(--text-dim)] truncate select-text cursor-text">{item.description}</div>
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

  // Outer container styling for nested sub-lists: tinted bg, left accent bar.
  const containerClass = nested
    ? 'flex flex-col border-l-2 border-indigo-500/40 bg-black/15'
    : 'flex flex-col';

  if (useVirtual) {
    return (
      <div
        className={`overflow-y-auto ${nested ? 'border-l-2 border-indigo-500/40 bg-black/15' : ''}`}
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
    <div className={containerClass}>
      {virtualItems.map((item, i) => renderItem(item, i))}
    </div>
  );
};
