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
  osVersion: string; // "22.04", "14.2" etc
  kernel: string;    // "Linux 5.15.0-91-generic"
  shell: string;     // "bash", "zsh", "sh"
}

export interface SSHConnection {
  id: string;
  client: Client;
  connected: boolean;
  shell?: ClientChannel;
  /** Extra named shell channels (e.g., AI ops independent shell) */
  extraShells: Map<string, ClientChannel>;
  eventEmitter: EventEmitter;
  currentDirectory: string; // Track current working directory
  encoding: string; // Terminal character encoding
  osInfo?: OSInfo; // Remote server OS information
  osInfoPromise?: Promise<void>; // OS detection in-progress promise
  jumpClient?: Client; // Jump host SSH client (if any)
  banner?: string; // SSH Banner (sshd_config Banner directive, sent before auth)
  shellPassthroughCmd?: string; // Shell passthrough: commands automatically executed in shell (e.g., ssh target_host)
  /** Target host info for passthrough mode (exec commands are routed via SSH through jump host) */
  passthroughTarget?: { host: string; port: number; username?: string };
}

export class SSHService {
  private connections: Map<string, SSHConnection> = new Map();
  private configs: Map<string, SSHConfig> = new Map();
  // Semaphore for limiting concurrent operations, preventing SSH channel exhaustion
  private activeOperations: Map<string, number> = new Map();
  private readonly MAX_CONCURRENT_OPERATIONS = 5;
  private operationQueue: Map<string, (() => void)[]> = new Map();

