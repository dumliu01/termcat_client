/**
 * 内置插件：系统监控侧栏（模板驱动版）
 *
 * 使用 UI 贡献点系统，通过 setPanelData 推送 JSON 数据，
 * 由 PanelRenderer 统一渲染。不再使用自定义 React 组件。
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
    // 注册模板驱动面板
    context.registerPanel({
      id: 'monitoring',
      title: locales.en.panelTitle,
      icon: 'activity',
      slot: 'sidebar-left',
      defaultSize: 280,
      defaultVisible: true,
      priority: 10,
    });

    // 注册工具栏切换按钮
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

    // 监听连接变化
    context.onConnectionChange((info) => {
      currentInfo = info;

      // 清理旧的监控
      if (monitor) {
        monitor.stop();
        monitor = null;
      }

      if (!info) return;

      const startMonitor = (osType: string, cmdExecutor: ICmdExecutor, isLocal: boolean) => {
        // 可能在异步回调前连接已变化
        if (currentInfo !== info) return;

        monitor = new SystemMonitorService(
          cmdExecutor,
          (metrics) => {
            if (currentInfo === info) {
              context.setPanelData('monitoring', buildSections(metrics, info));
            }
          },
          info.hostname,
          osType,
          isLocal,
        );

        if (info.isVisible && info.isActive) {
          monitor.start(3000);
        }
      };

      if (info.connectionType === 'local') {
        // 本地终端：通过 IPC 获取平台信息，创建 LocalCmdExecutor
        window.electron.getPlatform().then((platform: string) => {
          const osType = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
          startMonitor(osType, new LocalCmdExecutor(), true);
        });
      } else {
        // SSH 连接：获取远程 OS 信息，创建 SSHCmdExecutor
        window.electron.sshGetOSInfo(info.connectionId).then((osInfo: any) => {
          startMonitor(osInfo?.osType || '', new SSHCmdExecutor(info.connectionId), false);
        });
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
