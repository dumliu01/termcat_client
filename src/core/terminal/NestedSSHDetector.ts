/**
 * NestedSSHDetector - Detects nested SSH sessions from terminal output.
 *
 * Monitors the terminal output stream (server echoes) and maintains a host stack
 * to track multi-level SSH jumps (A -> B -> C). Uses a simple state machine:
 *   idle -> pending_login -> nested
 *
 * Only analyses echoed output, NOT raw user keystrokes.
 */

import { EventEmitter } from '@/core/ai-agent/EventEmitter';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

// ==================== Types ====================

export interface NestedHost {
  hostname: string;
  username?: string;
  port?: number;
  depth: number; // 0 = original, 1 = first jump, etc.
}

type DetectorState = 'idle' | 'pending_login' | 'nested';

// ==================== Constants ====================

/** Timeout (ms) for pending login state before auto-cancelling */
const PENDING_LOGIN_TIMEOUT_MS = 30_000;

/** SSH flags that take a mandatory argument (next token) */
const SSH_FLAGS_WITH_ARG = new Set([
  '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J',
  '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w',
]);

/** Patterns indicating successful SSH login */
const LOGIN_SUCCESS_PATTERNS: RegExp[] = [
  /Last login:/i,
  /Welcome to/i,
  /Linux\s+\S+\s+\d+\.\d+/,          // Linux kernel banner
  /Ubuntu/i,
  /Debian/i,
  /CentOS/i,
  /Red Hat/i,
  /Fedora/i,
  /Alpine/i,
  /Arch Linux/i,
  /SUSE/i,
  /Amazon Linux/i,
  /FreeBSD/i,
];

/** Patterns indicating SSH login failure */
const LOGIN_FAILURE_PATTERNS: RegExp[] = [
  /Connection refused/i,
  /Permission denied/i,
  /No route to host/i,
  /Connection timed out/i,
  /Host key verification failed/i,
  /Could not resolve hostname/i,
  /Network is unreachable/i,
  /Connection reset by peer/i,
  /ssh:\s+connect to host/i,
];

/** Patterns indicating exit from a nested session */
const EXIT_PATTERNS: RegExp[] = [
  /Connection to \S+ closed/i,
  /^logout\s*$/,
];

// ==================== ANSI stripping ====================

/** Strip ANSI escape sequences (CSI, OSC, etc.) from a string */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b\[[\?]?[0-9;]*[hlm]|\x1b\[[0-9]*[JKG]|\r/g, '');
}

// ==================== Detector ====================

export class NestedSSHDetector extends EventEmitter {
  private state: DetectorState = 'idle';
  private stack: NestedHost[] = [];
  private pendingHost: Omit<NestedHost, 'depth'> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private lineBuffer = '';
  private _inputBuffer = '';
  private disposed = false;

  // --------------- Public API ---------------

  /** Feed a chunk of terminal output data for analysis */
  feedOutput(data: string): void {
    if (this.disposed) return;

    // Buffer incoming data and process complete lines
    this.lineBuffer += data;
    const lines = this.lineBuffer.split('\n');
    // Keep the last incomplete segment in the buffer
    this.lineBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      this.processLine(rawLine);
    }

