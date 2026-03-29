import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Host, SystemMetrics } from '@/utils/types';
import { X, PanelLeftClose, Activity, ArrowUp, ArrowDown, ChevronDown, HardDrive, ArrowUpDown } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';

interface MonitoringSidebarProps {
  host: Host;
  metrics: SystemMetrics;
  sidebarWidth: number;
  isVisible: boolean;
  onCloseSidebar: () => void;
  // Keep for backward compatibility, but these parameters are not used
  metricsHeight?: number;
  headerBg?: string;
  subHeaderBg?: string;
  onMouseDownResize?: (e: React.MouseEvent) => void;
  onMetricsHeightChange?: (height: number) => void;
}

type SortField = 'mem' | 'cpu' | 'name';
type SortOrder = 'asc' | 'desc';

export const MonitoringSidebar: React.FC<MonitoringSidebarProps> = React.memo(({
  host, metrics, sidebarWidth, isVisible, onCloseSidebar
}) => {
  const { language, t } = useI18n();
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(200);

  // Watch for chart container width changes - depends on isVisible, re-observe new DOM elements when panel is re-shown
  useEffect(() => {
    if (!isVisible || !chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [isVisible]);

  // Calculate network chart Y-axis max value and tick marks
  const networkChartData = useMemo(() => {
    const upData = metrics.netUpHistory || [];
    const downData = metrics.netDownHistory || [];
    const allData = [...upData, ...downData];

    if (allData.length === 0) {
      return { maxValue: 100, labels: [100, 66, 33, 0] };
    }

    // Find max value in current window
    const maxVal = Math.max(...allData);
    // If only one data point, give it some space
    const paddedMax = maxVal > 0 ? Math.max(maxVal * 1.2, 10) : 10;

    // Generate Y-axis tick marks (4 ticks)
    const labels = [
      Math.round(paddedMax),
      Math.round(paddedMax * 0.66),
      Math.round(paddedMax * 0.33),
      0
    ];

    return { maxValue: paddedMax, labels };
  }, [metrics.netUpHistory, metrics.netDownHistory]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const parseMem = (memStr: string) => {
    const val = parseFloat(memStr);
    if (memStr.includes('G')) return val * 1024;
    if (memStr.includes('K')) return val / 1024;
    return val;
  };

  const sortedProcesses = useMemo(() => {
    const processes = metrics.processes || [];
    return [...processes].sort((a, b) => {
      let valA: string | number, valB: string | number;

      if (sortField === 'cpu') {
        valA = parseFloat(a.cpu || '0');
        valB = parseFloat(b.cpu || '0');
      } else if (sortField === 'mem') {
        valA = parseMem(a.mem || '0');
        valB = parseMem(b.mem || '0');
      } else {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [metrics.processes, sortField, sortOrder]);

  if (!isVisible) return null;

  return (
    <aside
      style={{ width: `${sidebarWidth}px`, backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
      className="flex flex-col relative shrink-0 border-r overflow-y-auto no-scrollbar font-sans select-text"
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--text-main)]">
            {t.monitoring.onlineMonitor}
          </span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
        </div>
        <button
          onClick={onCloseSidebar}
          className="text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Host IP */}
      <div className="px-4 py-2 bg-black/5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-[var(--text-dim)] opacity-70 uppercase">HOST:</span>
          <span className="text-[12px] font-mono font-bold text-[var(--text-main)] tracking-wide">{host.hostname}</span>
        </div>
      </div>

      {/* Uptime and Load */}
      <div className="px-4 py-3 flex items-center justify-between border-b bg-black/[0.02]" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-dim)] font-bold">{t.monitoring.uptimeShort}</span>
          <span className="text-[11px] font-bold text-[var(--text-main)]">{metrics.uptime || '--'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-dim)] font-bold">{t.monitoring.loadShort}</span>
          <span className="text-[11px] font-mono font-bold text-[var(--text-main)]">{metrics.load || '--'}</span>
        </div>
      </div>

      {/* Resource Bars */}
      <div className="p-4 space-y-4">
          {[
            { label: 'CPU', val: metrics.cpu, color: 'bg-indigo-500', secondary: metrics.cpuCores + (language === 'zh' ? ' ' + t.monitoring.cores : ' Cores') },
            { label: t.monitoring.memShort, val: metrics.memPercent, color: 'bg-orange-400', secondary: metrics.memUsed + '/' + metrics.memTotal },
            { label: t.monitoring.swapShort, val: metrics.swapPercent, color: 'bg-slate-400', secondary: metrics.swapUsed + '/' + metrics.swapTotal }
          ].map((res, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[var(--text-main)]">{res.label}</span>
              <div className="flex items-center gap-2">
                {res.secondary && <span className="text-[var(--text-dim)] font-mono text-[10px] opacity-70">{res.secondary}</span>}
                <span className="text-[var(--text-main)]">{typeof res.val === 'number' ? res.val.toFixed(1) : '--'}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-black/5 rounded-full overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
              <div
                className={`h-full ${res.color} transition-all duration-500`}
                style={{ width: `${typeof res.val === 'number' ? res.val : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Process Table with Sorting */}
      <div className="flex flex-col shrink-0 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="bg-indigo-500/5 px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="grid grid-cols-[65px_60px_1fr] gap-2 text-[10px] font-black uppercase text-[var(--text-dim)]">
            <button
              onClick={() => handleSort('mem')}
              className={`flex items-center gap-1 hover:text-[var(--text-main)] transition-colors text-left ${sortField === 'mem' ? 'text-indigo-500' : ''}`}
            >
              <span>{t.monitoring.memShort}</span>
              {sortField === 'mem' && (sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
            </button>
            <button
              onClick={() => handleSort('cpu')}
              className={`flex items-center gap-1 hover:text-[var(--text-main)] transition-colors text-left ${sortField === 'cpu' ? 'text-indigo-500' : ''}`}
            >
              <span>CPU</span>
              {sortField === 'cpu' && (sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
            </button>
            <button
              onClick={() => handleSort('name')}
              className={`flex items-center gap-1 hover:text-[var(--text-main)] transition-colors text-left ${sortField === 'name' ? 'text-indigo-500' : ''}`}
            >
              <span>{t.monitoring.command}</span>
              {sortField === 'name' && (sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}
            </button>
          </div>
        </div>
        <div className="max-h-[160px] overflow-y-auto no-scrollbar">
          {(sortedProcesses || []).map((proc, i) => (
            <div key={i} className="px-4 py-1.5 grid grid-cols-[65px_60px_1fr] gap-2 items-center border-b hover:bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-0.5 h-3 bg-orange-400/40 shrink-0" />
                <span className="text-[11px] font-mono font-bold text-orange-500 truncate">{proc.mem || '--'}</span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-0.5 h-3 bg-cyan-400/40 shrink-0" />
                <span className="text-[11px] font-mono font-bold text-cyan-500 truncate">{proc.cpu || '--'}</span>
              </div>
              <span className="text-[11px] text-[var(--text-dim)] truncate font-mono" title={proc.name || '--'}>{proc.name || '--'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Network Monitoring Section */}
      <div className="px-4 py-4 space-y-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        {/* Network Speeds & Interface Selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <ArrowUp className="w-3.5 h-3.5 text-orange-500" strokeWidth={3} />
              <span className="text-[12px] font-mono font-bold text-orange-500">{typeof metrics.upSpeed === 'string' ? metrics.upSpeed.split(' ')[0] : '--'}K</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-500" strokeWidth={3} />
              <span className="text-[12px] font-mono font-bold text-emerald-500">{typeof metrics.downSpeed === 'string' ? metrics.downSpeed.split(' ')[0] : '--'}K</span>
            </div>
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-[var(--text-main)] transition-colors text-[var(--text-dim)]">
            <span className="text-[12px] font-mono font-bold">{metrics.ethName || '--'}</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>

        {/* Network Chart - fixed 100 time points, newest data on the right, fills from right to left */}
        <div className="relative h-20 -ml-2">
          {/* Y-axis labels - dynamic tick marks */}
          <div className="absolute left-0 top-0 text-[9px] font-mono text-[var(--text-dim)] opacity-40 flex flex-col justify-between h-full pointer-events-none z-10">
            <span>{networkChartData.labels[0]}K</span>
            <span>{networkChartData.labels[1]}K</span>
            <span>{networkChartData.labels[2]}K</span>
          </div>

          {/* Chart area - use ref to get actual width */}
          <div
            ref={chartContainerRef}
            className="h-full ml-8 relative border-b border-dotted overflow-hidden"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {(() => {
              const upData = metrics.netUpHistory || [];
              const downData = metrics.netDownHistory || [];
              const chartHeight = 80;
              const maxPoints = 100; // Max 100 time points to display

              // Take last maxPoints data
              const recentUpData = upData.slice(-maxPoints);
              const recentDownData = downData.slice(-maxPoints);
              const dataCount = recentDownData.length;

              if (dataCount === 0) return null;

              // Width per time point = total width / maxPoints (fixed 100 grid)
              const itemWidth = chartWidth / maxPoints;
              const barWidth = Math.max(1, itemWidth * 0.5);

              // Data starts from right: first data point x offset = (maxPoints - dataCount) * itemWidth
              const offsetX = (maxPoints - dataCount) * itemWidth;

              // Normalize download data for curve
              const normalizedDownData = recentDownData.map(v => Math.min(v, networkChartData.maxValue));

              return (
                <svg
                  className="absolute inset-0"
                  width={chartWidth}
                  height={chartHeight}
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                >
                  {/* Upload bars (orange) */}
                  {recentUpData.map((upVal, i) => {
                    if (upVal <= 0) return null;
                    const x = offsetX + (i + 0.5) * itemWidth - barWidth / 2;
                    const h = Math.min(0.95, Math.max(0.02, upVal / networkChartData.maxValue)) * chartHeight;
                    return (
                      <rect
                        key={`up-${i}`}
                        x={x}
                        y={chartHeight - h}
                        width={barWidth}
                        height={h}
                        fill="rgba(249,115,22,0.6)"
                      />
                    );
                  })}

                  {/* Download line (green) */}
                  {normalizedDownData.length >= 2 && (
                    <polyline
                      points={normalizedDownData.map((val, i) => {
                        const x = offsetX + (i + 0.5) * itemWidth;
                        const y = chartHeight - (val / networkChartData.maxValue) * chartHeight;
                        return `${x},${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Green time tick dots at bottom */}
                  {recentDownData.map((_, i) => {
                    const cx = offsetX + (i + 0.5) * itemWidth;
                    return (
                      <circle
                        key={`dot-${i}`}
                        cx={cx}
                        cy={chartHeight - 1.5}
                        r={Math.max(1, itemWidth * 0.2)}
                        fill="#10b981"
                      />
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Ping Section - Latency from local to host */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono font-bold text-cyan-500">{typeof metrics.ping === 'number' ? metrics.ping : '--'}ms</span>
            <span className="text-[11px] font-bold text-[var(--text-dim)]">{t.monitoring.local} → {host.hostname}</span>
          </div>
          {(() => {
            const pingData = metrics.pingHistory || [];
            const maxPingPoints = 100;
            const recentPing = pingData.slice(-maxPingPoints);
            const maxPing = recentPing.length > 0 ? Math.max(...recentPing, 10) : 40;
            const paddedMaxPing = maxPing * 1.2;
            const pingOffsetX = maxPingPoints - recentPing.length;

            return (
              <div className="relative">
                <div className="absolute left-0 top-0 text-[9px] font-mono text-[var(--text-dim)] opacity-40 flex flex-col justify-between h-full pointer-events-none">
                  <span>{Math.round(paddedMaxPing)}</span>
                  <span>{Math.round(paddedMaxPing * 0.66)}</span>
                  <span>{Math.round(paddedMaxPing * 0.33)}</span>
                </div>
                <div className="h-10 ml-8 bg-cyan-500/5 relative overflow-hidden">
                  {recentPing.length > 0 && (
                    <svg className="absolute inset-0" width="100%" height="100%" preserveAspectRatio="none"
                      viewBox={`0 0 ${maxPingPoints} 40`}>
                      {recentPing.map((val, i) => {
                        const x = pingOffsetX + i;
                        const h = Math.max(1, (val / paddedMaxPing) * 40);
                        return (
                          <rect
                            key={i}
                            x={x}
                            y={40 - h}
                            width={0.8}
                            height={h}
                            fill="rgba(6,182,212,0.3)"
                          />
                        );
                      })}
                    </svg>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Disk Usage Section */}
      <div className="mt-auto shrink-0 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="bg-black/5 px-4 py-1.5 flex justify-between text-[11px] font-black uppercase text-[var(--text-dim)] opacity-70">
          <span>{t.monitoring.path}</span>
          <span>{t.monitoring.freeTotal}</span>
        </div>
        <div className="space-y-1 py-1">
          {(metrics.disks || []).map((disk, i) => (
            <div key={i} className="px-4 py-1 flex justify-between items-center group">
              <span className="text-[11px] text-[var(--text-main)] font-mono truncate max-w-[100px]">{disk.path}</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[var(--text-dim)] font-mono">{disk.used}/{disk.total}</span>
                {i === 1 && <div className="w-2.5 h-3 bg-cyan-500/20 rounded-sm ml-1" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
});
