/**
 * SSH host connection
 *
 * Composes SSHTerminalBackend, manages SSH connection lifecycle.
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';
import { SSHTerminalBackend } from './SSHTerminalBackend';
import { SSHFsHandler } from './SSHFsHandler';
import { SSHCmdExecutor } from './SSHCmdExecutor';
import { NestedSSHDetector } from './NestedSSHDetector';
import type { NestedHost } from './NestedSSHDetector';
import { TerminalFsHandler } from './TerminalFsHandler';
import { ProxyCmdExecutor } from './ProxyCmdExecutor';
import { ProxyFsHandler } from './ProxyFsHandler';
import { PrivateShellExecutor } from './PrivateShellExecutor';
import { Host } from '@/utils/types';
import { sshService } from '@/core/ssh/sshService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class SSHHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'ssh';

  private _id: string = '';
  private _terminal: SSHTerminalBackend | null = null;
  private _proxyFs: ProxyFsHandler | null = null;
  private _proxyCmd: ProxyCmdExecutor | null = null;
  private _detector: NestedSSHDetector | null = null;
  private _effectiveHostname: string | null = null;
  private _hostChangedCallbacks: Array<(hostname: string) => void> = [];
  private _isConnected = false;
  private _monitorExecutor: PrivateShellExecutor | null = null;
  /** Separate private shell for file/cmd operations (isolated from user's terminal) */
  private _opsExecutor: PrivateShellExecutor | null = null;
  private _isShellPassthrough = false;

  constructor(private host: Host) {}

  get id(): string { return this._id; }

  get terminal(): SSHTerminalBackend | null {
    return this._terminal;
  }

  get fsHandler(): IFsHandler | null {
    return this._proxyFs;
  }

  get cmdExecutor(): ICmdExecutor | null {
    return this._proxyCmd;
  }

  get monitorCmdExecutor(): ICmdExecutor | null {
    return this._monitorExecutor;
  }

  get effectiveHostname(): string {
    return this._effectiveHostname ?? this.host.hostname;
  }

  onHostChanged(cb: (hostname: string) => void): () => void {
    this._hostChangedCallbacks.push(cb);
    return () => {
      const idx = this._hostChangedCallbacks.indexOf(cb);
      if (idx >= 0) this._hostChangedCallbacks.splice(idx, 1);
    };
  }

  async connect(): Promise<void> {
    log.info('ssh-host.connecting', 'SSHHostConnection connecting', {
      host_id: this.host.id, hostname: this.host.hostname,
    });

    const session = await sshService.connect(this.host);

    if (!session.connectionId) {
      throw new Error('SSH connection failed: no connectionId');
    }

    this._id = session.connectionId;
    this._isShellPassthrough = !!session.isShellPassthrough;
    this._terminal = new SSHTerminalBackend(
      session.connectionId,
      this.host.terminal?.encoding,
    );
    const sshFs = new SSHFsHandler(session.connectionId);
    const sshCmd = new SSHCmdExecutor(session.connectionId);
    this._proxyFs = new ProxyFsHandler(sshFs);
    this._proxyCmd = new ProxyCmdExecutor(sshCmd);

    this._detector = new NestedSSHDetector();
    this._setupNestedDetection();

    this._isConnected = true;

    log.info('ssh-host.connected', 'SSHHostConnection connected', {
      connection_id: this._id,
    });
  }

  async disconnect(): Promise<void> {
    if (this._id) {
      sshService.disconnectSession(this._id);
    }
    this._isConnected = false;
  }

  dispose(): void {
    this._opsExecutor?.dispose();
    this._opsExecutor = null;
    this._monitorExecutor?.dispose();
    this._monitorExecutor = null;
    this._detector?.dispose();
    this._terminal?.dispose();
    if (this._isConnected) {
      this.disconnect();
    }
    this._terminal = null;
    this._detector = null;
    this._hostChangedCallbacks = [];
  }

  private _setupNestedDetection(): void {
    if (!this._detector || !this._terminal) return;

    // Feed terminal output to detector and track CWD from OSC sequences
    (this._terminal as SSHTerminalBackend).onRawData(data => {
      this._detector?.feedOutput(data);
      // Parse OSC 7 (file://host/path) and OSC 2 (user@host: path) to track terminal CWD
      const osc7Match = data.match(/\x1b\]7;file:\/\/[^\/]*(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)/);
      if (osc7Match) {
        try {
          this._proxyFs?._setTrackedCwd(decodeURIComponent(osc7Match[1]));
        } catch {
          this._proxyFs?._setTrackedCwd(osc7Match[1]);
        }
      } else {
        // OSC 0 (icon+title) and OSC 2 (title): "user@host: /path" or "user@host: ~"
        const oscTitleMatch = data.match(/\x1b\][02];[^@\x07\x1b]+@[^:\x07\x1b]+:\s*(~[^\x07\x1b]*|\/[^\x07\x1b]*)(?:\x07|\x1b\\)/);
        if (oscTitleMatch) {
          this._proxyFs?._setTrackedCwdFromTitle(oscTitleMatch[1].trim());
        }
      }
    });

    // Handle entering nested host
    this._detector.on('host-entered', (nestedHost: NestedHost) => {
      const portFlag = nestedHost.port ? ` -p ${nestedHost.port}` : '';
      const userPrefix = nestedHost.username ? `${nestedHost.username}@` : '';
      const passthroughCmd = `ssh -tt -o StrictHostKeyChecking=no${portFlag} ${userPrefix}${nestedHost.hostname}\n`;

      // In shell passthrough mode, sshExecute() already routes commands to the target
      // via SSH wrapping in ssh-manager.ts. No need to switch proxy handlers.
      // For user-initiated nested SSH, use a PrivateShellExecutor (hidden extra shell)
      // instead of TerminalCmdExecutor to avoid polluting the user's terminal with markers.
      if (!this._isShellPassthrough) {
        this._opsExecutor?.dispose();
        this._opsExecutor = new PrivateShellExecutor({
          connectionId: this._id,
          passthroughCmd,
        });
        const termFs = new TerminalFsHandler(this._opsExecutor);
        this._proxyCmd!._switchToNested(this._opsExecutor);
        this._proxyFs!._switchToNested(termFs);
      }
      this._effectiveHostname = nestedHost.hostname;

      // Create private shell executor for monitoring (lazy — shell created on first use).
      this._monitorExecutor?.dispose();
      this._monitorExecutor = new PrivateShellExecutor({
        connectionId: this._id,
        passthroughCmd,
      });

      for (const cb of this._hostChangedCallbacks) {
        try { cb(this._effectiveHostname!); } catch { /* ignore */ }
      }

      log.info('nested-ssh.proxy_switched', 'Proxy switched to nested host', {
        hostname: this._effectiveHostname, depth: nestedHost.depth,
        is_shell_passthrough: this._isShellPassthrough,
      });
    });

    // Handle exiting nested host
    this._detector.on('host-exited', (current: NestedHost | null) => {
      if (current) {
        // Returned to a higher-level nested host
        const portFlag = current.port ? ` -p ${current.port}` : '';
        const userPrefix = current.username ? `${current.username}@` : '';
        const passthroughCmd = `ssh -tt -o StrictHostKeyChecking=no${portFlag} ${userPrefix}${current.hostname}\n`;

        this._opsExecutor?.dispose();
        this._opsExecutor = new PrivateShellExecutor({
          connectionId: this._id,
          passthroughCmd,
        });
        const termFs = new TerminalFsHandler(this._opsExecutor);
        this._proxyCmd!._switchToNested(this._opsExecutor);
        this._proxyFs!._switchToNested(termFs);
        this._effectiveHostname = current.hostname;
      } else {
        // Returned to original host
        this._proxyCmd!._switchToOriginal();
        this._proxyFs!._switchToOriginal();
        this._effectiveHostname = null;

        this._opsExecutor?.dispose();
        this._opsExecutor = null;
      }

      const hostname = current?.hostname ?? this.host.hostname;
      for (const cb of this._hostChangedCallbacks) {
        try { cb(hostname); } catch { /* ignore */ }
      }

      log.info('nested-ssh.proxy_restored', 'Proxy restored', {
        hostname, depth: current?.depth ?? 0,
      });
    });
  }
}
