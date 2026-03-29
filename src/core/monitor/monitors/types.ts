import { SystemMetrics } from '@/utils/types';

/**
 * Raw network sample data, parsed by each OS Monitor, passed to SystemMonitorService for speed calculation
 */
export interface NetworkSample {
  interfaceName: string;
  rxBytes: number;
  txBytes: number;
}

/**
 * OS Monitor interface
 * Each platform implements its own command building and output parsing logic
 */
export interface IOSMonitor {
  /** Build shell command to collect all metrics at once */
  buildCommand(): string;

  /**
   * Parse command output, populate metrics object
   * Network part only returns raw bytes (NetworkSample), speed calculation is handled by SystemMonitorService
   */
  parseMetrics(output: string, metrics: SystemMetrics): NetworkSample | null;
}
