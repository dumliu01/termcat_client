/**
 * 监控侧栏面板组件（插件版）
 *
 * 从 src/components/MonitoringSidebar.tsx 迁移而来。
 * 现在作为内置插件的 React 组件，自行管理 SystemMonitorService 生命周期。
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Host, SystemMetrics } from '@/utils/types';
import { X, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { SystemMonitorService } from './services/systemMonitorService';
import { useT } from './i18n';
import type { SidebarPanelProps } from '../types';

// 默认空指标
const EMPTY_METRICS: SystemMetrics = {
  cpu: 0, cpuCores: 0, memPercent: 0, memUsed: '--', memTotal: '--',
  swapPercent: 0, swapUsed: '--', swapTotal: '--', load: '--', uptime: '--',
  upSpeed: '--', downSpeed: '--', ping: 0, ethName: '--',
  netUpHistory: [], netDownHistory: [], pingHistory: [],
  processes: [], disks: [],
};

type SortField = 'mem' | 'cpu' | 'name';
type SortOrder = 'asc' | 'desc';

export const MonitoringSidebarPanel: React.FC<SidebarPanelProps> = React.memo(({
  connectionId, host: hostProp, width, isVisible, isActive, language, onClose,
}) => {
  const host = hostProp as Host;
  const t = useT();
  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(200);
  const monitorRef = useRef<SystemMonitorService | null>(null);

  // 管理 SystemMonitorService 生命周期
  useEffect(() => {
    if (!connectionId) return;

    // 获取 OS 信息并启动监控
    window.electron.sshGetOSInfo(connectionId).then((osInfo) => {
      const { SSHCmdExecutor } = require('@/core/terminal/SSHCmdExecutor');
      const monitor = new SystemMonitorService(new SSHCmdExecutor(connectionId), (m) => {
        setMetrics(m);
      }, host.hostname, osInfo?.osType);
      monitorRef.current = monitor;

      // 如果当前可见且活跃，立即启动
      if (isVisible && isActive) {
        monitor.start(3000);
      }
    });

    return () => {
      if (monitorRef.current) {
        monitorRef.current.stop();
        monitorRef.current = null;
      }
    };
  }, [connectionId, host.hostname]);

  // 根据可见性和活跃状态控制监控启停
  useEffect(() => {
    const monitor = monitorRef.current;
    if (!monitor) return;

    const shouldRun = isActive && isVisible;
    if (shouldRun) {
      if (!monitor.isRunning) monitor.start(3000);
    } else {
      if (monitor.isRunning) monitor.stop();
    }
  }, [isActive, isVisible]);

  // 监听图表容器宽度变化
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

  // 计算网络图表的Y轴最大值和刻度
  const networkChartData = useMemo(() => {
    const upData = metrics.netUpHistory || [];
    const downData = metrics.netDownHistory || [];
    const allData = [...upData, ...downData];

    if (allData.length === 0) {
      return { maxValue: 100, labels: [100, 66, 33, 0] };
    }

    const maxVal = Math.max(...allData);
    const paddedMax = maxVal > 0 ? Math.max(maxVal * 1.2, 10) : 10;

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
      style={{ width: `${width}px`, backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
      className="flex flex-col relative shrink-0 border-r overflow-y-auto no-scrollbar font-sans select-text"
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--text-main)]">
            {t.onlineMonitor}
          </span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
        </div>
        <button
          onClick={onClose}
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
          <span className="text-[11px] text-[var(--text-dim)] font-bold">{t.uptimeShort}</span>
          <span className="text-[11px] font-bold text-[var(--text-main)]">{metrics.uptime || '--'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-dim)] font-bold">{t.loadShort}</span>
          <span className="text-[11px] font-mono font-bold text-[var(--text-main)]">{metrics.load || '--'}</span>
        </div>
      </div>

      {/* Resource Bars */}
      <div className="p-4 space-y-4">
        {[
          { label: 'CPU', val: metrics.cpu, color: 'bg-indigo-500', secondary: metrics.cpuCores + ' ' + t.cores },
          { label: t.memShort, val: metrics.memPercent, color: 'bg-orange-400', secondary: metrics.memUsed + '/' + metrics.memTotal },
          { label: t.swapShort, val: metrics.swapPercent, color: 'bg-slate-400', secondary: metrics.swapUsed + '/' + metrics.swapTotal }
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
              <span>{t.memShort}</span>
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
              <span>{t.command}</span>
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

        {/* Network Chart */}
        <div className="relative h-20 -ml-2">
          <div className="absolute left-0 top-0 text-[9px] font-mono text-[var(--text-dim)] opacity-40 flex flex-col justify-between h-full pointer-events-none z-10">
            <span>{networkChartData.labels[0]}K</span>
            <span>{networkChartData.labels[1]}K</span>
            <span>{networkChartData.labels[2]}K</span>
          </div>
          <div
            ref={chartContainerRef}
            className="h-full ml-8 relative border-b border-dotted overflow-hidden"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {(() => {
              const upData = metrics.netUpHistory || [];
              const downData = metrics.netDownHistory || [];
              const chartHeight = 80;
              const maxPoints = 100;
              const recentUpData = upData.slice(-maxPoints);
              const recentDownData = downData.slice(-maxPoints);
              const dataCount = recentDownData.length;
              if (dataCount === 0) return null;
              const itemWidth = chartWidth / maxPoints;
              const barWidth = Math.max(1, itemWidth * 0.5);
              const offsetX = (maxPoints - dataCount) * itemWidth;
              const normalizedDownData = recentDownData.map(v => Math.min(v, networkChartData.maxValue));

              return (
                <svg className="absolute inset-0" width={chartWidth} height={chartHeight}
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                  {recentUpData.map((upVal, i) => {
                    if (upVal <= 0) return null;
                    const x = offsetX + (i + 0.5) * itemWidth - barWidth / 2;
                    const h = Math.min(0.95, Math.max(0.02, upVal / networkChartData.maxValue)) * chartHeight;
                    return <rect key={`up-${i}`} x={x} y={chartHeight - h} width={barWidth} height={h} fill="rgba(249,115,22,0.6)" />;
                  })}
                  {normalizedDownData.length >= 2 && (
                    <polyline
                      points={normalizedDownData.map((val, i) => {
                        const x = offsetX + (i + 0.5) * itemWidth;
                        const y = chartHeight - (val / networkChartData.maxValue) * chartHeight;
                        return `${x},${y}`;
                      }).join(' ')}
                      fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    />
                  )}
                  {recentDownData.map((_, i) => {
                    const cx = offsetX + (i + 0.5) * itemWidth;
                    return <circle key={`dot-${i}`} cx={cx} cy={chartHeight - 1.5} r={Math.max(1, itemWidth * 0.2)} fill="#10b981" />;
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        {/* Ping Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono font-bold text-cyan-500">{typeof metrics.ping === 'number' ? metrics.ping : '--'}ms</span>
            <span className="text-[11px] font-bold text-[var(--text-dim)]">{t.local} → {host.hostname}</span>
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
                        return <rect key={i} x={x} y={40 - h} width={0.8} height={h} fill="rgba(6,182,212,0.3)" />;
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
          <span>{t.path}</span>
          <span>{t.freeTotal}</span>
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
