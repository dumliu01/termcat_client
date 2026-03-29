/**
 * Terminal abstraction layer type definitions
 */

export type TerminalBackendType = 'ssh' | 'local';

export interface TerminalConnectOptions {
  cols: number;
  rows: number;
}

export interface SSHConnectOptions extends TerminalConnectOptions {
  connectionId: string;
  encoding?: string;
}

export interface LocalConnectOptions extends TerminalConnectOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  args?: string[];
}

export interface ShellInfo {
  name: string;
  path: string;
  args?: string[];
}

export interface LocalTerminalConfig {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export type TerminalDataCallback = (data: string) => void;
export type TerminalCloseCallback = () => void;
