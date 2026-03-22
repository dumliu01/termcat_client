import { Client, ClientChannel, SFTPWrapper } from 'ssh2';
import { EventEmitter } from 'events';
import { StringDecoder } from 'string_decoder';
import { logger, LOG_MODULE } from '../../base/logger/logger';
import * as iconv from 'iconv-lite';
import * as net from 'net';
import { sshConfigParser, getSSHAgentSocket, ResolvedSSHOptions } from './ssh-config-parser';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  proxy?: ProxyConfig;
  jumpHost?: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
  };
}

export interface ProxyConfig {
  type: 'SOCKS5' | 'HTTP' | 'HTTPS';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface OSInfo {
  osType: string;    // "linux/ubuntu", "linux/centos", "macos", "windows"
  osVersion: string; // "22.04", "14.2" 等
  kernel: string;    // "Linux 5.15.0-91-generic"
  shell: string;     // "bash", "zsh", "sh"
}

export interface SSHConnection {
  id: string;
  client: Client;
  connected: boolean;
  shell?: ClientChannel;
  /** 额外的命名 shell 通道（如 AI 运维独立 shell） */
  extraShells: Map<string, ClientChannel>;
  eventEmitter: EventEmitter;
  currentDirectory: string; // 跟踪当前工作目录
  encoding: string; // 终端字符编码
  osInfo?: OSInfo; // 远程服务器操作系统信息
  osInfoPromise?: Promise<void>; // OS 检测进行中的 promise
  jumpClient?: Client; // 跳板机 SSH 客户端（如有）
  banner?: string; // SSH Banner（sshd_config Banner 指令，认证前发送）
  shellPassthroughCmd?: string; // shell passthrough: 在 shell 中自动执行的命令（如 ssh target_host）
}

export class SSHService {
  private connections: Map<string, SSHConnection> = new Map();
  private configs: Map<string, SSHConfig> = new Map();
  private webContents: any;  // 保留用于向后兼容
  // 信号量，用于限制并发操作数量，防止 SSH 通道耗尽
  private activeOperations: Map<string, number> = new Map();
  private readonly MAX_CONCURRENT_OPERATIONS = 5;
  private operationQueue: Map<string, (() => void)[]> = new Map();