    // When pending login, also check the incomplete line buffer for shell prompts.
    // Prompts (e.g. "www@host:~$ ") don't end with \n so they stay in the buffer.
    if (this.state === 'pending_login' && this.lineBuffer) {
      const stripped = stripAnsi(this.lineBuffer).trim();
      if (stripped && this.looksLikePrompt(stripped)) {
        log.info('nested-ssh.prompt-detected', 'Shell prompt detected in buffer, confirming login', {
          hostname: this.pendingHost?.hostname,
          prompt: stripped.substring(0, 50),
        });
        this.confirmLogin();
      }
    }
  }

  /** Feed user input for SSH command detection (cleaner than output parsing for local terminals) */
  feedInput(data: string): void {
    if (this.disposed) return;
    this._inputBuffer += data;

    // Check for Enter key (\r or \n)
    if (data.includes('\r') || data.includes('\n')) {
      // Strip bracket paste mode markers ([200~ and [201~) that wrap pasted text
      const line = this._inputBuffer
        .replace(/\x1b?\[200~/g, '')
        .replace(/\x1b?\[201~/g, '')
        .trim();
      this._inputBuffer = '';
      if (line) {
        this._processInputLine(line);
      }
    }
  }

  private _processInputLine(line: string): void {
    // Only try SSH detection in idle or nested state
    if (this.state === 'pending_login') return;
    this.tryDetectSSHCommand(line);
  }

  get currentHost(): NestedHost | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  get isNested(): boolean {
    return this.stack.length > 0;
  }

  get depth(): number {
    return this.stack.length;
  }

  get hostStack(): readonly NestedHost[] {
    return this.stack;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPendingTimer();
    this.stack = [];
    this.pendingHost = null;
    this.lineBuffer = '';
    this._inputBuffer = '';
    this.removeAllListeners();
  }

  // --------------- Internal ---------------

  private processLine(rawLine: string): void {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    switch (this.state) {
      case 'idle':
        this.handleIdle(line);
        break;
      case 'pending_login':
        this.handlePendingLogin(line);
        break;
      case 'nested':
        this.handleNested(line);
        break;
    }
  }

  /** In idle state, watch for SSH commands */
  private handleIdle(line: string): void {
    this.tryDetectSSHCommand(line);
  }

  /** In pending_login state, watch for login success or failure */
  private handlePendingLogin(line: string): void {
    if (this.matchesAny(line, LOGIN_SUCCESS_PATTERNS)) {
      this.confirmLogin();
      return;
    }
    if (this.matchesAny(line, LOGIN_FAILURE_PATTERNS)) {
      log.info('nested-ssh.login-failed', 'SSH login failed', {
        hostname: this.pendingHost?.hostname,
      });
      this.cancelPending();
      return;
    }
  }

  /** In nested state, watch for further SSH commands or exit signals */
  private handleNested(line: string): void {
    // Check exit first
    if (this.matchesAny(line, EXIT_PATTERNS)) {
      this.handleExit();
      return;
    }
    // Check for deeper SSH jump
    this.tryDetectSSHCommand(line);
  }

  /**
   * Try to parse an SSH command from a line.
   *
   * Uses argument-by-argument parsing instead of a single regex to correctly
   * handle combined flags (-tt), flags with arguments (-p 22, -o Key=Value),
   * and passthrough commands (ssh -tt -o StrictHostKeyChecking=no -p 22 user@host).
   */
  private tryDetectSSHCommand(line: string): void {
    // Match ssh command only when it appears at a shell prompt ($ ssh, # ssh, > ssh)
    // or at the start of the line. This prevents matching SSH examples in MOTD text
    // like "# 示例：登录root账号：ssh root@1.1.1.1".
    const sshMatch = line.match(/(?:^|[$#%>]\s+)ssh\s+/);
    if (!sshMatch || sshMatch.index === undefined) return;

    const argsStr = line.substring(sshMatch.index + sshMatch[0].length).trim();
    if (!argsStr) return;

    const parts = argsStr.split(/\s+/);
    let hostname: string | undefined;
    let username: string | undefined;
    let port: number | undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('-')) {
        // Check if this flag takes an argument
        // Handle both "-p 22" and "-p22" styles, and combined flags like "-tt"
        const flagLetter = `-${part.charAt(1)}`;
        if (SSH_FLAGS_WITH_ARG.has(flagLetter)) {
          if (part.length === 2 && i + 1 < parts.length) {
            // Flag and argument are separate tokens: "-p 22"
            if (flagLetter === '-p') port = parseInt(parts[i + 1], 10);
            i++; // skip argument
          }
          // Otherwise argument is attached: "-p22" or "-oStrictHostKeyChecking=no" — just skip
        }
        // Flags without arguments (-t, -tt, -v, -N, etc.) — just skip
        continue;
      }

      // First non-flag token is [user@]hostname
      if (part.includes('@')) {
        const atIdx = part.indexOf('@');
        username = part.substring(0, atIdx) || undefined;
        hostname = part.substring(atIdx + 1);
      } else {
        hostname = part;
      }
      break;
    }

    if (!hostname || hostname.startsWith('-')) return;

    log.info('nested-ssh.command-detected', 'SSH command detected in output', {
      hostname,
      username,
      port,
    });

    this.pendingHost = { hostname, username, port };
    this.state = 'pending_login';
    this.startPendingTimer();
  }

  /** Confirm that the pending SSH login succeeded */
  private confirmLogin(): void {
    if (!this.pendingHost) return;

    const host: NestedHost = {
      ...this.pendingHost,
      depth: this.stack.length + 1,
    };
    this.stack.push(host);
    this.clearPendingTimer();
    this.pendingHost = null;
    this.state = 'nested';

    log.info('nested-ssh.host-entered', 'Entered nested SSH host', {
      hostname: host.hostname,
      depth: host.depth,
    });

    this.emit('host-entered', host, [...this.stack]);
  }

  /** Handle exit from the current nested session */
  private handleExit(): void {
    const exited = this.stack.pop();
    const current = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;

    // If still nested, remain in nested state; otherwise go idle
    this.state = this.stack.length > 0 ? 'nested' : 'idle';

    log.info('nested-ssh.host-exited', 'Exited nested SSH host', {
      exited: exited?.hostname,
      returnedTo: current?.hostname ?? 'original',
      depth: this.stack.length,
    });

    this.emit('host-exited', current, [...this.stack]);
  }

  /** Cancel the pending login attempt */
  private cancelPending(): void {
    this.clearPendingTimer();
    this.pendingHost = null;
    // Return to the previous state
    this.state = this.stack.length > 0 ? 'nested' : 'idle';
  }

  /** Start a timeout timer for pending login */
  private startPendingTimer(): void {
    this.clearPendingTimer();
    this.pendingTimer = setTimeout(() => {
      if (this.state === 'pending_login') {
        log.warn('nested-ssh.login-timeout', 'SSH login detection timed out', {
          hostname: this.pendingHost?.hostname,
        });
        this.cancelPending();
      }
    }, PENDING_LOGIN_TIMEOUT_MS);
  }

  /** Clear the pending login timeout timer */
  private clearPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  /** Check if a line matches any pattern in the list */
  private matchesAny(line: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(line));
  }

  /**
   * Check if a string looks like a shell prompt (e.g. "www@host:~$ " or "[root@host ~]# ").
   * Used to detect successful SSH login when no MOTD/banner is shown.
   */
  private looksLikePrompt(line: string): boolean {
    // Must be reasonably short (prompts are typically < 200 chars)
    if (line.length > 200 || line.length < 2) return false;
    // Must not look like a login failure
    if (this.matchesAny(line, LOGIN_FAILURE_PATTERNS)) return false;
    // Must end with a common prompt character (possibly followed by space)
    if (!/[$#%>]\s*$/.test(line)) return false;
    // Prefer patterns that include user@host (strong indicator of a real prompt)
    if (/\S+@\S+/.test(line)) return true;
    // Accept short lines ending with prompt char (minimal prompts like "# " or "$ ")
    if (line.length < 30) return true;
    return false;
  }
}
