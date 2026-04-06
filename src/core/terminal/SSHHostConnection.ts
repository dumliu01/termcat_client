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
import { TerminalCmdExecutor } from './TerminalCmdExecutor';
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

  /** Create a TerminalCmdExecutor wired to the raw data channel and mute control */
  private _createTerminalExecutor(): TerminalCmdExecutor {
    const terminal = this._terminal as SSHTerminalBackend;
    return new TerminalCmdExecutor(this._terminal!, {
      onMuteChange: (muted) => terminal.setMuted(muted),
      registerRawData: (cb) => terminal.onRawData(cb),
    });
  }

  private _setupNestedDetection(): void {
    if (!this._detector || !this._terminal) return;

    // Feed terminal output to detector via raw channel (always fires, even when muted)
    (this._terminal as SSHTerminalBackend).onRawData(data => this._detector?.feedOutput(data));

    // Handle entering nested host
    this._detector.on('host-entered', (nestedHost: NestedHost) => {
      const termCmd = this._createTerminalExecutor();
      const termFs = new TerminalFsHandler(termCmd);
      this._proxyCmd!._switchToNested(termCmd);
      this._proxyFs!._switchToNested(termFs);
      this._effectiveHostname = nestedHost.hostname;

      // Create private shell executor for monitoring (lazy — shell created on first use).
      // Build passthrough command from detected nestedHost info (works for ALL cases:
      // pre-configured jump hosts, manual SSH jumps, shell passthrough, etc.)
      const portFlag = nestedHost.port ? ` -p ${nestedHost.port}` : '';
      const userPrefix = nestedHost.username ? `${nestedHost.username}@` : '';
      const passthroughCmd = `ssh -tt -o StrictHostKeyChecking=no${portFlag} ${userPrefix}${nestedHost.hostname}\n`;
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
      });
    });

    // Handle exiting nested host
    this._detector.on('host-exited', (current: NestedHost | null) => {
      if (current) {
        // Returned to a higher-level nested host
        const termCmd = this._createTerminalExecutor();
        const termFs = new TerminalFsHandler(termCmd);
        this._proxyCmd!._switchToNested(termCmd);
        this._proxyFs!._switchToNested(termFs);
        this._effectiveHostname = current.hostname;
      } else {
        // Returned to original host
        this._proxyCmd!._switchToOriginal();
        this._proxyFs!._switchToOriginal();
        this._effectiveHostname = null;
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