  // Test if proxy server is reachable
  private testProxyReachability(host: string, port: number): Promise<boolean> {
    logger.info(LOG_MODULE.SSH, 'ssh.proxy.testing', 'Testing proxy reachability', {
      module: LOG_MODULE.SSH,
      proxy_host: host,
      proxy_port: port,
    });

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 5000; // 5 second timeout

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

  // Semaphore: check if operation can be executed
  private async acquireOperationSlot(connectionId: string): Promise<void> {
    const current = this.activeOperations.get(connectionId) || 0;

    if (current < this.MAX_CONCURRENT_OPERATIONS) {
      this.activeOperations.set(connectionId, current + 1);
      return;
    }

    // If reached limit, wait
    return new Promise((resolve) => {
      const queue = this.operationQueue.get(connectionId) || [];
      queue.push(resolve);
      this.operationQueue.set(connectionId, queue);
    });
  }

  // Semaphore: release operation slot
  private releaseOperationSlot(connectionId: string): void {
    const current = this.activeOperations.get(connectionId) || 1;
    const newValue = Math.max(0, current - 1);
    this.activeOperations.set(connectionId, newValue);

    // Check if there are waiting operations
    const queue = this.operationQueue.get(connectionId);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        this.activeOperations.set(connectionId, current);
        next();
      }
    }
  }

  // Connect to SSH server
  async connect(config: SSHConfig): Promise<string> {
    // If proxy configured, test proxy connectivity first
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
        // Throw specific error for frontend handling
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

    // Parse matching config from ~/.ssh/config
    const resolvedTarget = sshConfigParser.resolve(config.host);
    const resolvedJump = config.jumpHost ? sshConfigParser.resolve(config.jumpHost.host) : undefined;

    // Jump host mode
    if (config.jumpHost) {
      return this.connectViaJumpHost(config, resolvedTarget, resolvedJump!);
    }

    return this.connectDirect(config, resolvedTarget);
  }

  // Connect via jump host
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

      // Capture jump host SSH Banner (used in shell passthrough mode)
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

        // Build target host connection config (shared for forwardOut and exec proxy paths)
        const buildTargetConnectConfig = (stream: ClientChannel): any => {
          const cfg: any = {
            sock: stream,
            username: config.username,
            readyTimeout: 10000,
            keepaliveInterval: resolvedTarget.keepaliveInterval ?? 10000,
            keepaliveCountMax: 3,
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

        // Connect to target host SSH via stream
        // onFail: if provided, call onFail on handshake failure instead of reject (for fallback)
        const connectTargetViaStream = (
          stream: ClientChannel,
          opts?: { getStderr?: () => string; onFail?: (err: Error) => void },
        ) => {
          const targetClient = new Client();
          const getStderr = opts?.getStderr;
          const onFail = opts?.onFail;

          // Capture target host SSH Banner
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
              // Has fallback, don't reject, let caller try other methods
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
        // Bastion host may disable TCP tunneling for forwardOut and exec channels
        // Final solution: directly ssh to target via jump host shell, same as user manually doing in Mac terminal
        const tryShellPassthrough = (prevErrors: string) => {
          logger.warn(LOG_MODULE.SSH, 'ssh.jump.shell_passthrough',
            'All tunnel methods failed, using shell passthrough mode', {
              connection_id: connectionId,
              previous_errors: prevErrors,
              target_host: config.host,
            });

          // Use jumpClient as the client (don't create targetClient)
          // After shell creation, automatically execute ssh target_host
          this.connections.set(connectionId, {
            id: connectionId,
            client: jumpClient,
            connected: true,
            extraShells: new Map(),
            eventEmitter,
            currentDirectory: '',
            encoding: 'UTF-8',
            banner: jumpBanner,
            shellPassthroughCmd: `ssh -tt -o StrictHostKeyChecking=no -p ${config.port}${config.username ? ` ${config.username}@${config.host}` : ` ${config.host}`}\n`,
            passthroughTarget: { host: config.host, port: config.port, username: config.username },
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

            // Listen on stderr to capture proxy command error messages
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

            // If SSH handshake also fails for exec proxy, fallback to shell passthrough
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
        // When jump host disconnects, target connection also disconnects
        const connection = this.connections.get(connectionId);
        if (connection && connection.connected) {
          // In passthrough mode, connection.client === jumpClient, no need to end again
          if (connection.client !== jumpClient) {
            connection.client.end();
          }
          connection.connected = false;
          connection.eventEmitter.emit('close');
        }
      });

      // Jump host connection config
      const jumpConnectConfig: any = {
        host: jumpConfig.host,
        port: jumpConfig.port,
        username: jumpConfig.username,
        readyTimeout: 10000,
        keepaliveInterval: resolvedJump.keepaliveInterval ?? 10000,
        keepaliveCountMax: 3,
        tryKeyboard: true,
      };

      // Agent forwarding in SSH config (usually needed for jump host scenario)
      if (resolvedJump.agentForward) {
        jumpConnectConfig.agentForward = true;
        jumpConnectConfig.agent = resolvedJump.agent;
      }

      // Auth: UI config priority > SSH config IdentityFile
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

  // Direct connection mode (original logic)
  private connectDirect(config: SSHConfig, resolved: ResolvedSSHOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const connectionId = `ssh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const client = new Client();
      const eventEmitter = new EventEmitter();

      // Record connection start
      logger.info(LOG_MODULE.SSH, 'ssh.connection.starting', 'SSH connection starting', {
        module: LOG_MODULE.SSH,
        host: config.host,
        port: config.port,
        port_type: typeof config.port,
        username: config.username,
      });

      // Capture SSH Banner (sshd_config Banner directive, sent before auth)
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
          currentDirectory: '', // Start empty, get home directory later
          encoding: 'UTF-8', // Default encoding
          banner: sshBanner,
        });

        this.configs.set(connectionId, config);

        // Asynchronously detect remote OS info (non-blocking, silent on failure)
        // Store promise so getOSInfo can wait for detection to complete
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

      // Connection config
      const connectConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: resolved.keepaliveInterval ?? 10000,
        keepaliveCountMax: 3,
        // Enable multiple auth methods
        tryKeyboard: true,
      };

      // Agent forwarding in SSH config
      if (resolved.agentForward) {
        connectConfig.agentForward = true;
        connectConfig.agent = resolved.agent;
      }

      // Auth methods - UI config priority > SSH config IdentityFile
      if (config.password) {
        connectConfig.password = config.password;
      }
      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
      } else if (resolved.privateKey) {
        connectConfig.privateKey = resolved.privateKey;
      }

      // Proxy config support (at this point config.proxy has been tested for availability)
      if (config.proxy) {
        const proxyConfig = config.proxy;

        logger.info(LOG_MODULE.SSH, 'ssh.proxy.connecting', 'Connecting via proxy', {
            module: LOG_MODULE.SSH,
            connection_id: connectionId,
            proxy_type: proxyConfig.type,
            proxy_host: proxyConfig.host,
            proxy_port: proxyConfig.port,
          });

          // ssh2 supports SOCKS5 and HTTP proxy
          // SOCKS5: type 5, HTTP: type 0
          const proxyType = proxyConfig.type === 'SOCKS5' ? 5 : 0;

          connectConfig.proxy = {
            host: proxyConfig.host,
            port: proxyConfig.port,
            type: proxyType,
          };

          // If proxy auth info exists
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

  // Detect remote server OS information
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
          // Ignore stderr
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

            // Parse shell
            const shellLine = lines.find(l => l.startsWith('===SHELL==='));
            if (shellLine) {
              const shellPath = shellLine.replace('===SHELL===', '').trim();
              shell = shellPath.split('/').pop() || 'bash';
            }

            if (unameSys === 'Darwin') {
              osType = 'macos';
              // Parse version from sw_vers
              const versionLine = lines.find(l => /ProductVersion/i.test(l));
              if (versionLine) {
                const match = versionLine.match(/:\s*(.+)/);
                osVersion = match ? match[1].trim() : '';
              }
            } else if (unameSys === 'Linux') {
              // Parse ID and VERSION_ID from /etc/os-release
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

  // Get remote server OS information (wait for detection to complete)
  async getOSInfo(connectionId: string): Promise<OSInfo | undefined> {
    const connection = this.connections.get(connectionId);
    if (!connection) return undefined;

    // If detection is still in progress, wait for completion
    if (connection.osInfoPromise) {
      await connection.osInfoPromise;
    }

    return connection.osInfo;
  }

  // Execute single command
  async executeCommand(connectionId: string, command: string, options?: { useLoginShell?: boolean }): Promise<{ output: string; exitCode: number }> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // Use semaphore to limit concurrency
    await this.acquireOperationSlot(connectionId);

    // Filter out system monitoring command logs
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

      // Get current working directory
      const cwd = connection.currentDirectory || '';

      // Build full command
      let fullCommand = command;

      // If current directory exists, cd to it first
      if (cwd) {
        fullCommand = `cd "${cwd}" && ${fullCommand}`;
      }

      // Decide whether to use interactive login shell
      const useLoginShell = options?.useLoginShell ?? false;

      let finalCommand: string;
      if (useLoginShell) {
        const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        finalCommand = `bash -l -i -c "${escapedCommand}"`;
      } else {
        finalCommand = fullCommand;
      }

      // Shell passthrough mode: wrap command via SSH to execute on target host
      // In this mode connection.client is the jump host, so exec() runs on jump host.
      // We route commands to the actual target by wrapping them in an SSH call.
      if (connection.passthroughTarget) {
        const t = connection.passthroughTarget;
        const target = t.username ? `${t.username}@${t.host}` : t.host;
        // Escape single quotes for safe wrapping: ' → '\''
        const escaped = finalCommand.replace(/'/g, "'\\''" );
        finalCommand = `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -p ${t.port} ${target} '${escaped}'`;
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

          // Filter out interactive shell prompt and welcome messages
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

  /**
   * Close an extra shell channel (e.g., AI ops independent shell, monitor shell).
   * Only closes extra shells, not the terminal main shell.
   */
  closeShell(shellId: string): boolean {
    const extraMatch = shellId.match(/^(.+?)(__ai_shell|__monitor)(.*)$/);
    const baseConnectionId = extraMatch ? extraMatch[1] : shellId;
    const connection = this.connections.get(baseConnectionId);
    if (!connection) return false;

    const stream = connection.extraShells.get(shellId);
    if (!stream) return false;

    stream.end();
    connection.extraShells.delete(shellId);
    logger.info(LOG_MODULE.SSH, 'ssh.shell.extra_closed', 'Extra shell closed by request', {
      connection_id: baseConnectionId,
      shell_id: shellId,
    });
    return true;
  }

  // Create interactive shell session
  // shellId is optional: if passed a different shellId than connectionId (e.g., 'ssh-xxx__ai_shell'),
  // creates an additional independent shell channel, without affecting terminal main shell
  async createShell(connectionId: string, webContents: any, encoding?: string): Promise<string> {
    // Support derived shellId (e.g., 'ssh-xxx__ai_shell', 'ssh-xxx__monitor'), extract baseConnectionId from it
    const extraShellMatch = connectionId.match(/^(.+?)(__ai_shell|__monitor)(.*)$/);
    const isExtraShell = !!extraShellMatch;
    const baseConnectionId = isExtraShell ? extraShellMatch![1] : connectionId;
    const shellId = connectionId; // ID used to identify this shell

    const connection = this.connections.get(baseConnectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // Update encoding settings
    if (encoding) {
      connection.encoding = encoding;
    }

    if (isExtraShell) {
      // Extra shell (AI ops independent shell)
      if (connection.extraShells.has(shellId)) {
        logger.info(LOG_MODULE.SSH, 'ssh.shell.extra_exists', 'Extra shell already exists', {
          module: LOG_MODULE.SSH,
          connection_id: baseConnectionId,
          shell_id: shellId,
        });
        return shellId;
      }
    } else {
      // Default terminal shell - if shell already exists, return existing one
      if (connection.shell) {
        logger.info(LOG_MODULE.SSH, 'ssh.shell.exists', 'Shell already exists', {
          module: LOG_MODULE.SSH,
          connection_id: connectionId,
        });
        return connectionId;
      }

      // 1. Send SSH Banner (sshd_config Banner directive, received during auth phase)
      if (connection.banner && webContents && !webContents.isDestroyed()) {
        // Banner needs \n → \r\n conversion for terminal to display correctly
        const bannerForTerminal = connection.banner.replace(/\r?\n/g, '\r\n');
        webContents.send('ssh-shell-data', connectionId, bannerForTerminal);
        logger.debug(LOG_MODULE.SSH, 'ssh.banner.sent', 'SSH banner sent to terminal', {
          connection_id: connectionId,
          banner_length: connection.banner.length,
        });
      }

      // 2. Get MOTD (content from /run/motd.dynamic, /etc/motd etc.)
      // Skip in shell passthrough mode (bastion may not support exec, MOTD naturally displays in shell output)
      if (!connection.shellPassthroughCmd) {
        let motdContent = '';
        try {
          motdContent = await this.fetchMotd(baseConnectionId);
        } catch (e) {
          // MOTD fetch failure doesn't affect shell creation
        }

        // If MOTD was fetched, send to frontend
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

      // Build locale environment variables to ensure remote shell uses UTF-8 encoding
      // Mac terminal SSH auto-sends LANG, ssh2 doesn't send by default
      const env: Record<string, string> = {};
      const lang = process.env.LANG || process.env.LC_ALL;
      if (lang) {
        env.LANG = lang;
      } else {
        // Use reasonable default if not set locally either
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

        // [DEBUG] Data packet counter
        let dataPacketCount = 0;

        // Use StringDecoder for UTF-8 streaming decode,
        // prevents multi-byte characters (like box-drawing chars ─│┌ etc.) from being split by TCP packets and causing garbled text.
        // StringDecoder buffers incomplete multi-byte sequences and concatenates them on next write() before output.
        /*
        In ssh-service.ts:1059, data.toString('utf8') processing of SSH streaming data: multi-byte UTF-8 characters (like box-drawing ─│┌ = 3 bytes each) may be split by TCP packets. Buffer.toString('utf8')
        replaces incomplete multi-byte sequences with \uFFFD (replacement character), displaying as ???.
        Fix
        - Introduce Node.js StringDecoder, which buffers incomplete multi-byte sequences, concatenating on next data packet arrival
        - Create independent StringDecoder instances for stdout and stderr
        - XTermTerminal.tsx's filter logic has been restored to original state*/
        const utf8Decoder = new StringDecoder('utf8');
        const stderrUtf8Decoder = new StringDecoder('utf8');

        // Async get home directory for ~ path expansion in OSC title
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

        // Listen for shell output - use shellId as identifier to send to frontend
        stream.on('data', (data: Buffer) => {
          const output = connection.encoding && connection.encoding !== 'UTF-8'
            ? iconv.decode(data, connection.encoding)
            : utf8Decoder.write(data);
          dataPacketCount++;

          // Parse OSC terminal title sequences, automatically track current working directory
          // Compatible with oh-my-zsh / bash / fish and other shells that send titles, doesn't depend on prompt format
          if (!isExtraShell) {
            // OSC 7: file://hostname/path — Most reliable (absolute path)
            const osc7Match = output.match(/\x1b\]7;file:\/\/[^\/]*(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)/);
            if (osc7Match) {
              try {
                connection.currentDirectory = decodeURIComponent(osc7Match[1]);
              } catch {
                connection.currentDirectory = osc7Match[1];
              }
            } else {
              // OSC 2: user@host: path — oh-my-zsh default window title (format "%n@%m: %~", colon followed by space)
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
            // Main terminal shell: send debug info
              webContents.send('ssh-shell-debug', baseConnectionId, {
                packet_number: dataPacketCount,
                data_length: output.length,
                preview: output.substring(0, 300),
                has_motd_keywords: /welcome|last login|ubuntu|system/i.test(output),
              });
            }
            // Use shellId to send data, frontend filters by this ID
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

        // Shell passthrough: automatically execute ssh to target host in jump host shell
        // Wait for jump host shell to be ready before sending command (brief delay for prompt to appear)
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

  // Get MOTD (Message of the Day) information
  private async fetchMotd(connectionId: string): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      return '';
    }

    return new Promise((resolve) => {
      // Get MOTD info: dynamic MOTD + static MOTD
      // Note: Don't get Last Login info, as shell session automatically sends it
      //
      // Strategy: Prefer to read MOTD cache file generated by PAM (/run/motd.dynamic),
      // This is what sshd shows users via pam_motd on login, most accurate.
      // If cache doesn't exist, fallback to manually running run-parts.
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
          // Ignore stderr
        });
        stream.on('close', () => {
          clearTimeout(timeout);
          if (output.trim()) {
            // Convert \n to \r\n (terminal needs CR+LF)
            let result = output.replace(/\r?\n/g, '\r\n');
            // Ensure ends with newline
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

  // Disconnect
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      logger.info(LOG_MODULE.SSH, 'ssh.disconnect.starting', 'Disconnecting SSH connection', {
        module: LOG_MODULE.SSH,
        connection_id: connectionId,
        host: this.configs.get(connectionId)?.host,
      });

      // Close shell
      if (connection.shell) {
        connection.shell.end();
        connection.shell = undefined;
      }

      // Close all extra shells (AI ops independent shell etc.)
      for (const [shellId, extraShell] of connection.extraShells) {
        extraShell.end();
        logger.debug(LOG_MODULE.SSH, 'ssh.shell.extra_closed', 'Extra shell closed on disconnect', {
          shell_id: shellId,
        });
      }
      connection.extraShells.clear();

      // Close SSH connection
      connection.client.end();
      connection.connected = false;

      // Close jump host connection (if any)
      if (connection.jumpClient) {
        connection.jumpClient.end();
        logger.debug(LOG_MODULE.SSH, 'ssh.jump.client_closed', 'Jump host client closed on disconnect', {
          connection_id: connectionId,
        });
      }

      // Remove from connection pool
      this.connections.delete(connectionId);
      this.configs.delete(connectionId);

      logger.info(LOG_MODULE.SSH, 'ssh.disconnect.completed', 'SSH connection disconnected', {
        module: LOG_MODULE.SSH,
        connection_id: connectionId,
      });
    }
  }

  // Write data to shell
  // Supports derived shellId (e.g., 'ssh-xxx__ai_shell', 'ssh-xxx__monitor') for writing to additional independent shell
  writeToShell(connectionId: string, data: string): boolean {
    const extraShellMatch = connectionId.match(/^(.+?)(__ai_shell|__monitor)(.*)$/);
    const isExtraShell = !!extraShellMatch;
    const baseConnectionId = isExtraShell ? extraShellMatch![1] : connectionId;

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

  // Resize shell terminal
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

  // Check connection status
  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return connection ? connection.connected : false;
  }

  // Get connection object (for tunnel service use)
  getConnection(connectionId: string): SSHConnection | undefined {
    return this.connections.get(connectionId);
  }

  // Get connection event emitter
  getEventEmitter(connectionId: string): EventEmitter | null {
    const connection = this.connections.get(connectionId);
    return connection ? connection.eventEmitter : null;
  }

  // List directory contents
  async listDirectory(connectionId: string, path: string = '.'): Promise<string[]> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    // First try SFTP
    try {
      return await this.listDirectoryViaSFTP(connection, path);
      } catch (sftpError) {
        logger.warn(LOG_MODULE.SSH, 'sftp.readdir.fallback', 'SFTP failed, falling back to shell', {
          module: LOG_MODULE.SFTP,
          connection_id: connectionId,
          path,
          error_msg: (sftpError as Error).message,
        });
        // Fallback to using shell command ls
      return await this.listDirectoryViaShell(connection, path);
    }
  }

  // List directory via SFTP
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
            // Ignore close errors
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

  // List directory via shell ls command
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

  // Get current working directory
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

  // Get user's home directory
  async getHomeDirectory(connectionId: string): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.connected) {
      throw new Error('SSH connection not found or not connected');
    }

    return new Promise((resolve, reject) => {
      // In passthrough mode, route to target host via SSH
      let homeCmd = 'echo $HOME';
      if (connection.passthroughTarget) {
        const t = connection.passthroughTarget;
        const target = t.username ? `${t.username}@${t.host}` : t.host;
        homeCmd = `ssh -o StrictHostKeyChecking=no -o BatchMode=yes -p ${t.port} ${target} 'echo \$HOME'`;
      }
      connection.client.exec(homeCmd, (err, stream) => {
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

  // Update current working directory
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

  // Get SFTP client instance
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
