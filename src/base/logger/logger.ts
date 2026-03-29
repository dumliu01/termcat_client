/**
 * TermCat Client Logging Component
 * Structured Logging Utility for TermCat Client
 * 
 * Implementation based on ./docs/LOGGING_SPECIFICATION.md
 * 
 * Usage:
 * import { logger, LOG_MODULE } from '@/utils/logger';
 * 
 * // Direct call
 * logger.info('ssh.connection.established', 'SSH connection established', {
 *   module: LOG_MODULE.SSH,
 *   connection_id: 'ssh-123',
 * });
 * 
 * // Or create a module-scoped logger
 * const sshLog = logger.withFields({ module: LOG_MODULE.SSH });
 * sshLog.info('connection.established', 'SSH connected', {
 *   connection_id: 'ssh-123',
 * });
 */

// ==================== Log Levels ====================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

// ==================== Type Definitions ====================

export interface LogFields {
  [key: string]: any;
}

// Module constants definition
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

// Module configuration
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

// Log configuration
export interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  debugModules: DebugModules;
  format: 'text' | 'json';
}

// Global context (user_id, client, etc.)
export interface LogContext {
  user_id?: string;
  client?: string;
  session_id?: string;
}

// ==================== Default Configuration ====================

// Default module configuration
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

// Default configuration
const defaultConfig: LogConfig = {
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  debugModules: { ...defaultDebugModules },
  format: import.meta.env.DEV ? 'text' : 'json',
};

// ==================== Global State ====================

let currentConfig = { ...defaultConfig };
let globalContext: LogContext = {};

// File transport callback: Main process writes directly, Renderer sends via IPC
let fileTransport: ((line: string, level?: LogLevel) => void) | null = null;

/**
 * Set file transport callback for logging
 * - Main process: directly call logFileService.write()
 * - Renderer process: send to Main process via IPC
 */
export function setFileTransport(transport: ((line: string, level?: LogLevel) => void) | null) {
  fileTransport = transport;
}

/**
 * Set log configuration
 */
export function setLogConfig(config: Partial<LogConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Get current log configuration
 */
export function getLogConfig(): LogConfig {
  return { ...currentConfig };
}

/**
 * Set module debug switch
 */
export function setDebugModule(module: LogModule, enabled: boolean) {
  currentConfig.debugModules[module] = enabled;
}

/**
 * Set global log context (user_id, client, etc.)
 * Should be called after user login
 */
export function setLogContext(context: LogContext) {
  globalContext = { ...globalContext, ...context };
}

/**
 * Get global log context
 */
export function getLogContext(): LogContext {
  return { ...globalContext };
}

/**
 * Clear global log context
 * Should be called after user logout
 */
export function clearLogContext() {
  globalContext = {};
}

// ==================== Internal Methods ====================

/**
 * Get caller information
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

      // Skip internal logger calls (including hot reload ?t=xxx params)
      const normalizedLine = line.replace(/\?t=\d+/g, '');
      if (normalizedLine.includes('logger.ts') || normalizedLine.includes('logger.js')) {
        continue;
      }

      // Match format: at funcName (path/to/file.ts:line:col)
      const match1 = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match1) {
        const funcName = match1[1] || 'anonymous';
        const filePath = match1[2] || 'unknown';
        const lineNum = match1[3] || '0';
        // Remove hot reload param ?t=xxx
        const cleanFilePath = filePath.replace(/\?t=\d+/g, '');
        const fileName = cleanFilePath.split('/').pop() || cleanFilePath;
        return {
          file: `${fileName}:${lineNum}`,
          func: funcName,
        };
      }

      // Match format: at path/to/file.ts:line:col
      const match2 = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (match2) {
        const filePath = match2[1] || 'unknown';
        const lineNum = match2[2] || '0';
        // Remove hot reload param ?t=xxx
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
 * Check if module is DEBUG enabled
 */
function isModuleEnabled(module?: string): boolean {
  if (!module) return true;
  const moduleConfig = currentConfig.debugModules[module as LogModule];
  return moduleConfig !== false;
}

/**
 * Format log fields to string
 */
function formatFields(fields: LogFields): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      continue;
    }
    // For objects and arrays, convert to JSON string
    if (typeof value === 'object') {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } else {
      // Strings need to escape ${ to prevent template literal evaluation
      const strValue = String(value);
      parts.push(`${key}=${strValue.replace(/\$\{/g, '$_{')}`);
    }
  }
  return parts.join(' ');
}

