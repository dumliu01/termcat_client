/**
 * Local Shell Command Executor
 *
 * Extends BaseShellExecutor, executes commands via Local PTY IPC.
 * Reuses all common logic from base class (marker injection, output parsing, timeout management).
 *
 * Supports two modes:
 * - associated: Associated mode, reuse user's terminal PTY (commands execute in user's visible terminal)
 * - independent: Independent mode, create new PTY (AI-specific, doesn't interfere with user interaction)
 */

import { BaseShellExecutor } from './BaseShellExecutor';
import { SshMode } from '../types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.AI });

export interface LocalShellExecutorConfig {
  /** For log identification */
  sessionId?: string;
  /** PTY ID of user's terminal in associated mode */
  existingPtyId?: string;
  /** Execution mode: associated reuses user's terminal, independent creates separate PTY */
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

    // Windows local terminal defaults to PowerShell, set shell type to generate compatible command markers
    if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
      this.shellType = 'powershell';
    }
  }

  protected async setupShell(): Promise<void> {
    if (!window.electron?.localTerminal) {
      throw new Error('Local terminal API not available');
    }

    if (this.mode === 'associated' && this.existingPtyId) {
      // Associated mode: reuse user's terminal PTY
      this.ptyId = this.existingPtyId;
      log.info('local-executor.setup', 'Using existing PTY (associated mode)', {
        session_id: this.sessionId,
        pty_id: this.ptyId,
      });
    } else {
      // Independent mode: create new PTY
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
   * Get PTY ID (for debugging/logging)
   */
  getPtyId(): string {
    return this.ptyId;
  }

  async cleanup(): Promise<void> {
    const ptyId = this.ptyId;
    const isIndependent = this.mode === 'independent';

    // Call parent cleanup first (cleanup timers, unsubscribe, etc.)
    await super.cleanup();

    // Only destroy PTY in independent mode (associated mode's PTY is managed by user's terminal)
    if (isIndependent && ptyId && window.electron?.localTerminal) {
      log.info('local-executor.cleanup', 'Destroying AI executor PTY', {
        session_id: this.sessionId,
        pty_id: ptyId,
      });
      try {
        await window.electron.localTerminal.destroy(ptyId);
      } catch (e) {
        // PTY may have already exited, ignore
      }
    }

    this.ptyId = '';
  }
}
