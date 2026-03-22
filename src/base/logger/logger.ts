/**
 * TermCat Client 日志组件
 * Structured Logging Utility for TermCat Client
 * 
 * 基于 ./docs/LOGGING_SPECIFICATION.md 规范实现
 * 
 * 使用方式:
 * import { logger, LOG_MODULE } from '@/utils/logger';
 * 
 * // 直接调用
 * logger.info('ssh.connection.established', 'SSH connection established', {
 *   module: LOG_MODULE.SSH,
 *   connection_id: 'ssh-123',
 * });
 * 
 * // 或创建模块化日志器
 * const sshLog = logger.withFields({ module: LOG_MODULE.SSH });
 * sshLog.info('connection.established', 'SSH connected', {
 *   connection_id: 'ssh-123',
 * });
 */

// ==================== 日志级别 ====================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

// ==================== 类型定义 ====================

export interface LogFields {
  [key: string]: any;
}

// 模块常量定义
export const LOG_MODULE = {
  TERMINAL: 'terminal',
  SSH: 'ssh',
  HTTP: 'http',
  AI: 'ai',
  FILE: 'file',
  AUTH: 'auth',
  UI: 'ui',
  MAIN: 'main',
  SFTP: 'sftp',
  HOST: 'host',
  PAYMENT: 'payment',
  APP: 'app',
  PLUGIN: 'plugin',
} as const;

export type LogModule = typeof LOG_MODULE[keyof typeof LOG_MODULE];

// 模块配置
export interface DebugModules {
  terminal: boolean;
  ssh: boolean;
  http: boolean;
  ai: boolean;
  file: boolean;
  auth: boolean;
  ui: boolean;
  main: boolean;
  sftp: boolean;
  host: boolean;
  payment: boolean;
}

// 日志配置
export interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  debugModules: DebugModules;
  format: 'text' | 'json';
}

// 全局上下文（user_id, client 等）
export interface LogContext {
  user_id?: string;
  client?: string;
  session_id?: string;
}

// ==================== 默认配置 ====================

// 默认模块配置
const defaultDebugModules: DebugModules = {
  terminal: false,
  ssh: false,
  http: false,
  ai: true,
  file: false,
  auth: false,
  ui: false,
  main: false,
  sftp: false,
  host: false,
  payment: false,
};

// 默认配置
const defaultConfig: LogConfig = {
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  debugModules: { ...defaultDebugModules },
  format: import.meta.env.DEV ? 'text' : 'json',
};

// ==================== 全局状态 ====================

let currentConfig = { ...defaultConfig };
let globalContext: LogContext = {};

// 文件传输回调：Main 进程直接写文件，Renderer 进程通过 IPC 发送
let fileTransport: ((line: string, level?: LogLevel) => void) | null = null;

/**
 * 设置文件日志传输回调
 * - Main 进程：直接调用 logFileService.write()
 * - Renderer 进程：通过 IPC 发送到 Main 进程
 */
export function setFileTransport(transport: ((line: string, level?: LogLevel) => void) | null) {
  fileTransport = transport;
}

/**
 * 设置日志配置
 */
