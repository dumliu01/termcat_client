/**
 * 示例内置插件：模板驱动面板 Demo
 *
 * 用于验证 UI 贡献点系统的全部 P0 模板：
 * header、key-value、metric-bars、table、bar-chart
 *
 * 注意：此插件仅用于开发验证，正式发布时可删除。
 */

import type { BuiltinPlugin } from '../types';

// 模拟数据
let cpuVal = 45;
let memVal = 62;
let swapVal = 18;
const netUpHistory: number[] = [];
const netDownHistory: number[] = [];

function randomBetween(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

export const demoPanelPlugin: BuiltinPlugin = {
  id: 'builtin-demo-panel',
  displayName: 'Demo Panel',
  description: '模板驱动面板演示',
  version: '0.1.0',

  activate(context) {
    // 注册模板面板
    context.registerPanel({
      id: 'demo',
      title: 'Demo Panel',
      icon: 'zap',
      slot: 'sidebar-left',
      defaultSize: 280,
      defaultVisible: true,
      priority: 20,
    });

    // 立即推送初始数据
    pushData(context);

    // 模拟实时更新（每 2 秒）
    const timer = setInterval(() => {
      cpuVal = Math.min(100, Math.max(0, cpuVal + randomBetween(-5, 5)));
      memVal = Math.min(100, Math.max(0, memVal + randomBetween(-2, 2)));
      swapVal = Math.min(100, Math.max(0, swapVal + randomBetween(-1, 1)));
      netUpHistory.push(randomBetween(0, 80));
      netDownHistory.push(randomBetween(0, 120));
      if (netUpHistory.length > 100) netUpHistory.shift();
      if (netDownHistory.length > 100) netDownHistory.shift();

      pushData(context);
    }, 2000);

    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  },
};

function pushData(context: { setPanelData: Function }) {
  context.setPanelData('demo', [
    {
      id: 'header',
      template: 'header' as const,
      data: {
        title: 'Demo Panel',
        subtitle: 'Template-Driven',
        icon: 'zap',
        badge: { text: 'LIVE', color: 'success' },
      },
    },
    {
      id: 'info',
      template: 'key-value' as const,
      data: {
        pairs: [
          { key: 'HOST', value: '192.168.1.100' },
          { key: 'UPTIME', value: '3d 12h' },
          { key: 'LOAD', value: '0.52, 0.38, 0.25' },
        ],
        layout: 'horizontal',
      },
    },
    {
      id: 'resources',
      template: 'metric-bars' as const,
      data: {
        items: [
          { label: 'CPU', value: cpuVal, unit: '%', color: 'primary', detail: '4 Cores' },
          { label: 'MEM', value: memVal, unit: '%', color: 'warning', detail: '5.0G/8.0G' },
          { label: 'SWAP', value: swapVal, unit: '%', color: 'muted', detail: '0.9G/4.0G' },
        ],
      },
    },
    {
      id: 'processes',
      template: 'table' as const,
      data: {
        columns: [
          { id: 'mem', label: 'MEM', width: 65, sortable: true },
          { id: 'cpu', label: 'CPU', width: 55, sortable: true },
          { id: 'name', label: 'COMMAND', sortable: true },
        ],
        rows: [
          { mem: '245.2M', cpu: '12.3', name: 'node' },
          { mem: '189.5M', cpu: '8.1', name: 'chrome' },
          { mem: '142.0M', cpu: '3.5', name: 'python3' },
          { mem: '98.7M', cpu: '2.1', name: 'nginx' },
          { mem: '45.3M', cpu: '0.8', name: 'sshd' },
        ],
        maxVisibleRows: 5,
        defaultSort: { column: 'cpu', order: 'desc' },
      },
      collapsible: true,
    },
    {
      id: 'network',
      template: 'bar-chart' as const,
      data: {
        series: [
          { name: 'Upload', data: [...netUpHistory], color: 'warning', type: 'bar' },
          { name: 'Download', data: [...netDownHistory], color: 'success', type: 'line' },
        ],
        maxPoints: 100,
        height: 80,
        yUnit: 'K',
      },
    },
  ]);
}
