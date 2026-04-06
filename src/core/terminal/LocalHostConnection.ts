/**
 * Local host connection
 *
 * Composes LocalTerminalBackend with nested SSH detection.
 * When user SSHes from a local terminal, file browser, monitoring,
 * and AI ops automatically switch to the remote host via proxies.
 */

import type { IHostConnection, HostConnectionType } from './IHostConnection';
import type { IFsHandler } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';
import { LocalTerminalBackend } from './LocalTerminalBackend';
import { LocalFsHandler } from './LocalFsHandler';
import { LocalCmdExecutor } from './LocalCmdExecutor';
import { NestedSSHDetector } from './NestedSSHDetector';
import type { NestedHost } from './NestedSSHDetector';
import { TerminalCmdExecutor } from './TerminalCmdExecutor';
import { TerminalFsHandler } from './TerminalFsHandler';
import { ProxyCmdExecutor } from './ProxyCmdExecutor';
import { ProxyFsHandler } from './ProxyFsHandler';
import { LocalPrivateShellExecutor } from './LocalPrivateShellExecutor';
import { Host } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export class LocalHostConnection implements IHostConnection {
  readonly type: HostConnectionType = 'local';

  private _id: string;
  private _terminal: LocalTerminalBackend;
  private _localFs: LocalFsHandler;
  private _localCmd: LocalCmdExecutor;
  private _proxyFs: ProxyFsHandler;
  private _proxyCmd: ProxyCmdExecutor;
  private _detector: NestedSSHDetector;
  private _effectiveHostname: string | null = null;
  private _hostChangedCallbacks: Array<(hostname: string) => void> = [];
  private _monitorExecutor: LocalPrivateShellExecutor | null = null;

  constructor(private host: Host) {
    this._id = `local-${Date.now()}`;
    this._terminal = new LocalTerminalBackend({
      shell: host.localConfig?.shell,
      cwd: host.localConfig?.cwd,
      env: host.localConfig?.env,
    });
    this._localFs = new LocalFsHandler();
    this._localCmd = new LocalCmdExecutor();
    this._proxyFs = new ProxyFsHandler(this._localFs);
    this._proxyCmd = new ProxyCmdExecutor(this._localCmd);
    this._detector = new NestedSSHDetector();

    this._setupNestedDetection();
  }

  get id(): string { return this._id; }
  get terminal(): LocalTerminalBackend { return this._terminal; }
  get fsHandler(): IFsHandler { return this._proxyFs; }
  get cmdExecutor(): ICmdExecutor { return this._proxyCmd; }

  get monitorCmdExecutor(): ICmdExecutor | null {
    return this._monitorExecutor;
  }

  get effectiveHostname(): string | null {
    return this._effectiveHostname;
  }

  onHostChanged(cb: (hostname: string) => void): () => void {
    this._hostChangedCallbacks.push(cb);
    return () => {
      const idx = this._hostChangedCallbacks.indexOf(cb);
      if (idx >= 0) this._hostChangedCallbacks.splice(idx, 1);
    };
  }

  /** After terminal connection, sync pty ID to fsHandler to support getting terminal cwd */
  updatePtyId(ptyId: string): void {
    this._id = ptyId;
    this._localFs.setConnectionId(ptyId);
  }

  dispose(): void {
    log.info('local-host.disposing', 'LocalHostConnection disposing', {
      id: this._id,
    });
    this._monitorExecutor?.dispose();
    this._monitorExecutor = null;
    this._detector.dispose();
    this._terminal.dispose();
    this._hostChangedCallbacks = [];
  }

  /** Build SSH command string from detected nested host info */
  private _buildSSHCommand(nestedHost: NestedHost): string {
    const portFlag = nestedHost.port ? ` -p ${nestedHost.port}` : '';
    const userPrefix = nestedHost.username ? `${nestedHost.username}@` : '';
    return `ssh -tt -o StrictHostKeyChecking=no${portFlag} ${userPrefix}${nestedHost.hostname}`;
  }

  /** Create a TerminalCmdExecutor wired to the raw data channel and mute control */
  private _createTerminalExecutor(): TerminalCmdExecutor {
    return new TerminalCmdExecutor(this._terminal, {
      onMuteChange: (muted) => this._terminal.setMuted(muted),
      registerRawData: (cb) => this._terminal.onRawData(cb),
    });
  }

  private _setupNestedDetection(): void {
    // Intercept terminal writes to detect SSH commands from user input
    const originalWrite = this._terminal.write.bind(this._terminal);
    this._terminal.write = (data: string) => {
      this._detector.feedInput(data);
      originalWrite(data);
    };

    // Feed terminal output to detector via raw channel (for login success/exit detection)
    this._terminal.onRawData(data => this._detector.feedOutput(data));

    // Handle entering nested host
    this._detector.on('host-entered', (nestedHost: NestedHost) => {
      const termCmd = this._createTerminalExecutor();
      const termFs = new TerminalFsHandler(termCmd);
      this._proxyCmd._switchToNested(termCmd);
      this._proxyFs._switchToNested(termFs);
      this._effectiveHostname = nestedHost.hostname;

      // Create private shell executor for monitoring (lazy -- shell created on first use)
      this._monitorExecutor?.dispose();
      this._monitorExecutor = new LocalPrivateShellExecutor({
        sshCommand: this._buildSSHCommand(nestedHost),
      });

      for (const cb of this._hostChangedCallbacks) {
        try { cb(this._effectiveHostname!); } catch { /* ignore */ }
      }

      log.info('local-nested-ssh.proxy_switched', 'Proxy switched to nested host', {
        hostname: this._effectiveHostname, depth: nestedHost.depth,
      });
    });

    // Handle exiting nested host
    this._detector.on('host-exited', (current: NestedHost | null) => {
      if (current) {
        // Returned to a higher-level nested host
        const termCmd = this._createTerminalExecutor();
        const termFs = new TerminalFsHandler(termCmd);
        this._proxyCmd._switchToNested(termCmd);
        this._proxyFs._switchToNested(termFs);
        this._effectiveHostname = current.hostname;

        // Recreate monitor executor for the new target
        this._monitorExecutor?.dispose();
        this._monitorExecutor = new LocalPrivateShellExecutor({
          sshCommand: this._buildSSHCommand(current),
        });
      } else {
        // Returned to original local host
        this._proxyCmd._switchToOriginal();
        this._proxyFs._switchToOriginal();
        this._effectiveHostname = null;

        this._monitorExecutor?.dispose();
        this._monitorExecutor = null;
      }

      const hostname = current?.hostname ?? 'local';
      for (const cb of this._hostChangedCallbacks) {
        try { cb(hostname); } catch { /* ignore */ }
      }

      log.info('local-nested-ssh.proxy_restored', 'Proxy restored', {
        hostname, depth: current?.depth ?? 0,
      });
    });
  }
}