/**
 * Internal log method
 */
function log(
  level: LogLevel,
  event: string,
  message: string,
  fields: LogFields = {}
) {
  // Check log level
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  const currentLevelIndex = levels.indexOf(currentConfig.level);
  const messageLevelIndex = levels.indexOf(level);
  if (messageLevelIndex < currentLevelIndex) {
    return;
  }

  // Check if module is DEBUG enabled
  const module = fields.module as string;
  if (level === LogLevel.DEBUG && !isModuleEnabled(module)) {
    return;
  }

  if (!currentConfig.enableConsole) {
    return;
  }

  // Get caller info
  const callerInfo = getCallerInfo();

  // Format timestamp (using local timezone)
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

  // Build base log data (merged with global context)
  const logData: LogFields = {
    timestamp,
    level,
    event,
    message,  // Use message instead of msg
    error: fields.error !== undefined ? fields.error : 0,
    ...globalContext,  // Add global context (user_id, client, etc.)
    ...fields,
  };

  // Add caller info
  if (callerInfo.file !== 'unknown') {
    // Remove hot reload param ?t=xxx to get clean file location
    logData.caller = callerInfo.file.replace(/\?t=\d+/g, '');
  }
  if (callerInfo.func !== 'unknown') {
    logData.func = callerInfo.func;
  }

  // Remove hot reload param ?t=xxx to get clean file location
  const cleanCallerLocation = callerInfo.file !== 'unknown'
    ? `[${callerInfo.file.replace(/\?t=\d+/g, '')}]`
    : '';
  const fieldsStr = formatFields(fields);
  const plainLogLine = fieldsStr
    ? `[${timeStr}] [${level}] ${cleanCallerLocation} event=${event} ${fieldsStr} | msg=${message}`
    : `[${timeStr}] [${level}] ${cleanCallerLocation} event=${event} | msg=${message}`;

  // Write to file (plain text, no ANSI colors)
  if (fileTransport) {
    fileTransport(plainLogLine, level);
  }

  // Output to console based on format
  if (currentConfig.format === 'json') {
    // JSON format output
    console[level.toLowerCase() as 'log' | 'info' | 'warn' | 'error'](
      JSON.stringify(logData)
    );
  } else {
    // Text format output (developer-friendly)
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

// ==================== Logger Class with Fields ====================

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

// ==================== Global Log API ====================

export const logger = {
  /**
   * DEBUG level log
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.connection.established')
   * @param message - Log message
   * @param fields - Extra fields
   */
  debug(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.DEBUG, event, message, { module, ...fields });
  },

  /**
   * INFO level log (user operations, flow events)
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.connection.established')
   * @param message - Log message
   * @param fields - Extra fields
   */
  info(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.INFO, event, message, { module, ...fields });
  },

  /**
   * WARN level log
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.connection.established')
   * @param message - Log message
   * @param fields - Extra fields
   */
  warn(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.WARN, event, message, { module, ...fields });
  },

  /**
   * ERROR level log
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.connection.established')
   * @param message - Log message
   * @param fields - Extra fields
   */
  error(module: LogModule, event: string, message: string, fields?: LogFields): void {
    log(LogLevel.ERROR, event, message, { module, ...fields });
  },

  /**
   * Create logger with fields
   */
  withFields(fields: LogFields): LoggerWithFields {
    return new LoggerWithFields(fields);
  },

  /**
   * Log performance metrics
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.command.completed')
   * @param message - Log message
   * @param latencyMs - Duration in milliseconds
   * @param fields - Extra fields
   */
  performance(module: LogModule, event: string, message: string, latencyMs: number, fields?: LogFields): void {
    log(LogLevel.INFO, event, message, {
      module,
      ...fields,
      latency_ms: latencyMs,
    });
  },

  /**
   * Log error (convenience method)
   * @param module - Module name (e.g., LOG_MODULE.SSH)
   * @param event - Event name (e.g., 'ssh.connection.failed')
   * @param error - Error object or error message
   * @param fields - Extra fields
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

// ==================== Utility Functions ====================

/**
 * Quickly create module logger
 * 
 * @example
 * const log = createModuleLogger(LOG_MODULE.SSH);
 * log.info('connection.established', 'SSH connected', { host: '192.168.1.1' });
 */
export function createModuleLogger(module: LogModule): LoggerWithFields {
  return new LoggerWithFields({ module });
}
