import React from 'react';
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react';
import type { TemplateProps, ProgressData } from '../types';
import { themeColorToHex } from '../utils/theme-colors';

const statusConfig = {
  running: { icon: Loader, color: '#6366f1', animate: true },
  success: { icon: CheckCircle, color: '#10b981', animate: false },
  error: { icon: XCircle, color: '#ef4444', animate: false },
  pending: { icon: Clock, color: '#94a3b8', animate: false },
};

export const ProgressTemplate: React.FC<TemplateProps<ProgressData>> = ({ data, variant }) => {
  const isCompact = variant === 'compact';

  return (
    <div className={`flex ${data.layout === 'horizontal' ? 'flex-row flex-wrap gap-4' : 'flex-col gap-2'} px-4 py-3`}>
      {data.items.map((item, i) => {
        const max = item.max || 100;
        const pct = Math.min(item.value / max, 1) * 100;
        const status = item.status || 'running';
        const cfg = statusConfig[status];
        const StatusIcon = cfg.icon;
        const barColor = item.color ? themeColorToHex(item.color) : cfg.color;

        return (
          <div key={i} className={`flex-1 min-w-0 ${data.layout === 'horizontal' ? 'min-w-[120px]' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
              <StatusIcon
                className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.animate ? 'animate-spin' : ''}`}
                style={{ color: cfg.color }}
              />
              <span className={`text-[var(--text-main)] truncate ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                {item.label}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] ml-auto flex-shrink-0">
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: barColor,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            {item.description && !isCompact && (
              <p className="text-[10px] text-[var(--text-dim)] mt-0.5 truncate">{item.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
