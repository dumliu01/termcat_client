/**
 * Builtin plugin: System Monitor Sidebar (Template-driven version)
 *
 * Uses UI contribution point system, pushes JSON data via setPanelData,
 * rendered by PanelRenderer. No longer uses custom React components.
 */

import { Activity } from 'lucide-react';
import type { BuiltinPlugin, ConnectionInfo } from '../types';
import type { SectionDescriptor } from '../../ui-contribution/types';
import { SystemMonitorService } from './services/systemMonitorService';
import { getLocale } from './i18n';
import { locales } from './locales';
import type { SystemMetrics } from '@/utils/types';
import { LocalCmdExecutor } from '@/core/terminal/LocalCmdExecutor';
import { SSHCmdExecutor } from '@/core/terminal/SSHCmdExecutor';
import type { ICmdExecutor } from '@/core/terminal/ICmdExecutor';

export const monitoringSidebarPlugin: BuiltinPlugin = {
  id: 'builtin-monitoring-sidebar',
  displayName: locales.zh.displayName,
  description: locales.zh.description,
  version: '2.0.0',
  getLocalizedName: (lang) => getLocale(lang).displayName,
  getLocalizedDescription: (lang) => getLocale(lang).description,

  activate(context) {
    // Register template-driven panel
    context.registerPanel({
      id: 'monitoring',
      title: locales.en.panelTitle,
      icon: 'activity',
      slot: 'sidebar-left',
      defaultSize: 280,
      defaultVisible: true,
      priority: 10,
    });

    // Register toolbar toggle button
    context.subscriptions.push(
      context.registerToolbarToggle({
        panelId: 'monitoring',
        icon: Activity,
        tooltip: locales.en.toggleTooltip,
        priority: 10,
      })
    );

    let monitor: SystemMonitorService | null = null;
    let currentInfo: ConnectionInfo | null = null;
    // Track latest visibility state independently, so async monitor creation
    // can use the current state instead of stale values from onConnectionChange
    let latestIsVisible = false;
    let latestIsActive = false;

    function buildSections(metrics: SystemMetrics, info: ConnectionInfo): SectionDescriptor[] {
      const t = getLocale(info.language);

      return [
        // Header
        {
          id: 'header',
          template: 'header',
          data: {
            title: t.onlineMonitor,
            badge: { text: 'LIVE', color: 'success' },
            actions: [{ id: 'close', icon: 'x' }],
          },
        },
        // Host IP
        {
          id: 'host-info',
          template: 'key-value',
          data: {
            pairs: [
              { key: 'HOST', value: info.hostname },
            ],
            layout: 'horizontal',
          },
        },
        // Uptime & Load
        {
          id: 'uptime-load',
          template: 'key-value',
          data: {
            pairs: [
              { key: t.uptimeShort, value: metrics.uptime || '--' },
              { key: t.loadShort, value: metrics.load || '--' },
            ],
            layout: 'horizontal',
          },
        },
        // Resource Bars
        {
          id: 'resources',
          template: 'metric-bars',
          data: {
            items: [
              { label: 'CPU', value: metrics.cpu, unit: '%', color: 'primary', detail: metrics.cpuCores + ' ' + t.cores },
              { label: t.memShort, value: metrics.memPercent, unit: '%', color: 'warning', detail: metrics.memUsed + '/' + metrics.memTotal },
              { label: t.swapShort, value: metrics.swapPercent, unit: '%', color: 'muted', detail: metrics.swapUsed + '/' + metrics.swapTotal },
            ],
          },
        },
        // Process Table
        {
          id: 'processes',
          template: 'table',
          data: {
            columns: [
              { id: 'mem', label: t.memShort, width: 65, sortable: true },
              { id: 'cpu', label: 'CPU', width: 55, sortable: true },
              { id: 'name', label: t.command, sortable: true },
            ],
            rows: (metrics.processes || []).map(p => ({
              mem: p.mem || '--',
              cpu: p.cpu || '--',
              name: p.name || '--',
            })),
            maxVisibleRows: 5,
            defaultSort: { column: 'cpu', order: 'desc' as const },
          },
          collapsible: true,
        },
        // Network Speed + Chart
        {
          id: 'network-info',
          template: 'key-value',
          data: {
            pairs: [
              { key: '↑', value: typeof metrics.upSpeed === 'string' ? metrics.upSpeed.split(' ')[0] + 'K' : '--', color: 'warning' },
              { key: '↓', value: typeof metrics.downSpeed === 'string' ? metrics.downSpeed.split(' ')[0] + 'K' : '--', color: 'success' },
              { key: 'NIC', value: metrics.ethName || '--' },
            ],
            layout: 'horizontal',
          },
        },
        {
          id: 'network-chart',
          template: 'bar-chart',
          data: {
            series: [
              { name: 'Upload', data: [...(metrics.netUpHistory || [])], color: 'warning', type: 'bar' as const },
              { name: 'Download', data: [...(metrics.netDownHistory || [])], color: 'success', type: 'line' as const },
            ],
            maxPoints: 100,
            height: 80,
            yUnit: 'K',
          },
        },
        // Ping
        {
          id: 'ping-info',
          template: 'key-value',
          data: {
            pairs: [
              { key: 'PING', value: (typeof metrics.ping === 'number' ? metrics.ping : '--') + 'ms', color: 'info' },
              { key: '', value: t.local + ' → ' + info.hostname },
            ],
            layout: 'horizontal',
          },
        },
        {
          id: 'ping-chart',
          template: 'bar-chart',
          data: {
            series: [
              { name: 'Ping', data: [...(metrics.pingHistory || [])], color: 'info', type: 'bar' as const },
            ],
            maxPoints: 100,
            height: 40,
            yUnit: 'ms',
          },
        },
        // Disk Usage
        {
          id: 'disks',
          template: 'table',
          data: {
            columns: [
              { id: 'path', label: t.path },
              { id: 'usage', label: t.freeTotal, align: 'right' as const },
            ],
            rows: (metrics.disks || []).map(d => ({
              path: d.path,
              usage: d.used + '/' + d.total,
            })),
          },
        },
      ];
    }

    // Per-connection metrics cache: show cached data instantly on tab switch
    const metricsCache = new Map<string, any[]>();

    // Listen for connection changes
    context.onConnectionChange((info) => {
      currentInfo = info;

      // Clean up old monitor
      if (monitor) {
        monitor.stop();
        monitor = null;
      }

      if (!info) {
        context.setPanelData('monitoring', []);
        latestIsVisible = false;
        latestIsActive = false;
        return;
      }

      // Show cached data immediately (no blank flash), or clear if no cache
      const cached = metricsCache.get(info.connectionId);
      if (cached) {
        context.setPanelData('monitoring', cached);
      } else {
        context.setPanelData('monitoring', []);
      }

      // Capture initial visibility from connection info
      latestIsVisible = info.isVisible;
      latestIsActive = info.isActive;

      const infoConnectionId = info.connectionId;

      const startMonitor = (osType: string, cmdExecutor: ICmdExecutor, isLocal: boolean) => {
        // Connection may have changed before async callback
        if (currentInfo?.connectionId !== infoConnectionId) return;

        monitor = new SystemMonitorService(
          cmdExecutor,
          (metrics) => {
            if (currentInfo?.connectionId === infoConnectionId) {
              const sections = buildSections(metrics, currentInfo!);
              metricsCache.set(infoConnectionId, sections);
              context.setPanelData('monitoring', sections);
            }
          },
          info.hostname,
          osType,
          isLocal,
        );

        // Use latest visibility state (may have changed during async wait)
        if (latestIsVisible && latestIsActive) {
          monitor.start(3000);
        }
      };

      if (info.connectionType === 'local') {
        // Local terminal: get platform info via IPC, create LocalCmdExecutor
        window.electron.getPlatform().then((platform: string) => {
          const osType = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
          startMonitor(osType, new LocalCmdExecutor(), true);
        });
      } else {
        // SSH connection: get remote OS info, create SSHCmdExecutor
        window.electron.sshGetOSInfo(info.connectionId).then((osInfo: any) => {
          startMonitor(osInfo?.osType || '', new SSHCmdExecutor(info.connectionId), false);
        });
      }
    });

    // Listen for visibility changes (lightweight: just start/stop monitor, no rebuild)
    context.onVisibilityChange((isVisible, isActive) => {
      latestIsVisible = isVisible;
      latestIsActive = isActive;
      if (!monitor) return;
      const shouldRun = isVisible && isActive;
      if (shouldRun) {
        if (!monitor.isRunning) monitor.start(3000);
      } else {
        if (monitor.isRunning) monitor.stop();
      }
    });

    context.subscriptions.push({ dispose: () => {
      if (monitor) {
        monitor.stop();
        monitor = null;
      }
    }});
  },
};
