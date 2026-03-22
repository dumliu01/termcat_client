import React from 'react';
import type { TemplateProps, MetricRingData } from '../types';
import { themeColorToHex } from '../utils/theme-colors';

export const MetricRingTemplate: React.FC<TemplateProps<MetricRingData>> = ({ data, variant }) => {
  const size = data.size || 64;
  const strokeWidth = data.strokeWidth || 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isCompact = variant === 'compact';
  const ringSize = isCompact ? Math.min(size, 48) : size;
  const ringRadius = (ringSize - strokeWidth) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  // 兼容单项格式：{ label, value, maxValue, ... } → items 数组
  const items = data.items || ((data as any).label != null ? [{ label: (data as any).label, value: (data as any).value, max: (data as any).maxValue ?? (data as any).max, unit: (data as any).unit, color: (data as any).color }] : []);

  return (
    <div className={`flex ${isCompact ? 'gap-3 px-4 py-2' : 'gap-6 px-4 py-4 justify-center'} flex-wrap`}>
      {items.map((item, i) => {
        const max = item.max || 100;
        const pct = Math.min(item.value / max, 1);
        const dashOffset = ringCircumference * (1 - pct);
        const color = themeColorToHex(item.color);

        return (
          <div key={i} className={`flex flex-col items-center ${isCompact ? 'gap-1' : 'gap-2'}`}>
            <svg
              width={ringSize}
              height={ringSize}
              className={isCompact ? '' : ''}
            >
              {/* 背景环 */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="var(--border-color)"
                strokeWidth={strokeWidth}
                opacity={0.3}
              />
              {/* 进度环 */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={ringCircumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
              {/* 中心文字 */}
              <text
                x={ringSize / 2}
                y={ringSize / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[var(--text-main)]"
                style={{ fontSize: isCompact ? '10px' : '13px', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}
              >
                {Math.round(item.value)}{item.unit || ''}
              </text>
            </svg>
            <span className={`text-[var(--text-dim)] font-medium ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