export function setLogConfig(config: Partial<LogConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * 获取当前日志配置
 */
export function getLogConfig(): LogConfig {
  return { ...currentConfig };
}

/**
 * 设置模块调试开关
 */
export function setDebugModule(module: LogModule, enabled: boolean) {
  currentConfig.debugModules[module] = enabled;
}

/**
 * 设置全局日志上下文（user_id, client 等）
 * 应该在用户登录成功后调用
 */
export function setLogContext(context: LogContext) {
  globalContext = { ...globalContext, ...context };
}

/**
 * 获取全局日志上下文
 */
export function getLogContext(): LogContext {
  return { ...globalContext };
}

/**
 * 清除全局日志上下文
 * 应该在用户登出后调用
 */
export function clearLogContext() {
  globalContext = {};
}

// ==================== 内部方法 ====================

/**
 * 获取调用者信息
 */
function getCallerInfo(): { file: string; func: string } {
  try {
    const stack = new Error().stack;
    if (!stack) {
      return { file: 'unknown', func: 'unknown' };
    }

    const lines = stack.split('\n');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // 跳过 logger 内部的调用（包括带 ?t=xxx 热更新参数的情况）
      const normalizedLine = line.replace(/\?t=\d+/g, '');
      if (normalizedLine.includes('logger.ts') || normalizedLine.includes('logger.js')) {
        continue;
      }

      // 匹配格式: at funcName (path/to/file.ts:line:col)
      const match1 = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match1) {
        const funcName = match1[1] || 'anonymous';
        const filePath = match1[2] || 'unknown';
        const lineNum = match1[3] || '0';
        // 移除热更新参数 ?t=xxx
        const cleanFilePath = filePath.replace(/\?t=\d+/g, '');
        const fileName = cleanFilePath.split('/').pop() || cleanFilePath;
        return {
          file: `${fileName}:${lineNum}`,
          func: funcName,
        };
      }

      // 匹配格式: at path/to/file.ts:line:col
      const match2 = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (match2) {
        const filePath = match2[1] || 'unknown';
        const lineNum = match2[2] || '0';
        // 移除热更新参数 ?t=xxx
        const cleanFilePath = filePath.replace(/\?t=\d+/g, '');
        const fileName = cleanFilePath.split('/').pop() || cleanFilePath;
        return {
          file: `${fileName}:${lineNum}`,
          func: 'anonymous',
        };
      }
    }

    return { file: 'unknown', func: 'unknown' };
  } catch {
    return { file: 'unknown', func: 'unknown' };
  }
}

/**
 * 检查模块是否启用 DEBUG
 */
function isModuleEnabled(module?: string): boolean {
  if (!module) return true;
  const moduleConfig = currentConfig.debugModules[module as LogModule];
  return moduleConfig !== false;
}

/**
 * 格式化日志字段为字符串
 */
function formatFields(fields: LogFields): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      continue;
    }
    // 对于对象和数组，转换为JSON字符串
    if (typeof value === 'object') {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } else {
      // 字符串需要转义 ${ 防止模板字符串求值
      const strValue = String(value);
      parts.push(`${key}=${strValue.replace(/\$\{/g, '$_{')}`);
    }
  }
  return parts.join(' ');
}

/**
 * 内部日志方法
 */
function log(
  level: LogLevel,
  event: string,
  message: string,
  fields: LogFields = {}
) {
  // 检查日志级别
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  const currentLevelIndex = levels.indexOf(currentConfig.level);
  const messageLevelIndex = levels.indexOf(level);
  if (messageLevelIndex < currentLevelIndex) {
    return;
  }

  // 检查模块是否启用 DEBUG
  const module = fields.module as string;
  if (level === LogLevel.DEBUG && !isModuleEnabled(module)) {
    return;
  }

  if (!currentConfig.enableConsole) {
    return;
  }

  // 获取调用者信息
  const callerInfo = getCallerInfo();

  // 格式化时间（使用本地时区时间）
  const timestamp = new Date();
  const timeStr = timestamp.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');

  // 构建基础日志数据（合并全局上下文）
  const logData: LogFields = {
    timestamp,
    level,
    event,
    message,  // 使用 message 而不是 msg
    error: fields.error !== undefined ? fields.error : 0,
    ...globalContext,  // 添加全局上下文（user_id, client 等）
    ...fields,
  };

  // 添加调用者信息
  if (callerInfo.file !== 'unknown') {
    // 移除热更新参数 ?t=xxx 获得干净的文件位置
    logData.caller = callerInfo.file.replace(/\?t=\d+/g, '');
  }
  if (callerInfo.func !== 'unknown') {
    logData.func = callerInfo.func;
  }

  // 移除热更新参数 ?t=xxx 获得干净的文件位置
  const cleanCallerLocation = callerInfo.file !== 'unknown'
    ? `[${callerInfo.file.replace(/\?t=\d+/g, '')}]`
    : '';
  const fieldsStr = formatFields(fields);
  const plainLogLine = fieldsStr
    ? `[${timeStr}] [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`
    : `[${timeStr}] [${level}] ${cleanCallerLocation} event=${event} | msg=${message}`;

  // 写入文件（纯文本，无 ANSI 颜色）
  if (fileTransport) {
    fileTransport(plainLogLine, level);
  }

  // 根据格式输出到 console
  if (currentConfig.format === 'json') {
    // JSON 格式输出
    console[level.toLowerCase() as 'log' | 'info' | 'warn' | 'error'](
      JSON.stringify(logData)
    );
  } else {
    // 文本格式输出（开发环境友好）
    switch (level) {
      case LogLevel.DEBUG:
        console.log(`%c[${timeStr}]%c [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`,
          'color: #6b7280; font-size: 10px;', 'color: inherit;');
        break;
      case LogLevel.INFO:
        console.info(`%c[${timeStr}]%c [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`,
          'color: #059669; font-size: 10px;', 'color: inherit;');
        break;
      case LogLevel.WARN:
        console.warn(`%c[${timeStr}]%c [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`,
          'color: #d97706; font-size: 10px;', 'color: inherit;');
        break;
      case LogLevel.ERROR:
        console.error(`%c[${timeStr}]%c [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`,
          'color: #dc2626; font-size: 10px;', 'color: inherit;');
        break;
    }
  }
}

