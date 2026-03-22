import { SystemMetrics } from '@/utils/types';

/**
 * 网络采样原始数据，由各 OS Monitor 解析输出，交给 SystemMonitorService 做速率计算
 */
export interface NetworkSample {
  interfaceName: string;
  rxBytes: number;
  txBytes: number;
}

/**
 * OS 监控器接口
 * 每个平台实现自己的命令构建和输出解析逻辑
 */
export interface IOSMonitor {
  /** 构建一次性采集所有指标的 shell 命令 */
  buildCommand(): string;

  /**
   * 解析命令输出，填充 metrics 对象
   * 网络部分只返回原始字节数（NetworkSample），速率计算由 SystemMonitorService 统一处理
   */
  parseMetrics(output: string, metrics: SystemMetrics): NetworkSample | null;
}
