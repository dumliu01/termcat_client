import React from 'react';
import type { TemplateProps, MetricBarsData } from '../types';
import { themeColorToBg } from '../utils/theme-colors';

export const MetricBarsTemplate: React.FC<TemplateProps<MetricBarsData>> = ({ data }) => {
  return (
    <div className="p-4 space-y-4">
      {data.items.map((item, i) => {
        const max = item.max ?? 100;
        const percent = max > 0 ? (item.value / max) * 100 : 0;
        const displayValue = item.unit
          ? `${typeof item.value === 'number' ? item.value.toFixed(1) : item.value}${item.unit}`
          : `${typeof item.value === 'number' ? item.value.toFixed(1) : item.value}%`;

        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[var(--text-main)]">{item.label}</span>
              <div className="flex items-center gap-2">
                {item.detail && (
                  <span className="text-[var(--text-dim)] font-mono text-[10px] opacity-70">{item.detail}</span>
                )}
                <span className="text-[var(--text-main)]">{displayValue}</span>
              </div>
            </div>
            <div className="h-1.5 bg-black/5 rounded-full overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
              <div
                className={`h-full ${themeColorToBg(item.color)} transition-all duration-500`}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