// ==================== 日志记录器类 ====================

export class LoggerWithFields {
  constructor(private fields: LogFields) {}

  debug(event: string, message: string, extra?: LogFields): void {
    log(LogLevel.DEBUG, event, message, { ...this.fields, ...extra });
  }

  info(event: string, message: string, extra?: LogFields): void {
    log(LogLevel.INFO, event, message, { ...this.fields, ...extra });
  }

  warn(event: string, message: string, extra?: LogFields): void {
    log(LogLevel.WARN, event, message, { ...this.fields, ...extra });
  }

  error(event: string, message: string, extra?: LogFields): void {
    log(LogLevel.ERROR, event, message, { ...this.fields, ...extra });
  }
}

// ==================== 全局日志 API ====================

export const logger = {
  /**
   * DEBUG 级别日志
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.connection.established'）
   * @param message - 日志消息
   * @param fields - 额外字段
   */
  debug(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.DEBUG, event, message, { module, ...fields });
  },

  /**
   * INFO 级别日志（用户操作、流程事件）
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.connection.established'）
   * @param message - 日志消息
   * @param fields - 额外字段
   */
  info(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.INFO, event, message, { module, ...fields });
  },

  /**
   * WARN 级别日志
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.connection.established'）
   * @param message - 日志消息
   * @param fields - 额外字段
   */
  warn(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.WARN, event, message, { module, ...fields });
  },

  /**
   * ERROR 级别日志
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.connection.established'）
   * @param message - 日志消息
   * @param fields - 额外字段
   */
  error(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.ERROR, event, message, { module, ...fields });
  },

  /**
   * 创建带字段的日志记录器
   */
  withFields(fields: LogFields): LoggerWithFields {
    return new LoggerWithFields(fields);
  },

  /**
   * 记录性能日志
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.command.completed'）
   * @param message - 日志消息
   * @param latencyMs - 耗时（毫秒）
   * @param fields - 额外字段
   */
  performance(module: LogModule, event: string, message: string, latencyMs: number, fields?: LogFields): void {
    log(LogLevel.INFO, event, message, {
      module,
      ...fields,
      latency_ms: latencyMs,
    });
  },

  /**
   * 记录错误日志（便捷方法）
   * @param module - 模块名称（如 LOG_MODULE.SSH）
   * @param event - 事件名称（如 'ssh.connection.failed'）
   * @param error - 错误对象或错误消息
   * @param fields - 额外字段
   */
  errorWithEvent(module: LogModule, event: string, error: Error | string, fields?: LogFields): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorCode = fields?.error || 1;
    log(LogLevel.ERROR, event, errorMessage, {
      module,
      ...fields,
      error: errorCode,
      stack: typeof error === 'string' ? undefined : error.stack,
    });
  },
};

// ==================== 工具函数 ====================

/**
 * 快捷创建模块日志器
 * 
 * @example
 * const log = createModuleLogger(LOG_MODULE.SSH);
 * log.info('connection.established', 'SSH connected', { host: '192.168.1.1' });
 */
export function createModuleLogger(module: LogModule): LoggerWithFields {
  return new LoggerWithFields({ module });
}
