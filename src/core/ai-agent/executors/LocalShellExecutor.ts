/**
 * 本地 Shell 命令执行器
 *
 * 继承 BaseShellExecutor，通过 Local PTY IPC 执行命令。
 * 复用基类所有通用逻辑（标记注入、输出解析、超时管理等）。
 *
 * 支持两种模式：
 * - associated: 关联模式，复用用户终端的 PTY（命令在用户可见的终端执行）
 * - independent: 独立模式，创建新 PTY（AI 专用，不干扰用户交互）
 */

import { BaseShellExecutor } from './BaseShellExecutor';
import { SshMode } from '../types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.AI });

export interface LocalShellExecutorConfig {
  /** 用于日志标识 */
  sessionId?: string;
  /** 关联模式下，用户终端的 ptyId */
  existingPtyId?: string;
  /** 执行模式：associated 复用用户终端，independent 创建独立 PTY */
  sshMode?: SshMode;
}

export class LocalShellExecutor extends BaseShellExecutor {
  private ptyId: string = '';
  private sessionId: string;
  private mode: SshMode;
  private existingPtyId?: string;

  constructor(config?: LocalShellExecutorConfig) {
    super();
    this.sessionId = config?.sessionId || `local-ai-${Date.now()}`;
    this.mode = config?.sshMode || 'independent';
    this.existingPtyId = config?.existingPtyId;

    // Windows 本地终端默认是 PowerShell，设置 shell 类型以生成兼容的命令标记
    if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
      this.shellType = 'powershell';
    }
  }

  protected async setupShell(): Promise<void> {
    if (!window.electron?.localTerminal) {
      throw new Error('Local terminal API not available');
    }

    if (this.mode === 'associated' && this.existingPtyId) {
      // 关联模式：复用用户终端的 PTY
      this.ptyId = this.existingPtyId;
      log.info('local-executor.setup', 'Using existing PTY (associated mode)', {
        session_id: this.sessionId,
        pty_id: this.ptyId,
      });
    } else {
      // 独立模式：创建新 PTY
      log.info('local-executor.setup', 'Creating local PTY for AI executor', {
        session_id: this.sessionId,
      });

      const result = await window.electron.localTerminal.create({
        cols: 200,
        rows: 50,
      });

      this.ptyId = result.ptyId;

      log.info('local-executor.ready', 'Local PTY created for AI executor', {
        session_id: this.sessionId,
        pty_id: this.ptyId,
      });
    }
  }

  protected async writeRaw(data: string): Promise<void> {
    if (!window.electron?.localTerminal || !this.ptyId) {
      throw new Error('Local shell not ready');
    }
    window.electron.localTerminal.write(this.ptyId, data);
  }

  protected onShellDataSetup(): () => void {
    if (!window.electron?.localTerminal) {
      throw new Error('Local terminal API not available');
    }

    return window.electron.localTerminal.onData((ptyId: string, data: string) => {
      if (ptyId === this.ptyId) {
        this.handleShellData(data);
      }
    });
  }

  /**
   * 获取 PTY ID（用于调试/日志）
   */
  getPtyId(): string {
    return this.ptyId;
  }

  async cleanup(): Promise<void> {
    const ptyId = this.ptyId;
    const isIndependent = this.mode === 'independent';

    // 先调父类 cleanup（清理 timer、unsubscribe 等）
    await super.cleanup();

    // 仅独立模式下销毁 PTY（关联模式的 PTY 归用户终端管理）
    if (isIndependent && ptyId && window.electron?.localTerminal) {
      log.info('local-executor.cleanup', 'Destroying AI executor PTY', {
        session_id: this.sessionId,
        pty_id: ptyId,
      });
      try {
        await window.electron.localTerminal.destroy(ptyId);
      } catch (e) {
        // PTY 可能已退出，忽略
      }
    }

    this.ptyId = '';
  }
}
