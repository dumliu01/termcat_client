import React from 'react';
import { X } from 'lucide-react';
import type { TemplateProps, HeaderData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { themeColorToText } from '../utils/theme-colors';

export const HeaderTemplate: React.FC<TemplateProps<HeaderData>> = ({ data, onEvent }) => {
  const Icon = resolveIcon(data.icon);

  return (
    <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-[var(--text-dim)]" />}
        <span className="text-sm font-bold text-[var(--text-main)]">{data.title}</span>
        {data.subtitle && (
          <span className="text-[11px] text-[var(--text-dim)]">{data.subtitle}</span>
        )}
        {data.badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${themeColorToText(data.badge.color)} bg-current/10`}>
            {data.badge.text}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {data.actions?.map(action => {
          const ActionIcon = resolveIcon(action.icon);
          return (
            <button
              key={action.id}
              onClick={() => onEvent?.(action.id, {})}
              className="text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors p-0.5"
              title={action.tooltip || action.label}
            >
              {ActionIcon ? <ActionIcon className="w-4 h-4" /> : <X className="w-4 h-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
