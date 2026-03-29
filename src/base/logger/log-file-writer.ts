/**
 * Log File Writer
 *
 * Responsible for writing logs to file, supports automatic rotation.
 * Does not depend on Electron API; caller passes configuration via initialize().
 *
 * Usage (Main process):
 * ```ts
 * import { logFileWriter } from '../utils/log-file-writer';
 * logFileWriter.initialize({
 *   logDir: app.getPath('logs'),
 *   logLevel: 'INFO',              // Optional, default 'INFO'
 *   maxFileSize: 10 * 1024 * 1024, // Optional, default 10MB
 *   maxFileCount: 5,               // Optional, default 5
 * });
 * ```
 */

import fs from 'fs';
import path from 'path';
import { LogLevel, setFileTransport } from './logger';

// ==================== Config Types ====================

export interface LogFileConfig {
  /**
   * Log file directory
   * Priority: parameter > env variable TERMCAT_LOG_DIR > default ./logs
   */
  logDir?: string;
  /**
   * File log level, logs below this level will not be written to file
   * Priority: parameter > env variable TERMCAT_LOG_LEVEL > default INFO
   */
  logLevel?: LogLevel;
  /**
   * Maximum bytes per log file
   * Priority: parameter > env variable TERMCAT_LOG_MAX_SIZE (in MB) > default 10MB
   */
  maxFileSize?: number;
  /**
   * Maximum number of log files to retain
   * Priority: parameter > env variable TERMCAT_LOG_MAX_COUNT > default 5
   */
  maxFileCount?: number;
}

// ==================== Defaults ====================

const DEFAULT_LOG_DIR = './logs';
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILE_COUNT = 5;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;
const LOG_FILE_NAME = 'termcat.log';

// ==================== Env Variable Parsing ====================

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
  if (envVal > 0) return envVal * 1024 * 1024; // Env var unit is MB
  return DEFAULT_MAX_FILE_SIZE;
}

function resolveMaxFileCount(configValue?: number): number {
  if (configValue != null) return configValue;
  const envVal = Number(process.env.TERMCAT_LOG_MAX_COUNT);
  if (envVal > 0) return envVal;
  return DEFAULT_MAX_FILE_COUNT;
}

// ==================== Log Level Priority ====================

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

// ==================== Writer Implementation ====================

class LogFileWriter {
  private logDir: string = '';
  private logFilePath: string = '';
  private writeStream: fs.WriteStream | null = null;
  private currentSize: number = 0;
  private initialized: boolean = false;
  private logLevel: LogLevel = DEFAULT_LOG_LEVEL;
  private maxFileSize: number = DEFAULT_MAX_FILE_SIZE;
  private maxFileCount: number = DEFAULT_MAX_FILE_COUNT;

  // Buffer: cache logs before initialization
  private buffer: string[] = [];

  /**
   * Initialize log file writer
   *
   * Priority for each parameter: parameter > env variable > default value
   * - logDir:       config > TERMCAT_LOG_DIR      > ./logs
   * - logLevel:     config > TERMCAT_LOG_LEVEL     > INFO
   * - maxFileSize:  config > TERMCAT_LOG_MAX_SIZE   > 10 (MB)
   * - maxFileCount: config > TERMCAT_LOG_MAX_COUNT  > 5
   */
  initialize(config: LogFileConfig = {}): void {
    if (this.initialized) return;

    this.logDir = resolveLogDir(config.logDir);
    this.logLevel = resolveLogLevel(config.logLevel);
    this.maxFileSize = resolveMaxFileSize(config.maxFileSize);
    this.maxFileCount = resolveMaxFileCount(config.maxFileCount);

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logFilePath = path.join(this.logDir, LOG_FILE_NAME);

    // Get current file size
    try {
      const stats = fs.statSync(this.logFilePath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    this.openStream();
    this.initialized = true;

    // Auto-register as logger file transport
    setFileTransport((line, level) => this.write(line, level));

    // Write buffered logs
    if (this.buffer.length > 0) {
      for (const line of this.buffer) {
        this.writeLine(line);
      }
      this.buffer = [];
    }

    console.log(`[LogFileWriter] Log directory: ${this.logDir}, level: ${this.logLevel}`);
  }

  /**
   * Write a log line (with level filtering)
   * @param line - Log text
   * @param level - Log level, logs below configured level will be ignored
   */
  write(line: string, level?: LogLevel): void {
    // Level filtering
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
   * Dynamically update file log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current file log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  private writeLine(line: string): void {
    const data = line.endsWith('\n') ? line : line + '\n';
    const byteLength = Buffer.byteLength(data, 'utf8');

    // Check if rotation is needed
    if (this.currentSize + byteLength > this.maxFileSize) {
      this.rotate();
    }

    if (this.writeStream) {
      this.writeStream.write(data);
      this.currentSize += byteLength;
    }
  }

  /**
   * Log file rotation
   * termcat.{n-1}.log → delete
   * ...
   * termcat.1.log → termcat.2.log
   * termcat.log   → termcat.1.log
   * Create new termcat.log
   */
  private rotate(): void {
    this.closeStream();

    // Delete oldest file
    const oldest = path.join(this.logDir, `termcat.${this.maxFileCount - 1}.log`);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // Rename files in order
    for (let i = this.maxFileCount - 2; i >= 1; i--) {
      const from = path.join(this.logDir, `termcat.${i}.log`);
      const to = path.join(this.logDir, `termcat.${i + 1}.log`);
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }

    // Current file → .1
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
   * Get log directory path
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Close writer and unregister file transport
   */
  shutdown(): void {
    setFileTransport(null);
    this.closeStream();
  }
}

export const logFileWriter = new LogFileWriter();
