import SSHConfig from 'ssh-config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger, LOG_MODULE } from '../../base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.SSH });

/** ssh2 连接选项中由 SSH config 解析出的子集 */
export interface ResolvedSSHOptions {
  agentForward?: boolean;
  agent?: string | false;
  privateKey?: Buffer;
  keepaliveInterval?: number;
  // 预留：当前 UI 始终提供这三项，未来可支持别名连接
  hostname?: string;
  port?: number;
  user?: string;
}

/**
 * 解析 ~/.ssh/config，按主机匹配返回 ssh2 可用的选项。
 * 带 mtime 缓存，文件未修改不重新解析。
 */
export class SSHConfigParser {
  private configPath: string;
  private parsed: SSHConfig | null = null;
  private lastMtime: number = 0;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(os.homedir(), '.ssh', 'config');
  }

  /** 重新加载（如果文件已变更） */
  private reload(): void {
    try {
      const stat = fs.statSync(this.configPath);
      if (this.parsed && stat.mtimeMs === this.lastMtime) {
        return; // 未变更，跳过
      }
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.parsed = SSHConfig.parse(content);
      this.lastMtime = stat.mtimeMs;
      log.debug('ssh.config.loaded', 'SSH config loaded', { path: this.configPath });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // 文件不存在，静默跳过
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
   * 解析指定主机的 SSH 配置，返回 ssh2 可用的选项。
   * 文件不存在或解析失败时返回空对象。
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

    // IdentityFile → privateKey（读取文件内容）
    if (directives.IdentityFile) {
      const files = Array.isArray(directives.IdentityFile)
        ? directives.IdentityFile
        : [directives.IdentityFile];
      // 取第一个存在的文件
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
          // 文件不存在，尝试下一个
        }
      }
    }

    // ServerAliveInterval → keepaliveInterval（秒转毫秒）
    if (directives.ServerAliveInterval) {
      const seconds = parseInt(String(directives.ServerAliveInterval), 10);
      if (!isNaN(seconds) && seconds > 0) {
        result.keepaliveInterval = seconds * 1000;
      }
    }

    // 预留字段
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
 * 跨平台获取 SSH Agent socket 路径。
 * Unix: $SSH_AUTH_SOCK
 * Windows: 'pageant'
 */
export function getSSHAgentSocket(): string | undefined {
  if (process.platform === 'win32') {
    return 'pageant';
  }
  return process.env.SSH_AUTH_SOCK || undefined;
}

/** 全局单例 */
export const sshConfigParser = new SSHConfigParser();
