import { SystemMetrics } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { IOSMonitor } from './monitors/types';
import { LinuxMonitor } from './monitors/linuxMonitor';
import { DarwinMonitor } from './monitors/darwinMonitor';
import { WindowsMonitor } from './monitors/windowsMonitor';

/**
 * 环形缓冲区：固定容量，push O(1)，toArray O(n)
 * 替代 Array + shift() 避免频繁数组移位开销
 */
class CircularBuffer {
  private buffer: number[];
  private head: number = 0;
  private size: number = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    const idx = (this.head + this.size) % this.capacity;
    if (this.size === this.capacity) {
      // 缓冲区满，覆盖最老的元素
      this.buffer[this.head] = value;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buffer[idx] = value;
      this.size++;
    }
  }

  toArray(): number[] {
    const result: number[] = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
    }
    return result;
  }
}

/**
 * 根据 osType 创建对应的 OS 监控器
 * osType 来自 SSH 连接的 OSInfo.osType，形如 "linux/ubuntu"、"macos"、"windows" 等
 */
function createOSMonitor(osType?: string): IOSMonitor {
  const os = (osType || '').toLowerCase();
  if (os.startsWith('mac') || os === 'darwin') {
    return new DarwinMonitor();
  }
  if (os.startsWith('windows') || os.startsWith('win')) {
    return new WindowsMonitor();
  }
  return new LinuxMonitor();
}

export class SystemMonitorService {
  private connectionId: string;
  private hostname: string;
  private updateCallback: (metrics: SystemMetrics) => void;
  private intervalId: NodeJS.Timeout | null = null;
  private _isRunning: boolean = false;
  private monitor: IOSMonitor;

  // 历史数据存储 - 使用环形缓冲区，避免 shift() 的 O(n) 开销
  private netUpHistory = new CircularBuffer(100);
  private netDownHistory = new CircularBuffer(100);
  private pingHistory = new CircularBuffer(100);
  private lastNetBytes: { rx: number; tx: number } | null = null;
  private lastNetTime: number = 0;
  private hasPingData: boolean = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  constructor(connectionId: string, updateCallback: (metrics: SystemMetrics) => void, hostname?: string, osType?: string) {
    this.connectionId = connectionId;
    this.updateCallback = updateCallback;
    this.hostname = hostname || '';
    this.monitor = createOSMonitor(osType);
  }

  /**
   * 开始监控系统信息
   * @param intervalMs 更新间隔（毫秒），默认3秒
   */
  start(intervalMs: number = 3000) {
    if (this._isRunning) {
      logger.debug(LOG_MODULE.TERMINAL, 'monitor.already_running', 'System monitor already running');
      return;
    }

    this._isRunning = true;
    logger.info(LOG_MODULE.TERMINAL, 'monitor.starting', 'Starting system monitor', {
      connection_id: this.connectionId,
    });

    // 立即执行一次
    this.fetchSystemMetrics();

    // 定期更新
    this.intervalId = setInterval(() => {
      this.fetchSystemMetrics();
    }, intervalMs);
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isRunning = false;
    logger.info(LOG_MODULE.TERMINAL, 'monitor.stopping', 'System monitor stopped', {
      connection_id: this.connectionId,
    });
  }

  /**
   * 获取系统指标
   */
  private async fetchSystemMetrics() {
    try {
      if (!window.electron) {
        logger.warn(LOG_MODULE.TERMINAL, 'monitor.api_unavailable', 'Electron API not available');
        return;
      }

      const command = this.monitor.buildCommand();

      // 测量 SSH 往返时间作为本机到 host 的网络延迟
      const rttStart = Date.now();
      const result = await window.electron.sshExecute(this.connectionId, command);
      const rttMs = Date.now() - rttStart;

      if (result.output) {
        const metrics = this.buildMetrics(result.output);
        // 使用 SSH 往返时间作为本机到 host 的延迟（除以2近似单程）
        metrics.ping = Math.round(rttMs / 2);
        if (this.hasPingData) {
          this.pingHistory.push(metrics.ping);
        } else {
          this.hasPingData = true;
        }
        metrics.pingHistory = this.pingHistory.toArray();
        this.updateCallback(metrics);
      }
    } catch (error) {
      //console.error('Failed to fetch system metrics:', error);
    }
  }

  /**
   * 构建 metrics 对象：委托 OS Monitor 解析，然后处理网络速率等公共逻辑
   */
  private buildMetrics(output: string): SystemMetrics {
    const metrics: SystemMetrics = {
      cpu: 0,
      cpuCores: 1,
      memPercent: 0,
      memUsed: '0M',
      memTotal: '0M',
      swapPercent: 0,
      swapUsed: '0M',
      swapTotal: '0M',
      load: '0.00, 0.00, 0.00',
      uptime: '0:00',
      upSpeed: '0 KB/s',
      downSpeed: '0 KB/s',
      ping: 0,
      processes: [],
      disks: [],
      netUpHistory: [],
      netDownHistory: [],
      pingHistory: [],
      ethName: 'eth0',
      mem: 0,
      swap: 0,
    };

    try {
      // 委托各 OS 监控器解析命令输出
      const netSample = this.monitor.parseMetrics(output, metrics);

      // 网络速率计算（公共逻辑）
      if (netSample) {
        metrics.ethName = netSample.interfaceName;

        const now = Date.now();
        const timeDiff = this.lastNetTime > 0 ? (now - this.lastNetTime) / 1000 : 0;

        if (this.lastNetBytes !== null && this.lastNetBytes.rx > 0 && timeDiff > 0) {
          const rxSpeed = ((netSample.rxBytes - this.lastNetBytes.rx) / timeDiff) / 1024;
          const txSpeed = ((netSample.txBytes - this.lastNetBytes.tx) / timeDiff) / 1024;

          metrics.upSpeed = `${Math.max(0, txSpeed).toFixed(1)} KB/s`;
          metrics.downSpeed = `${Math.max(0, rxSpeed).toFixed(1)} KB/s`;

          this.netUpHistory.push(Math.max(0, txSpeed));
          this.netDownHistory.push(Math.max(0, rxSpeed));
        }

        this.lastNetBytes = { rx: netSample.rxBytes, tx: netSample.txBytes };
        this.lastNetTime = now;
      }
    } catch (error) {
      logger.error(LOG_MODULE.TERMINAL, 'monitor.parse.error', 'Error parsing system metrics', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 将历史数据复制到返回的 metrics 对象中
    metrics.netUpHistory = this.netUpHistory.toArray();
    metrics.netDownHistory = this.netDownHistory.toArray();
    metrics.pingHistory = this.pingHistory.toArray();

    return metrics;
  }
}
