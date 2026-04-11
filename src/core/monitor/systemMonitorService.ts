import { SystemMetrics } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { IOSMonitor } from './monitors/types';
import { LinuxMonitor } from './monitors/linuxMonitor';
import { DarwinMonitor } from './monitors/darwinMonitor';
import { WindowsMonitor } from './monitors/windowsMonitor';

/**
 * Circular buffer: fixed capacity, push O(1), toArray O(n)
 * Alternative to Array + shift() to avoid frequent array reordering overhead
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
      // Buffer full, overwrite oldest element
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
 * Create corresponding OS monitor based on osType
 * osType comes from SSH connection's OSInfo.osType, e.g. "linux/ubuntu", "macos", "windows", etc.
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

  // Historical data storage - using circular buffer to avoid O(n) shift() overhead
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
   * Start system monitoring
   * @param intervalMs Update interval (milliseconds), default 3 seconds
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

    // Execute immediately once
    this.fetchSystemMetrics();

    // Update periodically
    this.intervalId = setInterval(() => {
      this.fetchSystemMetrics();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isRunning = false;
    logger.debug(LOG_MODULE.TERMINAL, 'monitor.stopping', 'System monitor stopped', {
      connection_id: this.connectionId,
    });
  }

  /**
   * Fetch system metrics
   */
  private async fetchSystemMetrics() {
    try {
      if (!window.electron) {
        logger.warn(LOG_MODULE.TERMINAL, 'monitor.api_unavailable', 'Electron API not available');
        return;
      }

      const command = this.monitor.buildCommand();

      // Measure SSH round-trip time as network latency from local to host
      const rttStart = Date.now();
      const result = await window.electron.sshExecute(this.connectionId, command);
      const rttMs = Date.now() - rttStart;

      if (result.output) {
        const metrics = this.buildMetrics(result.output);
        // Use SSH round-trip time as latency from local to host (divide by 2 for one-way approximation)
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
   * Build metrics object: delegate to OS Monitor for parsing, then handle common logic like network speed
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
      // Delegate to OS monitors for command output parsing
      const netSample = this.monitor.parseMetrics(output, metrics);

      // Network speed calculation (common logic)
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

    // Copy historical data to returned metrics object
    metrics.netUpHistory = this.netUpHistory.toArray();
    metrics.netDownHistory = this.netDownHistory.toArray();
    metrics.pingHistory = this.pingHistory.toArray();

    return metrics;
  }
}
