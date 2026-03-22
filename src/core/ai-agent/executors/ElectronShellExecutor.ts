/**
 * Electron Shell 命令执行器
 *
 * 继承 BaseShellExecutor，封装 window.electron SSH API。
 * 支持关联 SSH（复用终端 shell）和独立 SSH（独立 shell）两种模式。
 */

import { BaseShellExecutor } from './BaseShellExecutor';
import { SshMode } from '../types';

export interface ElectronShellExecutorConfig {
  /** 会话 ID */
  sessionId: string;
  /** SSH 模式：associated 复用终端 shell，independent 创建独立 shell */
  sshMode: SshMode;
}

/** Electron shell API 接口（用于依赖注入/测试） */
export interface ElectronShellAPI {
  sshCreateShell(shellId: string): Promise<void>;
  sshShellWrite(shellId: string, data: string): Promise<{ success: boolean }>;
  onShellData(callback: (connId: string, data: string) => void): () => void;
}

/**
 * 默认的 Electron API 适配器
 * 在 Electron 环境中使用 window.electron
 */
function getDefaultElectronAPI(): ElectronShellAPI {
  if (typeof window !== 'undefined' && (window as any).electron) {
    return (window as any).electron as ElectronShellAPI;
  }
  throw new Error('ElectronShellExecutor requires Electron environment (window.electron)');
}

export class ElectronShellExecutor extends BaseShellExecutor {
  private config: ElectronShellExecutorConfig;
  private electronAPI: ElectronShellAPI;
  private shellId: string;

  constructor(config: ElectronShellExecutorConfig, electronAPI?: ElectronShellAPI) {
    super();
    this.config = config;
    this.electronAPI = electronAPI || getDefaultElectronAPI();

    // 关联模式复用终端的 sessionId，独立模式使用派生 ID
    this.shellId = config.sshMode === 'associated'
      ? config.sessionId
      : `${config.sessionId}__ai_shell`;
  }

  protected async setupShell(): Promise<void> {
    // 独立模式需要创建新 shell
    if (this.config.sshMode !== 'associated') {
      await this.electronAPI.sshCreateShell(this.shellId);
    }
  }

  protected async writeRaw(data: string): Promise<void> {
    const result = await this.electronAPI.sshShellWrite(this.shellId, data);
    if (!result.success) {
      throw new Error('Failed to write command to shell');
    }
  }

  protected onShellDataSetup(): () => void {
    return this.electronAPI.onShellData((connId, data) => {
      if (connId !== this.shellId) return;
      this.handleShellData(data);
    });
  }

  /** 获取 shell ID（供外部使用） */
  getShellId(): string {
    return this.shellId;
  }
}
