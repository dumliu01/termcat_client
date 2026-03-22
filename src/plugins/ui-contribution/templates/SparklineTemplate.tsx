import React, { useRef, useState, useEffect } from 'react';
import type { TemplateProps, SparklineData } from '../types';
import { themeColorToHex } from '../utils/theme-colors';

export const SparklineTemplate: React.FC<TemplateProps<SparklineData>> = ({ data, variant }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(200);
  const height = data.height || (variant === 'compact' ? 24 : 40);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 兼容单条格式：{ data: number[], color, ... } → series 数组
  const series = data.series || (Array.isArray((data as any).data) ? [{ name: (data as any).label, data: (data as any).data, color: (data as any).color }] : []);

  return (
    <div className="px-4 py-2 space-y-2">
      {series.map((series, si) => {
        const points = series.data;
        if (points.length === 0) return null;

        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const range = max - min || 1;
        const color = themeColorToHex(series.color);
        const step = width / Math.max(points.length - 1, 1);

        const pathPoints = points.map((v, i) => {
          const x = i * step;
          const y = height - ((v - min) / range) * (height - 4) - 2;
          return `${x},${y}`;
        });

        const linePath = `M${pathPoints.join(' L')}`;
        const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

        return (
          <div key={si} className="flex items-center gap-2">
            {series.name && (
              <span className="text-[10px] text-[var(--text-dim)] w-12 flex-shrink-0 truncate">{series.name}</span>
            )}
            <div ref={si === 0 ? containerRef : undefined} className="flex-1" style={{ height }}>
              <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {data.showArea && (
                  <path d={areaPath} fill={color} opacity={0.15} />
                )}
                <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {data.showDots && points.map((v, i) => {
                  const x = i * step;
                  const y = height - ((v - min) / range) * (height - 4) - 2;
                  return <circle key={i} cx={x} cy={y} r={1.5} fill={color} />;
                })}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};
