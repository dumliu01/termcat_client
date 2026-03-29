/**
 * Electron Shell Command Executor
 *
 * Extends BaseShellExecutor, wraps window.electron SSH API.
 * Supports associated SSH (reuses terminal shell) and independent SSH (separate shell) modes.
 */

import { BaseShellExecutor } from './BaseShellExecutor';
import { SshMode } from '../types';

export interface ElectronShellExecutorConfig {
  /** Session ID */
  sessionId: string;
  /** SSH mode: associated reuses terminal shell, independent creates separate shell */
  sshMode: SshMode;
}

/** Electron shell API interface (for dependency injection/testing) */
export interface ElectronShellAPI {
  sshCreateShell(shellId: string): Promise<void>;
  sshCloseShell?(shellId: string): Promise<{ success: boolean }>;
  sshShellWrite(shellId: string, data: string): Promise<{ success: boolean }>;
  onShellData(callback: (connId: string, data: string) => void): () => void;
}

/**
 * Default Electron API adapter
 * Uses window.electron in Electron environment
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

    // Associated mode reuses terminal's sessionId, independent mode uses derived ID
    this.shellId = config.sshMode === 'associated'
      ? config.sessionId
      : `${config.sessionId}__ai_shell`;
  }

  protected async setupShell(): Promise<void> {
    // Independent mode needs to create new shell
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

  /** Override cleanup to close independent shell channel */
  async cleanup(): Promise<void> {
    // Close independent shell channel BEFORE super.cleanup() resets _isReady
    // Associated mode reuses terminal shell — don't close it
    if (this.config.sshMode !== 'associated' && this._isReady) {
      try {
        await this.electronAPI.sshCloseShell?.(this.shellId);
      } catch { /* ignore — connection may already be closed */ }
    }
    await super.cleanup();
  }

  /** Get shell ID (for external use) */
  getShellId(): string {
    return this.shellId;
  }
}
