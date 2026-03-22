import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { TemplateProps, ChartData } from '../types';
import { themeColorToHex } from '../utils/theme-colors';

export const BarChartTemplate: React.FC<TemplateProps<ChartData>> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(200);

  const maxPoints = data.maxPoints || 100;
  const chartHeight = data.height || 80;
  const yUnit = data.yUnit || '';

  // 响应式宽度
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 计算 Y 轴
  const yAxis = useMemo(() => {
    let allMax = 0;
    for (const series of data.series) {
      for (const val of series.data) {
        if (val > allMax) allMax = val;
      }
    }
    const paddedMax = allMax > 0 ? Math.max(allMax * 1.2, 10) : 10;
    return {
      max: paddedMax,
      labels: [Math.round(paddedMax), Math.round(paddedMax * 0.66), Math.round(paddedMax * 0.33)],
    };
  }, [data.series]);

  return (
    <div className="px-4 py-4 space-y-2">
      {/* 图例 */}
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

      {/* 图表区域 */}
      <div className="relative -ml-2" style={{ height: `${chartHeight}px` }}>
        {/* Y 轴标签 */}
        <div className="absolute left-0 top-0 text-[9px] font-mono text-[var(--text-dim)] opacity-40 flex flex-col justify-between h-full pointer-events-none z-10">
          {yAxis.labels.map((label, i) => (
            <span key={i}>{label}{yUnit}</span>
          ))}
        </div>

        {/* SVG 绘图区 */}
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
            {data.series.map((series, seriesIdx) => {
              const seriesData = series.data.slice(-maxPoints);
              const dataCount = seriesData.length;
              if (dataCount === 0) return null;

              const itemWidth = chartWidth / maxPoints;
              const offsetX = (maxPoints - dataCount) * itemWidth;
              const color = themeColorToHex(series.color);
              const seriesType = series.type || (seriesIdx === 0 ? 'bar' : 'line');

              if (seriesType === 'bar') {
                const barWidth = Math.max(1, itemWidth * 0.5);
                return (
                  <g key={seriesIdx}>
                    {seriesData.map((val, i) => {
                      if (val <= 0) return null;
                      const x = offsetX + (i + 0.5) * itemWidth - barWidth / 2;
                      const h = Math.min(0.95, Math.max(0.02, val / yAxis.max)) * chartHeight;
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={chartHeight - h}
                          width={barWidth}
                          height={h}
                          fill={color}
                          opacity={0.6}
                        />
                      );
                    })}
                  </g>
                );
              }

              // line type
              const normalizedData = seriesData.map(v => Math.min(v, yAxis.max));
              return (
                <g key={seriesIdx}>
                  {normalizedData.length >= 2 && (
                    <polyline
                      points={normalizedData.map((val, i) => {
                        const x = offsetX + (i + 0.5) * itemWidth;
                        const y = chartHeight - (val / yAxis.max) * chartHeight;
                        return `${x},${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {seriesData.map((_, i) => {
                    const cx = offsetX + (i + 0.5) * itemWidth;
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={chartHeight - 1.5}
                        r={Math.max(1, itemWidth * 0.2)}
                        fill={color}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