  // 测试代理服务器是否可达
  private testProxyReachability(host: string, port: number): Promise<boolean> {
    logger.info(LOG_MODULE.SSH, 'ssh.proxy.testing', 'Testing proxy reachability', {
      module: LOG_MODULE.SSH,
      proxy_host: host,
      proxy_port: port,
    });

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 5000; // 5秒超时

      const timer = setTimeout(() => {
        socket.destroy();
        logger.warn(LOG_MODULE.SSH, 'ssh.proxy.timeout', 'Proxy connection timeout', {
          module: LOG_MODULE.SSH,
          proxy_host: host,
          proxy_port: port,
        });
        resolve(false);
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        logger.info(LOG_MODULE.SSH, 'ssh.proxy.reachable', 'Proxy is reachable', {
          module: LOG_MODULE.SSH,
          proxy_host: host,
          proxy_port: port,
        });
        resolve(true);
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        socket.destroy();
        logger.warn(LOG_MODULE.SSH, 'ssh.proxy.error', 'Proxy connection error', {
          module: LOG_MODULE.SSH,
          proxy_host: host,
          proxy_port: port,
          error_msg: err.message,
        });
        resolve(false);
      });
    });
  }

  // 设置webContents用于发送事件到渲染进程（保留用于向后兼容）
  setWebContents(webContents: any) {
    this.webContents = webContents;
  }

  // 信号量：检查是否可以执行操作
  private async acquireOperationSlot(connectionId: string): Promise<void> {
    const current = this.activeOperations.get(connectionId) || 0;

    if (current < this.MAX_CONCURRENT_OPERATIONS) {
      this.activeOperations.set(connectionId, current + 1);
      return;
    }

    // 如果已达到上限，等待
    return new Promise((resolve) => {
      const queue = this.operationQueue.get(connectionId) || [];
      queue.push(resolve);
      this.operationQueue.set(connectionId, queue);
    });
  }

  // 信号量：释放操作槽
  private releaseOperationSlot(connectionId: string): void {
    const current = this.activeOperations.get(connectionId) || 1;
    const newValue = Math.max(0, current - 1);
    this.activeOperations.set(connectionId, newValue);

    // 检查是否有等待的操作
    const queue = this.operationQueue.get(connectionId);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        this.activeOperations.set(connectionId, current);
        next();
      }
    }
  }

  // 连接到SSH服务器
  async connect(config: SSHConfig): Promise<string> {
    // 如果配置了代理，先测试代理连通性
    if (config.proxy) {
      logger.info(LOG_MODULE.SSH, 'ssh.proxy.detected', 'Proxy configuration detected, testing reachability', {
        module: LOG_MODULE.SSH,
        proxy_type: config.proxy.type,
        proxy_host: config.proxy.host,
        proxy_port: config.proxy.port,
      });

      const proxyReachable = await this.testProxyReachability(config.proxy.host, config.proxy.port);
      if (!proxyReachable) {
        logger.error(LOG_MODULE.SSH, 'ssh.proxy.unreachable', 'Proxy is not reachable', {
          module: LOG_MODULE.SSH,
          proxy_type: config.proxy.type,
          proxy_host: config.proxy.host,
          proxy_port: config.proxy.port,
        });
        // 抛出特定错误，让前端处理
        throw new Error(`PROXY_UNREACHABLE:${config.proxy.host}:${config.proxy.port}`);
      }

      logger.info(LOG_MODULE.SSH, 'ssh.proxy.verified', 'Proxy is reachable, proceeding with connection', {
        module: LOG_MODULE.SSH,
        proxy_host: config.proxy.host,
        proxy_port: config.proxy.port,
      });
    } else {
      logger.debug(LOG_MODULE.SSH, 'ssh.proxy.none', 'No proxy configured, using direct connection', {
        module: LOG_MODULE.SSH,
      });
    }

    // 解析 ~/.ssh/config 中匹配的配置
    const resolvedTarget = sshConfigParser.resolve(config.host);
    const resolvedJump = config.jumpHost ? sshConfigParser.resolve(config.jumpHost.host) : undefined;

    // 跳板机模式
    if (config.jumpHost) {
      return this.connectViaJumpHost(config, resolvedTarget, resolvedJump!);
    }

    return this.connectDirect(config, resolvedTarget);
  }

  // 通过跳板机连接
  private async connectViaJumpHost(config: SSHConfig, resolvedTarget: ResolvedSSHOptions, resolvedJump: ResolvedSSHOptions): Promise<string> {
    const jumpConfig = config.jumpHost!;
    const connectionId = `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const eventEmitter = new EventEmitter();

    logger.info(LOG_MODULE.SSH, 'ssh.jump.starting', 'SSH jump host connection starting', {
      module: LOG_MODULE.SSH,
      jump_host: jumpConfig.host,
      jump_port: jumpConfig.port,
      target_host: config.host,
      target_port: config.port,
    });

    return new Promise((resolve, reject) => {
      const jumpClient = new Client();

      // 捕获跳板机 SSH Banner（shell passthrough 模式下使用）
      let jumpBanner: string | undefined;
      jumpClient.on('banner', (message: string) => {
        jumpBanner = message;
        logger.debug(LOG_MODULE.SSH, 'ssh.jump.banner.received', 'Jump host SSH banner received', {
          connection_id: connectionId,
          banner_length: message.length,
        });
      });

      jumpClient.on('ready', () => {
        logger.info(LOG_MODULE.SSH, 'ssh.jump.connected', 'Jump host connected, forwarding to target', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          jump_host: jumpConfig.host,
          target_host: config.host,
          target_port: config.port,
        });

        // 构建目标主机连接配置（复用于 forwardOut 和 exec proxy 两条路径）
        const buildTargetConnectConfig = (stream: ClientChannel): any => {
          const cfg: any = {
            sock: stream,
            username: config.username,
            readyTimeout: 10000,
            keepaliveInterval: resolvedTarget.keepaliveInterval ?? 10000,
            tryKeyboard: true,
          };
          if (resolvedTarget.agentForward) {
            cfg.agentForward = true;
            cfg.agent = resolvedTarget.agent;
          }
          if (config.password) {
            cfg.password = config.password;
          }
          if (config.privateKey) {
            cfg.privateKey = config.privateKey;
          } else if (resolvedTarget.privateKey) {
            cfg.privateKey = resolvedTarget.privateKey;
          }
          return cfg;
        };

        // 通过 stream 连接目标主机 SSH
        // onFail: 若提供，则握手失败时调用 onFail 而非 reject（用于 fallback）
        const connectTargetViaStream = (
          stream: ClientChannel,
          opts?: { getStderr?: () => string; onFail?: (err: Error) => void },
        ) => {
          const targetClient = new Client();
          const getStderr = opts?.getStderr;
          const onFail = opts?.onFail;

          // 捕获目标主机 SSH Banner
          let targetBanner: string | undefined;
          targetClient.on('banner', (message: string) => {
            targetBanner = message;
            logger.debug(LOG_MODULE.SSH, 'ssh.jump.banner.received', 'Target SSH banner received via jump', {
              connection_id: connectionId,
              banner_length: message.length,
            });
          });

          targetClient.on('ready', () => {
            logger.info(LOG_MODULE.SSH, 'ssh.jump.target_connected', 'Target host connected via jump host', {
              module: LOG_MODULE.SSH,
              connection_id: connectionId,
              target_host: config.host,
              target_port: config.port,
            });

            this.connections.set(connectionId, {
              id: connectionId,
              client: targetClient,
              connected: true,
              extraShells: new Map(),
              eventEmitter,
              currentDirectory: '',
              encoding: 'UTF-8',
              jumpClient,
              banner: targetBanner,
            });

            this.configs.set(connectionId, config);

            const conn = this.connections.get(connectionId);
            if (conn) {
              conn.osInfoPromise = this.detectOSInfo(connectionId).catch((detectErr) => {
                logger.debug(LOG_MODULE.SSH, 'ssh.os_detect.failed', 'OS detection failed (non-blocking)', {
                  connection_id: connectionId,
                  error_msg: detectErr instanceof Error ? detectErr.message : String(detectErr),
                });
              });
            }

            resolve(connectionId);
          });

          targetClient.on('error', (err) => {
            const stderr = getStderr ? getStderr() : '';
            logger.error(LOG_MODULE.SSH, 'ssh.jump.target_error', 'Target host connection error via jump', {
              module: LOG_MODULE.SSH,
              connection_id: connectionId,
              error: 1001,
              msg: err.message,
              proxy_stderr: stderr || '(none)',
              has_fallback: !!onFail,
            });

            if (onFail) {
              // 有 fallback，不 reject，让调用方尝试其他方式
              targetClient.removeAllListeners();
              onFail(err);
            } else {
              jumpClient.end();
              const stderrHint = stderr ? ` [proxy stderr: ${stderr.trim()}]` : '';
              reject(new Error(`SSH connection to target via jump host failed: ${err.message}${stderrHint}`));
            }
          });

          targetClient.on('close', () => {
            logger.info(LOG_MODULE.SSH, 'ssh.jump.target_closed', 'Target connection closed', {
              module: LOG_MODULE.SSH,
              connection_id: connectionId,
            });
            const connection = this.connections.get(connectionId);
            if (connection) {
              connection.connected = false;
              connection.eventEmitter.emit('close');
            }
          });

          targetClient.connect(buildTargetConnectConfig(stream));
        };

        // === Fallback 3: Shell passthrough ===
        // 堡垒机可能禁用 forwardOut 和 exec 通道的 TCP 隧道
        // 最终方案：用跳板机 shell 直接 ssh 到目标，和用户在 Mac 终端手动操作一样
        const tryShellPassthrough = (prevErrors: string) => {
          logger.warn(LOG_MODULE.SSH, 'ssh.jump.shell_passthrough',
            'All tunnel methods failed, using shell passthrough mode', {
              connection_id: connectionId,
              previous_errors: prevErrors,
              target_host: config.host,
            });

          // 用 jumpClient 作为连接的 client（不创建 targetClient）
          // shell 创建后自动执行 ssh target_host
          this.connections.set(connectionId, {
            id: connectionId,
            client: jumpClient,
            connected: true,
            extraShells: new Map(),
            eventEmitter,
            currentDirectory: '',
            encoding: 'UTF-8',
            banner: jumpBanner,
            shellPassthroughCmd: `ssh -tt -o StrictHostKeyChecking=no ${config.host}\n`,
          });

          this.configs.set(connectionId, config);

          logger.info(LOG_MODULE.SSH, 'ssh.jump.shell_passthrough_ready',
            'Shell passthrough connection ready', {
              connection_id: connectionId,
              target_host: config.host,
            });

          resolve(connectionId);
        };

        // === Fallback 2: exec proxy (nc/ncat/socat) ===
        const tryExecProxy = (forwardOutErrMsg?: string) => {
          const h = config.host;
          const p = config.port;
          const proxyCmd = [
            `if command -v nc >/dev/null 2>&1; then exec nc ${h} ${p};`,
            `elif command -v ncat >/dev/null 2>&1; then exec ncat ${h} ${p};`,
            `elif command -v socat >/dev/null 2>&1; then exec socat - TCP:${h}:${p};`,
            `else echo "NO_PROXY_TOOL" >&2; exit 1;`,
            `fi`,
          ].join(' ');

          jumpClient.exec(proxyCmd, (execErr, execStream) => {
            if (execErr) {
              logger.warn(LOG_MODULE.SSH, 'ssh.jump.exec_proxy_failed',
                'exec proxy fallback failed, trying shell passthrough', {
                  connection_id: connectionId,
                  msg: execErr.message,
                });
              const errors = `forwardOut: ${forwardOutErrMsg || 'N/A'}, exec: ${execErr.message}`;
              tryShellPassthrough(errors);
              return;
            }

            // 监听 stderr 以捕获代理命令的错误信息
            let stderrOutput = '';
            execStream.stderr.on('data', (data: Buffer) => {
              stderrOutput += data.toString();
              logger.debug(LOG_MODULE.SSH, 'ssh.jump.proxy_stderr', 'Proxy stderr output', {
                connection_id: connectionId,
                stderr: data.toString().trim(),
              });
            });

            execStream.on('exit', (code: number | null, signal: string | null) => {
              if (code !== null && code !== 0) {
                logger.error(LOG_MODULE.SSH, 'ssh.jump.proxy_exit', 'Proxy command exited with error', {
                  connection_id: connectionId,
                  exit_code: code,
                  signal: signal,
                  stderr: stderrOutput.trim() || '(none)',
                });
              }
            });

            logger.info(LOG_MODULE.SSH, 'ssh.jump.proxy_started', 'Proxy command started, connecting to target', {
              connection_id: connectionId,
            });

            // exec proxy 的 SSH 握手如果也失败，fallback 到 shell passthrough
            connectTargetViaStream(execStream, {
              getStderr: () => stderrOutput,
              onFail: (targetErr) => {
                logger.warn(LOG_MODULE.SSH, 'ssh.jump.exec_proxy_handshake_failed',
                  'exec proxy stream ok but SSH handshake failed, trying shell passthrough', {
                    connection_id: connectionId,
                    error_msg: targetErr.message,
                    proxy_stderr: stderrOutput.trim() || '(none)',
                  });
                const errors = `forwardOut: ${forwardOutErrMsg || 'N/A'}, exec proxy handshake: ${targetErr.message}`;
                tryShellPassthrough(errors);
              },
            });
          });
        };

        // === Fallback 1: forwardOut (direct-tcpip) ===
        jumpClient.forwardOut('127.0.0.1', 0, config.host, config.port, (err, stream) => {
          if (!err) {
            logger.info(LOG_MODULE.SSH, 'ssh.jump.forward_ok', 'forwardOut succeeded, attempting SSH handshake', {
              connection_id: connectionId,
            });
            connectTargetViaStream(stream, {
              onFail: (targetErr) => {
                logger.warn(LOG_MODULE.SSH, 'ssh.jump.forward_handshake_failed',
                  'forwardOut handshake failed, falling back to exec proxy', {
                    connection_id: connectionId,
                    error_msg: targetErr.message,
                  });
                tryExecProxy(targetErr.message);
              },
            });
            return;
          }

          logger.warn(LOG_MODULE.SSH, 'ssh.jump.forward_failed', 'forwardOut failed, falling back to exec proxy', {
            connection_id: connectionId,
            error_msg: err.message,
          });
          tryExecProxy(err.message);
        });
      });

      jumpClient.on('error', (err) => {
        logger.error(LOG_MODULE.SSH, 'ssh.jump.error', 'Jump host connection error', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          error: 1001,
          msg: err.message,
          jump_host: jumpConfig.host,
        });
        reject(new Error(`Jump host connection failed: ${err.message}`));
      });

      jumpClient.on('close', () => {
        logger.info(LOG_MODULE.SSH, 'ssh.jump.closed', 'Jump host connection closed', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
        });
        // 跳板机断开时，目标连接也断开
        const connection = this.connections.get(connectionId);
        if (connection && connection.connected) {
          // passthrough 模式下 connection.client === jumpClient，无需再 end
          if (connection.client !== jumpClient) {
            connection.client.end();
          }
          connection.connected = false;
          connection.eventEmitter.emit('close');
        }
      });

      // 跳板机连接配置
      const jumpConnectConfig: any = {
        host: jumpConfig.host,
        port: jumpConfig.port,
        username: jumpConfig.username,
        readyTimeout: 10000,
        keepaliveInterval: resolvedJump.keepaliveInterval ?? 10000,
        tryKeyboard: true,
      };

      // SSH config 中的 agent forwarding（跳板机场景下通常需要）
      if (resolvedJump.agentForward) {
        jumpConnectConfig.agentForward = true;
        jumpConnectConfig.agent = resolvedJump.agent;
      }

      // 认证：UI 配置优先 > SSH config IdentityFile
      if (jumpConfig.password) {
        jumpConnectConfig.password = jumpConfig.password;
      }
      if (jumpConfig.privateKey) {
        jumpConnectConfig.privateKey = jumpConfig.privateKey;
      } else if (resolvedJump.privateKey) {
        jumpConnectConfig.privateKey = resolvedJump.privateKey;
      }

      jumpClient.connect(jumpConnectConfig);
    });
  }

  // 直连模式（原有逻辑）
  private connectDirect(config: SSHConfig, resolved: ResolvedSSHOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const connectionId = `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const client = new Client();
      const eventEmitter = new EventEmitter();

      // 记录连接开始
      logger.info(LOG_MODULE.SSH, 'ssh.connection.starting', 'SSH connection starting', {
        module: LOG_MODULE.SSH,
        host: config.host,
        port: config.port,
        port_type: typeof config.port,
        username: config.username,
      });

      // 捕获 SSH Banner（sshd_config Banner 指令，认证前发送）
      let sshBanner: string | undefined;
      client.on('banner', (message: string) => {
        sshBanner = message;
        logger.debug(LOG_MODULE.SSH, 'ssh.banner.received', 'SSH banner received', {
          connection_id: connectionId,
          banner_length: message.length,
        });
      });

      client.on('ready', () => {
        logger.info(LOG_MODULE.SSH, 'ssh.connection.established', 'SSH connection established', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          host: config.host,
          port: config.port,
        });

        this.connections.set(connectionId, {
          id: connectionId,
          client,
          connected: true,
          extraShells: new Map(),
          eventEmitter,
          currentDirectory: '', // 初始为空，稍后获取 home 目录
          encoding: 'UTF-8', // 默认编码
          banner: sshBanner,
        });

        this.configs.set(connectionId, config);

        // 异步检测远程 OS 信息（非阻塞，失败静默）
        // 存储 promise，使 getOSInfo 可以等待检测完成
        const conn = this.connections.get(connectionId);
        if (conn) {
          conn.osInfoPromise = this.detectOSInfo(connectionId).catch((err) => {
            logger.debug(LOG_MODULE.SSH, 'ssh.os_detect.failed', 'OS detection failed (non-blocking)', {
              connection_id: connectionId,
              error_msg: err instanceof Error ? err.message : String(err),
            });
          });
        }

        resolve(connectionId);
      });

      client.on('error', (err) => {
        logger.error(LOG_MODULE.SSH, 'ssh.connection.error', 'SSH connection error', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          error: 1001,
          msg: err.message,
          host: config.host,
          port: config.port,
          port_parsed: Number(config.port),
        });
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      client.on('close', () => {
        logger.info(LOG_MODULE.SSH, 'ssh.connection.closed', 'SSH connection closed', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          host: config.host,
        });
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.connected = false;
          connection.eventEmitter.emit('close');
        }
      });

      // 连接配置
      const connectConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: resolved.keepaliveInterval ?? 10000,
        // 启用多种认证方式
        tryKeyboard: true,
      };

      // SSH config 中的 agent forwarding
      if (resolved.agentForward) {
        connectConfig.agentForward = true;
        connectConfig.agent = resolved.agent;
      }

      // 认证方式 - UI 配置优先 > SSH config IdentityFile
      if (config.password) {
        connectConfig.password = config.password;
      }
      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
      } else if (resolved.privateKey) {
        connectConfig.privateKey = resolved.privateKey;
      }

      // 代理配置支持（此时 config.proxy 已经被测试过是否可用）
      if (config.proxy) {
        const proxyConfig = config.proxy;

        logger.info(LOG_MODULE.SSH, 'ssh.proxy.connecting', 'Connecting via proxy', {
            module: LOG_MODULE.SSH,
            connection_id: connectionId,
            proxy_type: proxyConfig.type,
            proxy_host: proxyConfig.host,
            proxy_port: proxyConfig.port,
          });

          // ssh2 支持 SOCKS5 和 HTTP 代理
          // SOCKS5: type 5, HTTP: type 0
          const proxyType = proxyConfig.type === 'SOCKS5' ? 5 : 0;

          connectConfig.proxy = {
            host: proxyConfig.host,
            port: proxyConfig.port,
            type: proxyType,
          };

          // 如果有代理认证信息
          if (proxyConfig.username) {
            (connectConfig.proxy as any).username = proxyConfig.username;
          }
          if (proxyConfig.password) {
            (connectConfig.proxy as any).password = proxyConfig.password;
          }

          logger.debug(LOG_MODULE.SSH, 'ssh.proxy.config', 'Proxy config applied', {
            module: LOG_MODULE.SSH,
            connection_id: connectionId,
            proxy_type: proxyConfig.type,
          });
        }

      client.connect(connectConfig);
    });
  }

  // 检测远程服务器操作系统信息
  private async detectOSInfo(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      return;
    }

    return new Promise((resolve) => {
      const cmd = 'uname -s && uname -r && (cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true) && echo "===SHELL===$SHELL"';

      const timeout = setTimeout(() => {
        logger.debug(LOG_MODULE.SSH, 'ssh.os_detect.timeout', 'OS detection timed out', {
          connection_id: connectionId,
        });
        resolve();
      }, 5000);

      connection.client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });
        stream.stderr.on('data', () => {
          // 忽略 stderr
        });
        stream.on('close', () => {
          clearTimeout(timeout);

          try {
            const lines = output.trim().split('\n');
            const unameSys = lines[0]?.trim() || '';
            const unameRel = lines[1]?.trim() || '';

            let osType = 'linux';
            let osVersion = '';
            let shell = 'bash';

            // 解析 shell
            const shellLine = lines.find(l => l.startsWith('===SHELL==='));
            if (shellLine) {
              const shellPath = shellLine.replace('===SHELL===', '').trim();
              shell = shellPath.split('/').pop() || 'bash';
            }

            if (unameSys === 'Darwin') {
              osType = 'macos';
              // 从 sw_vers 解析版本
              const versionLine = lines.find(l => /ProductVersion/i.test(l));
              if (versionLine) {
                const match = versionLine.match(/:\s*(.+)/);
                osVersion = match ? match[1].trim() : '';
              }
            } else if (unameSys === 'Linux') {
              // 从 /etc/os-release 解析 ID 和 VERSION_ID
              const idLine = lines.find(l => /^ID=/i.test(l));
              const versionLine = lines.find(l => /^VERSION_ID=/i.test(l));

              const distroId = idLine ? idLine.replace(/^ID=/i, '').replace(/"/g, '').trim() : '';
              osVersion = versionLine ? versionLine.replace(/^VERSION_ID=/i, '').replace(/"/g, '').trim() : '';

              if (distroId) {
                osType = `linux/${distroId}`;
              }
            }

            const osInfo: OSInfo = {
              osType,
              osVersion,
              kernel: `${unameSys} ${unameRel}`,
              shell,
            };

            connection.osInfo = osInfo;

            logger.info(LOG_MODULE.SSH, 'ssh.os_detect.success', 'Remote OS detected', {
              connection_id: connectionId,
              os_type: osInfo.osType,
              os_version: osInfo.osVersion,
              kernel: osInfo.kernel,
              shell: osInfo.shell,
            });
          } catch (parseErr) {
            logger.debug(LOG_MODULE.SSH, 'ssh.os_detect.parse_error', 'Failed to parse OS info', {
              connection_id: connectionId,
              error_msg: parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
          }

          resolve();
        });
      });
    });
  }

  // 获取远程服务器操作系统信息（等待检测完成）
  async getOSInfo(connectionId: string): Promise<OSInfo | undefined> {
    const connection = this.connections.get(connectionId);
    if (!connection) return undefined;

    // 如果检测还在进行中，等待完成
    if (connection.osInfoPromise) {
      await connection.osInfoPromise;
    }

    return connection.osInfo;
  }

  // 执行单个命令
  async executeCommand(connectionId: string, command: string, options?: { useLoginShell?: boolean }): Promise<{ output: string; exitCode: number }> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // 使用信号量限制并发
    await this.acquireOperationSlot(connectionId);

    // 屏蔽系统监控命令的日志
    const isMonitoringCommand = command.includes('===CPU_MEM_START===') ||
                                 command.includes('top -bn1') ||
                                 command.includes('===UPTIME_START===') ||
                                 command.includes('===PROCESSES_START===') ||
                                 command.includes('===DISKS_START===');

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      if (!isMonitoringCommand) {
        logger.debug(LOG_MODULE.SSH, 'ssh.command.executing', 'SSH command executing', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          command: command.substring(0, 100),
          cwd: connection.currentDirectory || '(not set)',
          use_login_shell: options?.useLoginShell ?? false,
        });
      }

      // 获取当前工作目录
      const cwd = connection.currentDirectory || '';

      // 构建完整命令
      let fullCommand = command;

      // 如果有当前目录，先 cd 到该目录
      if (cwd) {
        fullCommand = `cd "${cwd}" && ${fullCommand}`;
      }

      // 决定是否使用交互式登录 shell
      const useLoginShell = options?.useLoginShell ?? false;

      let finalCommand: string;
      if (useLoginShell) {
        const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        finalCommand = `bash -l -i -c "${escapedCommand}"`;
      } else {
        finalCommand = fullCommand;
      }

      connection.client.exec(finalCommand, (err, stream) => {
        if (err) {
          this.releaseOperationSlot(connectionId);
          logger.error(LOG_MODULE.SSH, 'ssh.command.error', 'Command execution error', {
            module: LOG_MODULE.SSH,
            connection_id: connectionId,
            error: 1005,
            msg: err.message,
            command: command.substring(0, 100),
          });
          reject(new Error(`Command execution failed: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString('utf8').replace(/\x07/g, '');
          stdout += chunk;
        });

        stream.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString('utf8').replace(/\x07/g, '');
          stderr += chunk;
        });

        stream.on('close', (code: number) => {
          this.releaseOperationSlot(connectionId);
          const latencyMs = Date.now() - startTime;

          if (!isMonitoringCommand) {
            logger.info(LOG_MODULE.SSH, 'ssh.command.completed', 'SSH command completed', {
              module: LOG_MODULE.SSH,
              connection_id: connectionId,
              exit_code: code || 0,
              output_length: stdout.length,
              stderr_length: stderr.length,
              latency_ms: latencyMs,
            });
          }

          // 过滤掉交互式 shell 的提示信息和欢迎消息
          let cleanedOutput = stdout;

          if (useLoginShell) {
            const promptPatterns = [
              /^[\s\S]*?[\$#]\s*/,
              /^bash: cannot set terminal process group.*?\n/gm,
              /^bash: no job control in this shell\n/gm,
            ];

            if (cleanedOutput.match(/^[\s\S]{0,200}[\$#]\s+/)) {
              for (const pattern of promptPatterns) {
                cleanedOutput = cleanedOutput.replace(pattern, '');
              }
            }
          }

          resolve({
            output: cleanedOutput + (stderr ? '\n' + stderr : ''),
            exitCode: code || 0
          });
        });

        stream.on('error', (err: Error) => {
          this.releaseOperationSlot(connectionId);
          logger.error(LOG_MODULE.SSH, 'ssh.command.stream_error', 'Stream error', {
            module: LOG_MODULE.SSH,
            connection_id: connectionId,
            error: 1005,
            msg: err.message,
          });
          reject(new Error(`Stream error: ${err.message}`));
        });
      });
    });
  }

  // 创建交互式shell会话
  // shellId 可选：如果传入与 connectionId 不同的 shellId（如 'ssh-xxx__ai_shell'），
  // 则创建一个额外的独立 shell 通道，不影响终端主 shell
  async createShell(connectionId: string, webContents: any, encoding?: string): Promise<string> {
    // 支持派生 shellId（如 'ssh-xxx__ai_shell'），从中提取 baseConnectionId
    const isExtraShell = connectionId.includes('__ai_shell');
    const baseConnectionId = isExtraShell ? connectionId.replace('__ai_shell', '') : connectionId;
    const shellId = connectionId; // 用于标识此 shell 的 ID

    const connection = this.connections.get(baseConnectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // 更新编码设置
    if (encoding) {
      connection.encoding = encoding;
    }

    if (isExtraShell) {
      // 额外 shell（AI 运维独立 shell）
      if (connection.extraShells.has(shellId)) {
        logger.info(LOG_MODULE.SSH, 'ssh.shell.extra_exists', 'Extra shell already exists', {
          module: LOG_MODULE.SSH,
          connection_id: baseConnectionId,
          shell_id: shellId,
        });
        return shellId;
      }
    } else {
      // 默认终端 shell - 如果已经有 shell，返回现有的
      if (connection.shell) {
        logger.info(LOG_MODULE.SSH, 'ssh.shell.exists', 'Shell already exists', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
        });
        return connectionId;
      }

      // 1. 发送 SSH Banner（sshd_config Banner 指令，认证阶段收到）
      if (connection.banner && webContents && !webContents.isDestroyed()) {
        // Banner 需要 \n → \r\n 转换供终端正确显示
        const bannerForTerminal = connection.banner.replace(/\r?\n/g, '\r\n');
        webContents.send('ssh-shell-data', connectionId, bannerForTerminal);
        logger.debug(LOG_MODULE.SSH, 'ssh.banner.sent', 'SSH banner sent to terminal', {
          connection_id: connectionId,
          banner_length: connection.banner.length,
        });
      }

      // 2. 获取 MOTD（/run/motd.dynamic、/etc/motd 等文件内容）
      // shell passthrough 模式下跳过（堡垒机可能不支持 exec，MOTD 会在 shell 输出中自然显示）
      if (!connection.shellPassthroughCmd) {
        let motdContent = '';
        try {
          motdContent = await this.fetchMotd(baseConnectionId);
        } catch (e) {
          // MOTD 获取失败不影响 shell 创建
        }

        // 如果获取到了 MOTD，发送到前端
        if (motdContent && webContents && !webContents.isDestroyed()) {
          webContents.send('ssh-shell-data', connectionId, motdContent);
        }
      }
    }

    return new Promise((resolve, reject) => {
      logger.info(LOG_MODULE.SSH, 'ssh.shell.creating', 'Creating interactive shell', {
        module: LOG_MODULE.SSH,
        connection_id: baseConnectionId,
        shell_id: shellId,
        is_extra: isExtraShell,
      });

      // 构建 locale 环境变量，确保远程 shell 使用 UTF-8 编码
      // Mac 终端 SSH 会自动发送 LANG，ssh2 默认不发送
      const env: Record<string, string> = {};
      const lang = process.env.LANG || process.env.LC_ALL;
      if (lang) {
        env.LANG = lang;
      } else {
        // 本地也没设置时，使用合理默认值
        env.LANG = 'en_US.UTF-8';
      }

      connection.client.shell({
        term: 'xterm-256color',
        cols: 80,
        rows: 24,
      }, { env }, (err, stream) => {
        if (err) {
          logger.error(LOG_MODULE.SSH, 'ssh.shell.error', 'Shell creation error', {
            module: LOG_MODULE.SSH,
            connection_id: baseConnectionId,
            shell_id: shellId,
            error: 1005,
            msg: err.message,
          });
          reject(new Error(`Shell creation failed: ${err.message}`));
          return;
        }

        logger.info(LOG_MODULE.SSH, 'ssh.shell.created', 'Interactive shell created', {
          module: LOG_MODULE.SSH,
          connection_id: baseConnectionId,
          shell_id: shellId,
          is_extra: isExtraShell,
        });

        if (isExtraShell) {
          connection.extraShells.set(shellId, stream);
        } else {
          connection.shell = stream;
        }

        // [DEBUG] 数据包计数器
        let dataPacketCount = 0;

        // 使用 StringDecoder 处理 UTF-8 流式解码，
        // 防止多字节字符（如 box-drawing ─│┌ 等）被 TCP 分包截断导致乱码。
        // StringDecoder 会缓冲不完整的多字节序列，在下次 write() 时拼接完整再输出。
        /*
        ssh-service.ts:1059 中 data.toString('utf8') 处理 SSH 流式数据时，多字节 UTF-8 字符（如 box-drawing ─│┌ = 3 bytes 每个）可能被 TCP 分包截断。Buffer.toString('utf8')
  对不完整的多字节序列会替换为 \uFFFD（replacement character），显示为 ???。
  修复
  - 引入 Node.js StringDecoder，它会缓冲不完整的多字节序列，等下一个数据包到来时拼接完整再输出
  - 为 stdout 和 stderr 各创建独立的 StringDecoder 实例
  - XTermTerminal.tsx 的过滤逻辑已还原到原始状态*/
        const utf8Decoder = new StringDecoder('utf8');
        const stderrUtf8Decoder = new StringDecoder('utf8');

        // 异步获取 home 目录，用于 OSC 标题中 ~ 路径的展开
        let shellHomeDir = '';
        if (!isExtraShell) {
          this.getHomeDirectory(baseConnectionId).then(home => {
            shellHomeDir = home;
            logger.debug(LOG_MODULE.SSH, 'ssh.shell.home_resolved', 'Home directory resolved for OSC tracking', {
              connection_id: baseConnectionId,
              home_dir: home,
            });
          }).catch(() => {});
        }

        // 监听 shell 输出 - 使用 shellId 作为标识符发送到前端
        stream.on('data', (data: Buffer) => {
          const output = connection.encoding && connection.encoding !== 'UTF-8'
            ? iconv.decode(data, connection.encoding)
            : utf8Decoder.write(data);
          dataPacketCount++;

          // 解析 OSC 终端标题序列，自动跟踪当前工作目录
          // 兼容 oh-my-zsh / bash / fish 等所有发送标题的 shell，不依赖提示符格式
          if (!isExtraShell) {
            // OSC 7: file://hostname/path — 最可靠（绝对路径）
            const osc7Match = output.match(/\x1b\]7;file:\/\/[^\/]*(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)/);
            if (osc7Match) {
              try {
                connection.currentDirectory = decodeURIComponent(osc7Match[1]);
              } catch {
                connection.currentDirectory = osc7Match[1];
              }
            } else {
              // OSC 2: user@host: path — oh-my-zsh 默认窗口标题（格式 "%n@%m: %~"，冒号后有空格）
              const osc2Match = output.match(/\x1b\]2;[^@\x07\x1b]+@[^:\x07\x1b]+:\s*(~[^\x07\x1b]*|\/[^\x07\x1b]*)(?:\x07|\x1b\\)/);
              if (osc2Match) {
                let oscPath = osc2Match[1].trim();
                if (oscPath.startsWith('~') && shellHomeDir) {
                  oscPath = oscPath === '~' ? shellHomeDir : shellHomeDir + oscPath.slice(1);
                }
                if (oscPath.startsWith('/')) {
                  connection.currentDirectory = oscPath;
                }
              }
            }
          }

          if (!isExtraShell) {
            connection.eventEmitter.emit('data', output);
          }

          if (webContents && !webContents.isDestroyed()) {
            if (!isExtraShell) {
              // 终端主 shell：发送调试信息
              webContents.send('ssh-shell-debug', baseConnectionId, {
                packet_number: dataPacketCount,
                data_length: output.length,
                preview: output.substring(0, 300),
                has_motd_keywords: /welcome|last login|ubuntu|system/i.test(output),
              });
            }
            // 使用 shellId 发送数据，前端根据此 ID 过滤
            webContents.send('ssh-shell-data', shellId, output);
          }
        });

        stream.on('close', () => {
          logger.info(LOG_MODULE.SSH, 'ssh.shell.closed', 'Shell stream closed', {
            module: LOG_MODULE.SSH,
            connection_id: baseConnectionId,
            shell_id: shellId,
          });

          if (isExtraShell) {
            connection.extraShells.delete(shellId);
          } else {
            connection.shell = undefined;
            connection.eventEmitter.emit('shell-close');
          }

          if (webContents && !webContents.isDestroyed()) {
            webContents.send('ssh-shell-close', shellId);
          }
        });

        stream.stderr.on('data', (data: Buffer) => {
          const output = connection.encoding && connection.encoding !== 'UTF-8'
            ? iconv.decode(data, connection.encoding)
            : stderrUtf8Decoder.write(data);

          if (!isExtraShell) {
            connection.eventEmitter.emit('data', output);
          }

          if (webContents && !webContents.isDestroyed()) {
            webContents.send('ssh-shell-data', shellId, output);
          }
        });

        // Shell passthrough: 在跳板机 shell 中自动执行 ssh 到目标主机
        // 等待跳板机 shell 就绪后发送命令（短暂延迟让 prompt 出现）
        if (!isExtraShell && connection.shellPassthroughCmd) {
          const cmd = connection.shellPassthroughCmd;
          logger.info(LOG_MODULE.SSH, 'ssh.shell.passthrough', 'Sending passthrough command to jump host shell', {
            connection_id: baseConnectionId,
            command: cmd.trim(),
          });
          setTimeout(() => {
            stream.write(cmd);
          }, 500);
        }

        resolve(shellId);
      });
    });
  }

  // 获取 MOTD（Message of the Day）信息
  private async fetchMotd(connectionId: string): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      return '';
    }

    return new Promise((resolve) => {
      // 获取 MOTD 信息：动态 MOTD + 静态 MOTD
      // 注意：不获取 Last Login 信息，因为 shell 会话会自动发送
      //
      // 策略：优先读取 PAM 生成的 MOTD 缓存文件（/run/motd.dynamic），
      // 这是 sshd 登录时 pam_motd 展示给用户的内容，最为准确。
      // 如果缓存不存在，才 fallback 到手动运行 run-parts。
      const cmd =
        'if [ -f /run/motd.dynamic ] && [ -s /run/motd.dynamic ]; then ' +
          'cat /run/motd.dynamic 2>/dev/null; ' +
        'elif [ -d /etc/update-motd.d ]; then ' +
          'run-parts /etc/update-motd.d 2>/dev/null; ' +
        'fi; ' +
        'if [ -f /etc/motd ] && [ -s /etc/motd ]; then cat /etc/motd 2>/dev/null; fi';

      const timeout = setTimeout(() => {
        logger.debug(LOG_MODULE.SSH, 'ssh.motd.timeout', 'MOTD fetch timed out', {
          connection_id: connectionId,
        });
        resolve('');
      }, 5000);

      connection.client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          resolve('');
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });
        stream.stderr.on('data', () => {
          // 忽略 stderr
        });
        stream.on('close', () => {
          clearTimeout(timeout);
          if (output.trim()) {
            // 转换 \n 为 \r\n（终端需要 CR+LF）
            let result = output.replace(/\r?\n/g, '\r\n');
            // 确保以换行结尾
            if (!result.endsWith('\r\n')) {
              result += '\r\n';
            }
            resolve(result);
          } else {
            resolve('');
          }
        });
      });
    });
  }

  // 断开连接
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      logger.info(LOG_MODULE.SSH, 'ssh.disconnect.starting', 'Disconnecting SSH connection', {
        module: LOG_MODULE.SSH,
        connection_id: connectionId,
        host: this.configs.get(connectionId)?.host,
      });

      // 关闭 shell
      if (connection.shell) {
        connection.shell.end();
        connection.shell = undefined;
      }

      // 关闭所有额外 shell（AI 运维独立 shell 等）
      for (const [shellId, extraShell] of connection.extraShells) {
        extraShell.end();
        logger.debug(LOG_MODULE.SSH, 'ssh.shell.extra_closed', 'Extra shell closed on disconnect', {
          shell_id: shellId,
        });
      }
      connection.extraShells.clear();

      // 关闭 SSH 连接
      connection.client.end();
      connection.connected = false;

      // 关闭跳板机连接（如有）
      if (connection.jumpClient) {
        connection.jumpClient.end();
        logger.debug(LOG_MODULE.SSH, 'ssh.jump.client_closed', 'Jump host client closed on disconnect', {
          connection_id: connectionId,
        });
      }

      // 从连接池中移除
      this.connections.delete(connectionId);
      this.configs.delete(connectionId);

      logger.info(LOG_MODULE.SSH, 'ssh.disconnect.completed', 'SSH connection disconnected', {
        module: LOG_MODULE.SSH,
        connection_id: connectionId,
      });
    }
  }

  // 写入数据到shell
  // 支持派生 shellId（如 'ssh-xxx__ai_shell'）写入额外的独立 shell
  writeToShell(connectionId: string, data: string): boolean {
    const isExtraShell = connectionId.includes('__ai_shell');
    const baseConnectionId = isExtraShell ? connectionId.replace('__ai_shell', '') : connectionId;

    const connection = this.connections.get(baseConnectionId);
    if (!connection) return false;

    if (isExtraShell) {
      const extraShell = connection.extraShells.get(connectionId);
      if (extraShell) {
        extraShell.write(data);
        return true;
      }
      return false;
    }

    if (connection.shell) {
      connection.shell.write(data);
      return true;
    }
    return false;
  }

  // 调整shell终端大小
  resizeShell(connectionId: string, cols: number, rows: number): boolean {
    const connection = this.connections.get(connectionId);
    if (connection && connection.shell) {
      try {
        connection.shell.setWindow(rows, cols, 0, 0);
        return true;
      } catch (error) {
        logger.error(LOG_MODULE.SSH, 'ssh.shell.resize_error', 'Failed to resize shell', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
          error: 1,
          msg: (error as Error).message,
        });
        return false;
      }
    }
    return false;
  }

  // 检查连接状态
  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection ? connection.connected : false;
  }

  // 获取连接对象（供隧道服务使用）
  getConnection(connectionId: string): SSHConnection | undefined {
    return this.connections.get(connectionId);
  }

  // 获取连接的事件发射器
  getEventEmitter(connectionId: string): EventEmitter | null {
    const connection = this.connections.get(connectionId);
    return connection ? connection.eventEmitter : null;
  }

  // 列出目录内容
  async listDirectory(connectionId: string, path: string = '.'): Promise<string[]> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // 首先尝试使用 SFTP
    try {
      return await this.listDirectoryViaSFTP(connection, path);
    } catch (sftpError) {
      logger.warn(LOG_MODULE.SSH, 'sftp.readdir.fallback', 'SFTP failed, falling back to shell', {
        module: LOG_MODULE.SFTP,
        connection_id: connectionId,
        path,
        error_msg: (sftpError as Error).message,
      });
      // 回退到使用 shell 命令 ls
      return await this.listDirectoryViaShell(connection, path);
    }
  }

  // 通过 SFTP 列出目录
  private async listDirectoryViaSFTP(connection: SSHConnection, path: string): Promise<string[]> {
    await this.acquireOperationSlot(connection.id);

    return new Promise((resolve, reject) => {
      connection.client.sftp((err, sftp) => {
        if (err) {
          this.releaseOperationSlot(connection.id);
          logger.error(LOG_MODULE.SSH, 'sftp.session.error', 'SFTP session creation failed', {
            module: LOG_MODULE.SFTP,
            connection_id: connection.id,
            error: 2001,
            msg: err.message,
          });
          reject(new Error(`SFTP session creation failed: ${err.message}`));
          return;
        }

        sftp.readdir(path, (err, list) => {
          try {
            sftp.end();
          } catch (e) {
            // 忽略关闭错误
          }
          this.releaseOperationSlot(connection.id);

          if (err) {
            logger.error(LOG_MODULE.SSH, 'sftp.readdir.error', 'Failed to read directory via SFTP', {
              module: LOG_MODULE.SFTP,
              connection_id: connection.id,
              error: 2001,
              msg: err.message,
              path,
            });
            reject(new Error(`Failed to read directory: ${err.message}`));
            return;
          }

          const files = list.map(item => {
            return item.filename + (item.longname.endsWith('/') ? '/' : '');
          });

          logger.debug(LOG_MODULE.SSH, 'sftp.readdir.completed', 'SFTP readdir completed', {
            module: LOG_MODULE.SFTP,
            connection_id: connection.id,
            path,
            file_count: files.length,
          });

          resolve(files);
        });
      });
    });
  }

  // 通过 shell ls 命令列出目录
  private async listDirectoryViaShell(connection: SSHConnection, path: string): Promise<string[]> {
    await this.acquireOperationSlot(connection.id);

    return new Promise((resolve, reject) => {
      const cmd = `ls -1 "${path.replace(/\/+$/, '')}" 2>&1`;
      connection.client.exec(cmd, (err, stream) => {
        if (err) {
          this.releaseOperationSlot(connection.id);
          logger.error(LOG_MODULE.SSH, 'shell.ls.error', 'Failed to execute ls command', {
            module: LOG_MODULE.SSH,
            connection_id: connection.id,
            error: 1005,
            msg: err.message,
          });
          reject(new Error(`Failed to execute ls command: ${err.message}`));
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data: Buffer) => {
          output += data.toString('utf8').replace(/\x07/g, '');
        });

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString('utf8').replace(/\x07/g, '');
        });

        stream.on('close', (code: number) => {
          this.releaseOperationSlot(connection.id);
          if (code !== 0 && !output) {
            logger.error(LOG_MODULE.SSH, 'shell.ls.failed', 'ls command failed', {
              module: LOG_MODULE.SSH,
              connection_id: connection.id,
              error: code,
              msg: errorOutput,
              path,
            });
            reject(new Error(`ls command failed: ${errorOutput}`));
            return;
          }

          const files = output.split('\n')
            .filter(f => f.trim())
            .map(f => {
              const trimmed = f.trim();
              return trimmed.endsWith('/') ? trimmed.slice(0, -1) + '/' : trimmed;
            });

          resolve(files);
        });
      });
    });
  }

  // 获取当前工作目录
  async getCurrentDirectory(connectionId: string): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    if (!connection.currentDirectory) {
      try {
        const homeDir = await this.getHomeDirectory(connectionId);
        connection.currentDirectory = homeDir;
      } catch (error) {
        connection.currentDirectory = '/root';
      }
    }

    return connection.currentDirectory;
  }

  // 获取用户的 home 目录
  async getHomeDirectory(connectionId: string): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    return new Promise((resolve, reject) => {
      connection.client.exec('echo $HOME', (err, stream) => {
        if (err) {
          reject(new Error(`Failed to get home directory: ${err.message}`));
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });

        stream.on('close', () => {
          resolve(output.trim());
        });
      });
    });
  }

  // 更新当前工作目录
  updateCurrentDirectory(connectionId: string, newDirectory: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      logger.debug(LOG_MODULE.SSH, 'terminal.cwd.updated', 'Current directory updated', {
        module: LOG_MODULE.TERMINAL,
        connection_id: connectionId,
        old_cwd: connection.currentDirectory || '(not set)',
        new_cwd: newDirectory,
      });
      connection.currentDirectory = newDirectory;
    } else {
      logger.warn(LOG_MODULE.SSH, 'terminal.cwd.update_skipped', 'Connection not found for cwd update', {
        module: LOG_MODULE.TERMINAL,
        connection_id: connectionId,
      });
    }
  }

  // 获取 SFTP 客户端实例
  async getSFTPClient(connectionId: string): Promise<SFTPWrapper> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    await this.acquireOperationSlot(connectionId);

    return new Promise((resolve, reject) => {
      connection.client.sftp((err, sftp) => {
        if (err) {
          this.releaseOperationSlot(connectionId);
          logger.error(LOG_MODULE.SSH, 'sftp.session.error', 'SFTP session creation failed', {
            module: LOG_MODULE.SFTP,
            connection_id: connectionId,
            error: 2001,
            msg: err.message,
          });
          reject(new Error(`SFTP session creation failed: ${err.message}`));
          return;
        }

        sftp.on('close', () => {
          logger.info(LOG_MODULE.SSH, 'sftp.session.closed', 'SFTP session closed', {
            module: LOG_MODULE.SFTP,
            connection_id: connectionId,
          });
          this.releaseOperationSlot(connectionId);
        });

        sftp.on('error', (err: Error) => {
          logger.error(LOG_MODULE.SSH, 'sftp.error', 'SFTP error', {
            module: LOG_MODULE.SFTP,
            connection_id: connectionId,
            error: 2003,
            msg: err.message,
          });
          this.releaseOperationSlot(connectionId);
        });

        logger.info(LOG_MODULE.SSH, 'sftp.session.created', 'SFTP session created', {
          module: LOG_MODULE.SFTP,
          connection_id: connectionId,
        });

        resolve(sftp);
      });
    });
  }
}

export const sshService = new SSHService();
