/**
 * 日志文件写入器
 *
 * 负责将日志写入文件，支持自动轮转。
 * 不依赖 Electron API，由调用方通过 initialize() 传入配置。
 *
 * 使用方式（Main 进程）:
 * ```ts
 * import { logFileWriter } from '../utils/log-file-writer';
 * logFileWriter.initialize({
 *   logDir: app.getPath('logs'),
 *   logLevel: 'INFO',           // 可选，默认 'INFO'
 *   maxFileSize: 10 * 1024 * 1024, // 可选，默认 10MB
 *   maxFileCount: 5,            // 可选，默认 5
 * });
 * ```
 */

import fs from 'fs';
import path from 'path';
import { LogLevel, setFileTransport } from './logger';

// ==================== 配置类型 ====================

export interface LogFileConfig {
  /**
   * 日志文件存放目录
   * 优先级：参数传入 > 环境变量 TERMCAT_LOG_DIR > 默认值 ./logs
   */
  logDir?: string;
  /**
   * 文件日志级别，低于此级别的日志不写入文件
   * 优先级：参数传入 > 环境变量 TERMCAT_LOG_LEVEL > 默认值 INFO
   */
  logLevel?: LogLevel;
  /**
   * 单个日志文件最大字节数
   * 优先级：参数传入 > 环境变量 TERMCAT_LOG_MAX_SIZE（单位 MB） > 默认值 10MB
   */
  maxFileSize?: number;
  /**
   * 最多保留的日志文件数
   * 优先级：参数传入 > 环境变量 TERMCAT_LOG_MAX_COUNT > 默认值 5
   */
  maxFileCount?: number;
}

// ==================== 默认值 ====================

const DEFAULT_LOG_DIR = './logs';
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILE_COUNT = 5;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;
const LOG_FILE_NAME = 'termcat.log';

// ==================== 环境变量解析 ====================

const VALID_LOG_LEVELS: Record<string, LogLevel> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
};

function resolveLogDir(configValue?: string): string {
  return configValue || process.env.TERMCAT_LOG_DIR || DEFAULT_LOG_DIR;
}

function resolveLogLevel(configValue?: LogLevel): LogLevel {
  if (configValue) return configValue;
  const envVal = process.env.TERMCAT_LOG_LEVEL?.toUpperCase();
  if (envVal && VALID_LOG_LEVELS[envVal]) return VALID_LOG_LEVELS[envVal];
  return DEFAULT_LOG_LEVEL;
}

function resolveMaxFileSize(configValue?: number): number {
  if (configValue != null) return configValue;
  const envVal = Number(process.env.TERMCAT_LOG_MAX_SIZE);
  if (envVal > 0) return envVal * 1024 * 1024; // 环境变量单位为 MB
  return DEFAULT_MAX_FILE_SIZE;
}

function resolveMaxFileCount(configValue?: number): number {
  if (configValue != null) return configValue;
  const envVal = Number(process.env.TERMCAT_LOG_MAX_COUNT);
  if (envVal > 0) return envVal;
  return DEFAULT_MAX_FILE_COUNT;
}

// ==================== 日志级别优先级 ====================

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

// ==================== 写入器实现 ====================

class LogFileWriter {
  private logDir: string = '';
  private logFilePath: string = '';
  private writeStream: fs.WriteStream | null = null;
  private currentSize: number = 0;
  private initialized: boolean = false;
  private logLevel: LogLevel = DEFAULT_LOG_LEVEL;
  private maxFileSize: number = DEFAULT_MAX_FILE_SIZE;
  private maxFileCount: number = DEFAULT_MAX_FILE_COUNT;

  // 缓冲区：在初始化前缓存日志
  private buffer: string[] = [];

  /**
   * 初始化日志文件写入器
   *
   * 每个参数的优先级：参数传入 > 环境变量 > 默认值
   * - logDir:      config > TERMCAT_LOG_DIR      > ./logs
   * - logLevel:    config > TERMCAT_LOG_LEVEL     > INFO
   * - maxFileSize: config > TERMCAT_LOG_MAX_SIZE  > 10 (MB)
   * - maxFileCount:config > TERMCAT_LOG_MAX_COUNT > 5
   */
  initialize(config: LogFileConfig = {}): void {
    if (this.initialized) return;

    this.logDir = resolveLogDir(config.logDir);
    this.logLevel = resolveLogLevel(config.logLevel);
    this.maxFileSize = resolveMaxFileSize(config.maxFileSize);
    this.maxFileCount = resolveMaxFileCount(config.maxFileCount);

    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logFilePath = path.join(this.logDir, LOG_FILE_NAME);

    // 获取当前文件大小
    try {
      const stats = fs.statSync(this.logFilePath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    this.openStream();
    this.initialized = true;

    // 自动注册为 logger 的文件传输
    setFileTransport((line, level) => this.write(line, level));

    // 写入缓冲区中的日志
    if (this.buffer.length > 0) {
      for (const line of this.buffer) {
        this.writeLine(line);
      }
      this.buffer = [];
    }

    console.log(`[LogFileWriter] Log directory: ${this.logDir}, level: ${this.logLevel}`);
  }

  /**
   * 写入一行日志（带级别过滤）
   * @param line - 日志文本
   * @param level - 日志级别，低于配置级别的日志将被忽略
   */
  write(line: string, level?: LogLevel): void {
    // 级别过滤
    if (level && LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.logLevel]) {
      return;
    }

    if (!this.initialized) {
      this.buffer.push(line);
      return;
    }
    this.writeLine(line);
  }

  /**
   * 动态更新文件日志级别
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 获取当前文件日志级别
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  private writeLine(line: string): void {
    const data = line.endsWith('\n') ? line : line + '\n';
    const byteLength = Buffer.byteLength(data, 'utf8');

    // 检查是否需要轮转
    if (this.currentSize + byteLength > this.maxFileSize) {
      this.rotate();
    }

    if (this.writeStream) {
      this.writeStream.write(data);
      this.currentSize += byteLength;
    }
  }

  /**
   * 日志文件轮转
   * termcat.{n-1}.log → 删除
   * ...
   * termcat.1.log → termcat.2.log
   * termcat.log   → termcat.1.log
   * 新建 termcat.log
   */
  private rotate(): void {
    this.closeStream();

    // 删除最旧的文件
    const oldest = path.join(this.logDir, `termcat.${this.maxFileCount - 1}.log`);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // 依次重命名
    for (let i = this.maxFileCount - 2; i >= 1; i--) {
      const from = path.join(this.logDir, `termcat.${i}.log`);
      const to = path.join(this.logDir, `termcat.${i + 1}.log`);
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }

    // 当前文件 → .1
    if (fs.existsSync(this.logFilePath)) {
      fs.renameSync(this.logFilePath, path.join(this.logDir, 'termcat.1.log'));
    }

    this.currentSize = 0;
    this.openStream();
  }

  private openStream(): void {
    this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a', encoding: 'utf8' });
    this.writeStream.on('error', (err) => {
      console.error('[LogFileWriter] Write stream error:', err.message);
    });
  }

  private closeStream(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  /**
   * 获取日志目录路径
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * 关闭写入器并注销文件传输
   */
  shutdown(): void {
    setFileTransport(null);
    this.closeStream();
  }
}

export const logFileWriter = new LogFileWriter();
