import React from 'react';
import type { TemplateProps, StatusBarData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { themeColorToText } from '../utils/theme-colors';

export const StatusBarTemplate: React.FC<TemplateProps<StatusBarData>> = ({ data, onEvent }) => {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-black/[0.03] border-t overflow-x-auto no-scrollbar" style={{ borderColor: 'var(--border-color)' }}>
      {data.items.map(item => {
        const Icon = resolveIcon(item.icon);
        const colorClass = themeColorToText(item.color || 'muted');

        return (
          <div
            key={item.id}
            className={`flex items-center gap-1 text-[10px] whitespace-nowrap ${
              item.clickable ? 'cursor-pointer hover:opacity-80' : ''
            } ${colorClass}`}
            title={item.tooltip}
            onClick={item.clickable ? () => onEvent?.(item.id, {}) : undefined}
          >
            {Icon && <Icon className="w-3 h-3" />}
            <span className="font-medium">{item.label}</span>
            {item.value && (
              <span className="text-[var(--text-dim)]">{item.value}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
