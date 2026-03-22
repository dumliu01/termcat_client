import type { zh } from './zh';

export const en: typeof zh = {
  // Plugin metadata
  displayName: 'System Monitor',
  description: 'Real-time monitoring of remote host CPU, memory, network, disk, and processes',

  // Panel title & toolbar
  panelTitle: 'System Monitor',
  toggleTooltip: 'Toggle Monitoring Panel',

  // Header
  onlineMonitor: 'Online Monitor',

  // System metrics
  uptimeShort: 'UPTIME',
  loadShort: 'LOAD',
  cores: 'Cores',
  memShort: 'MEM',
  swapShort: 'SWAP',

  // Process
  command: 'COMMAND',

  // Network
  local: 'LOCAL',

  // Disk
  path: 'PATH',
  freeTotal: 'FREE/TOTAL',
};
