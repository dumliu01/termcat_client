import SSHConfig from 'ssh-config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger, LOG_MODULE } from '../../base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.SSH });

/** SSH config options resolved from ~/.ssh/config for ssh2 connection options */
export interface ResolvedSSHOptions {
  agentForward?: boolean;
  agent?: string | false;
  privateKey?: Buffer;
  keepaliveInterval?: number;
  // Reserved: UI always provides these three, alias connection can be supported in the future
  hostname?: string;
  port?: number;
  user?: string;
}

/**
 * Parse ~/.ssh/config, return ssh2-compatible options based on host matching.
 * With mtime cache, don't re-parse if file hasn't been modified.
 */
export class SSHConfigParser {
  private configPath: string;
  private parsed: SSHConfig | null = null;
  private lastMtime: number = 0;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(os.homedir(), '.ssh', 'config');
  }

  /** Reload (if file has changed) */
  private reload(): void {
    try {
      const stat = fs.statSync(this.configPath);
      if (this.parsed && stat.mtimeMs === this.lastMtime) {
        return; // No change, skip
      }
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.parsed = SSHConfig.parse(content);
      this.lastMtime = stat.mtimeMs;
      log.debug('ssh.config.loaded', 'SSH config loaded', { path: this.configPath });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, skip silently
        this.parsed = null;
        return;
      }
      log.warn('ssh.config.parse_error', 'Failed to parse SSH config', {
        path: this.configPath,
        error_msg: err.message,
      });
      this.parsed = null;
    }
  }

  /**
   * Parse SSH config for specified host, return ssh2-compatible options.
   * Returns empty object if file doesn't exist or parsing fails.
   */
  resolve(hostname: string): ResolvedSSHOptions {
    this.reload();
    if (!this.parsed) return {};

    const directives = this.parsed.compute(hostname);
    const result: ResolvedSSHOptions = {};

    // ForwardAgent → agentForward + agent
    if (directives.ForwardAgent) {
      const val = String(directives.ForwardAgent).toLowerCase();
      if (val === 'yes') {
        result.agentForward = true;
        result.agent = getSSHAgentSocket() || undefined;
      } else {
        result.agentForward = false;
      }
    }

    // IdentityFile → privateKey (read file content)
    if (directives.IdentityFile) {
      const files = Array.isArray(directives.IdentityFile)
        ? directives.IdentityFile
        : [directives.IdentityFile];
      // Take first existing file
      for (const raw of files) {
        const resolved = raw.replace(/^~/, os.homedir());
        try {
          result.privateKey = fs.readFileSync(resolved);
          log.debug('ssh.config.identity_loaded', 'Identity file loaded from SSH config', {
            hostname,
            identity_file: resolved,
          });
          break;
        } catch {
          // File doesn't exist, try next one
        }
      }
    }

    // ServerAliveInterval → keepaliveInterval (seconds to milliseconds)
    if (directives.ServerAliveInterval) {
      const seconds = parseInt(String(directives.ServerAliveInterval), 10);
      if (!isNaN(seconds) && seconds > 0) {
        result.keepaliveInterval = seconds * 1000;
      }
    }

    // Reserved fields
    if (directives.HostName) {
      result.hostname = String(directives.HostName);
    }
    if (directives.Port) {
      const port = parseInt(String(directives.Port), 10);
      if (!isNaN(port)) result.port = port;
    }
    if (directives.User) {
      result.user = String(directives.User);
    }

    log.debug('ssh.config.resolved', 'SSH config resolved for host', {
      hostname,
      has_agent_forward: result.agentForward ?? false,
      has_private_key: !!result.privateKey,
      keepalive_interval: result.keepaliveInterval,
    });

    return result;
  }
}

/**
 * Cross-platform get SSH Agent socket path.
 * Unix: $SSH_AUTH_SOCK
 * Windows: 'pageant'
 */
export function getSSHAgentSocket(): string | undefined {
  if (process.platform === 'win32') {
    return 'pageant';
  }
  return process.env.SSH_AUTH_SOCK || undefined;
}

/** Global singleton */
export const sshConfigParser = new SSHConfigParser();
