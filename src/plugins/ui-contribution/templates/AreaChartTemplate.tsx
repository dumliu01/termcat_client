import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { TemplateProps, AreaChartData } from '../types';
import { themeColorToHex } from '../utils/theme-colors';

export const AreaChartTemplate: React.FC<TemplateProps<AreaChartData>> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(200);
  const maxPoints = data.maxPoints || 100;
  const chartHeight = data.height || 100;
  const yUnit = data.yUnit || '';

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setChartWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const yAxis = useMemo(() => {
    let allMax = 0;
    if (data.stacked) {
      // 对于堆叠模式，取同一index所有series值之和的最大值
      const maxLen = Math.max(...data.series.map(s => s.data.length));
      for (let i = 0; i < maxLen; i++) {
        let sum = 0;
        for (const s of data.series) sum += (s.data[i] || 0);
        if (sum > allMax) allMax = sum;
      }
    } else {
      for (const s of data.series) {
        for (const v of s.data) if (v > allMax) allMax = v;
      }
    }
    const paddedMax = allMax > 0 ? Math.max(allMax * 1.2, 10) : 10;
    return {
      max: paddedMax,
      labels: [Math.round(paddedMax), Math.round(paddedMax * 0.5), 0],
    };
  }, [data.series, data.stacked]);

  return (
    <div className="px-4 py-4 space-y-2">
      {data.legend && data.series.length > 1 && (
        <div className="flex items-center gap-4">
          {data.series.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: themeColorToHex(s.color) }} />
              <span className="text-[10px] text-[var(--text-dim)]">{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative -ml-2" style={{ height: `${chartHeight}px` }}>
        <div className="absolute left-0 top-0 text-[9px] font-mono text-[var(--text-dim)] opacity-40 flex flex-col justify-between h-full pointer-events-none z-10">
          {yAxis.labels.map((label, i) => (
            <span key={i}>{label}{yUnit}</span>
          ))}
        </div>

        <div
          ref={containerRef}
          className="h-full ml-8 relative border-b border-dotted overflow-hidden"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <svg
            className="absolute inset-0"
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            {data.series.map((series, si) => {
              const seriesData = series.data.slice(-maxPoints);
              if (seriesData.length === 0) return null;

              const step = chartWidth / Math.max(maxPoints - 1, 1);
              const offset = Math.max(0, maxPoints - seriesData.length) * step;
              const color = themeColorToHex(series.color);

              const points = seriesData.map((v, i) => {
                const x = offset + i * step;
                const y = chartHeight - (Math.min(v, yAxis.max) / yAxis.max) * chartHeight;
                return { x, y };
              });

              const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
              const areaPath = `${linePath} L${points[points.length - 1].x},${chartHeight} L${points[0].x},${chartHeight} Z`;

              return (
                <g key={si}>
                  <path d={areaPath} fill={color} opacity={0.15} />
                  <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
