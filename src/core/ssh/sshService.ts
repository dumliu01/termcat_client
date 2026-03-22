import { Host, TerminalLine, Proxy } from '@/utils/types';
import { apiService } from '@/base/http/api';
import { authService } from '@/core/auth/authService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { tunnelService } from '@/core/tunnel/tunnelService';

const log = logger.withFields({ module: LOG_MODULE.SSH });

export interface SSHSession {
  connectionId: string;
  host: Host;
  isConnected: boolean;
  lines: TerminalLine[];
}

class SSHService {
  private sessions: Map<string, SSHSession> = new Map();
  private currentSession: SSHSession | null = null;

  // 检查是否在Electron环境中
  private isElectron(): boolean {
    return !!(window && window.electron);
  }

  // 测试IPC连接
  async testIPC(): Promise<{ message: string; timestamp: number }> {
    if (!this.isElectron()) {
      return { message: 'Not in Electron environment', timestamp: Date.now() };
    }

    try {
      log.info('ssh.ipc.testing', 'Testing IPC connection');
      const result = await window.electron.sshConnectTest();
      log.debug('ssh.ipc.test_result', 'IPC test result', { result });
      return result;
    } catch (error) {
      log.error('ssh.ipc.test_failed', 'IPC test failed', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // 连接到SSH服务器
  async connect(host: Host): Promise<SSHSession> {
    try {
      // 在开发环境下使用mock数据
      if (import.meta.env.DEV && !this.isElectron()) {
        log.info('ssh.connection.mock', 'Using mock SSH connection for development', {
          host_id: host.id,
          host: host.hostname,
        });

        const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const session: SSHSession = {
          connectionId: sessionId,
          host,
          isConnected: true,
          lines: [
            {
              id: '1',
              content: `Connecting to ${host.username}@${host.hostname}:${host.port}...`,
              type: 'system',
              timestamp: Date.now()
            },
            {
              id: '2',
              content: `SSH connection established successfully!`,
              type: 'system',
              timestamp: Date.now() + 100
            },
            {
              id: '3',
              content: `Welcome to ${host.hostname} (${host.os})`,
              type: 'system',
              timestamp: Date.now() + 200
            },
            {
              id: '4',
              content: `${host.username}@${host.name}:~$ `,
              type: 'output',
              timestamp: Date.now() + 300
            }
          ]
        };

        this.sessions.set(sessionId, session);
        this.currentSession = session;

        return session;
      }

      // 使用Electron IPC进行SSH连接
      if (this.isElectron()) {
        log.info('ssh.connection.starting', 'Starting SSH connection', {
          host_id: host.id,
          host: host.hostname,
          port: host.port,
          username: host.username,
          auth_type: host.authType,
        });

        // 如果缺少本地凭据且已登录，尝试从服务器获取（受保护接口）
        // 游客模式无 token，跳过服务器请求
        try {
          if ((!host.password || host.password.length === 0) && (!host.sshKey || host.sshKey.length === 0) && host.id && authService.isAuthenticated()) {
            try {
              const creds = await apiService.getHostCredentials(host.id);
              if (creds) {
                if (creds.password) host.password = creds.password;
                if (creds.private_key) host.sshKey = creds.private_key;
                log.debug('ssh.credentials.fetched', 'Fetched credentials from server', {
                  host_id: host.id,
                  has_password: !!host.password,
                  has_private_key: !!host.sshKey,
                });
              }
            } catch (e) {
              log.warn('ssh.credentials.fetch_failed', 'Failed to fetch host credentials from server', {
                host_id: host.id,
                msg: e instanceof Error ? e.message : 'Unknown error',
              });
            }
          }
        } catch (e) {
          log.warn('ssh.credentials.fetch_error', 'Credential fetch error', {
            msg: e instanceof Error ? e.message : 'Unknown error',
          });
        }

        // 根据认证类型构建SSH配置
        const sshConfig: any = {
          host: host.connectionType === 'jump' ? host.targetHost : host.hostname,
          port: host.connectionType === 'jump' ? 22 : (Number(host.port) || 22),
          username: host.username
        };

        // 跳板机配置
        if (host.connectionType === 'jump' && host.targetHost) {
          sshConfig.jumpHost = {
            host: host.hostname,
            port: Number(host.port) || 22,
            username: host.username,
            // 认证凭据与目标主机共享
          };
          log.info('ssh.jump.configured', 'Jump host configuration detected', {
            host_id: host.id,
            jump_host: host.hostname,
            target_host: host.targetHost,
            target_port: sshConfig.port,
          });
        }

        // 如果主机配置了代理，添加代理配置
        if (host.proxy) {
          log.info('ssh.proxy.configured', 'Proxy configuration detected', {
            host_id: host.id,
            proxy_type: host.proxy.type,
            proxy_host: host.proxy.hostname,
            proxy_port: host.proxy.port,
          });
          sshConfig.proxy = {
            type: host.proxy.type,
            host: host.proxy.hostname,  // 注意：主进程期望的字段名是 host，不是 hostname
            port: host.proxy.port,
            username: host.proxy.username,
            password: host.proxy.password
          };
        } else if (host.proxyId) {
          log.debug('ssh.proxy.id_only', 'Host has proxyId but no proxy object', {
            host_id: host.id,
            proxy_id: host.proxyId,
          });
        }

        log.debug('ssh.config.built', 'SSH config built', {
          host: sshConfig.host,
          port: sshConfig.port,
          port_type: typeof sshConfig.port,
          username: sshConfig.username,
        });

        // 根据认证类型设置认证方式
        if (host.authType === 'password' && host.password) {
          log.debug('ssh.auth.using_password', 'Using password authentication');
          sshConfig.password = host.password;
        } else if (host.authType === 'ssh_key' && host.sshKey) {
          log.debug('ssh.auth.using_ssh_key', 'Using SSH key authentication');
          sshConfig.privateKey = host.sshKey;
        } else {
          log.warn('ssh.auth.mismatch', 'Auth type mismatch or missing credentials', {
            auth_type: host.authType,
            has_password: !!host.password,
            has_ssh_key: !!host.sshKey,
          });
          // 如果认证类型不匹配或没有认证信息，尝试提供所有可用的认证方式
          if (host.password) {
            log.debug('ssh.auth.fallback_password', 'Fallback: adding password');
            sshConfig.password = host.password;
          }
          if (host.sshKey) {
            log.debug('ssh.auth.fallback_ssh_key', 'Fallback: adding SSH key');
            sshConfig.privateKey = host.sshKey;
          }
        }

        // 跳板机使用相同的认证凭据
        if (sshConfig.jumpHost) {
          if (sshConfig.password) {
            sshConfig.jumpHost.password = sshConfig.password;
          }
          if (sshConfig.privateKey) {
            sshConfig.jumpHost.privateKey = sshConfig.privateKey;
          }
        }

        log.info('ssh.connection.connecting', 'Sending SSH config to main process', {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
        });

        const connectionId = await window.electron.sshConnect(sshConfig);

        const session: SSHSession = {
          connectionId,
          host,
          isConnected: true,
          // Do not include a synthetic prompt here — the interactive shell (created later)
          // will emit the real prompt. Including a synthetic prompt causes duplicate
          // prompts when the shell is created and sends its own prompt.
          lines: [
            {
              id: '1',
              content: `Connecting to ${host.username}@${host.hostname}:${host.port}...`,
              type: 'system',
              timestamp: Date.now()
            },
            {
              id: '2',
              content: `SSH connection established successfully!`,
              type: 'system',
              timestamp: Date.now() + 100
            },
            {
              id: '3',
              content: `Connected to ${host.hostname}`,
              type: 'system',
              timestamp: Date.now() + 200
            }
          ]
        };

        this.sessions.set(connectionId, session);
        this.currentSession = session;

        // 自动启动配置的隧道
        if (host.tunnels && host.tunnels.length > 0) {
          log.info('ssh.tunnels.starting', 'Starting configured tunnels', {
            connection_id: connectionId,
            tunnel_count: host.tunnels.length,
          });

          // 异步启动隧道，不阻塞连接
          tunnelService.startTunnels(connectionId, host.tunnels)
            .then((statuses) => {
              const running = statuses.filter(s => s.status === 'running').length;
              const failed = statuses.filter(s => s.status === 'error').length;
              log.info('ssh.tunnels.started', 'Tunnels startup completed', {
                connection_id: connectionId,
                running,
                failed,
                total: statuses.length,
              });
            })
            .catch((err) => {
              log.error('ssh.tunnels.start_failed', 'Failed to start tunnels', {
                connection_id: connectionId,
                error: 1,
                msg: err instanceof Error ? err.message : String(err),
              });
            });
        }

        return session;
      }

      throw new Error('SSH connection not supported in this environment');
    } catch (error) {
      log.error('ssh.connection.failed', 'SSH connection failed', {
        host_id: host.id,
        host: host.hostname,
        error: 1001,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to connect to ${host.hostname}: ${error}`);
    }
  }

  // 执行命令
  async executeCommand(command: string): Promise<TerminalLine[]> {
    if (!this.currentSession || !this.currentSession.isConnected) {
      throw new Error('No active SSH session');
    }

    try {
      // 添加输入行
      const inputLine: TerminalLine = {
        id: Math.random().toString(),
        content: `${this.currentSession.host.username}@${this.currentSession.host.name}:~$ ${command}`,
        type: 'input',
        timestamp: Date.now()
      };

      // 在开发环境下使用mock数据 (非Electron环境)
      if (import.meta.env.DEV && !this.isElectron()) {
        log.debug('ssh.command.mock', 'Mock executing command', {
          command: command.substring(0, 100),
        });

        // 模拟命令执行延迟
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

        // 模拟不同命令的输出
        let mockOutput = '';
        if (command === 'ls -la') {
          mockOutput = `total 64\ndrwxr-xr-x  2 ubuntu ubuntu 4096 Jan 16 10:30 .\ndrwxr-xr-x  3 ubuntu ubuntu 4096 Jan 16 10:30 ..\n-rw-r--r--  1 ubuntu ubuntu  220 Jan 16 10:30 .bash_logout\n-rw-r--r--  1 ubuntu ubuntu 3771 Jan 16 10:30 .bashrc\n-rw-r--r--  1 ubuntu ubuntu  655 Jan 16 10:30 .profile\n-rw-r--r--  1 ubuntu ubuntu  807 Jan 16 10:30 .vimrc`;
        } else if (command === 'pwd') {
          mockOutput = `/home/ubuntu`;
        } else if (command === 'whoami') {
          mockOutput = `ubuntu`;
        } else if (command === 'uptime') {
          mockOutput = ` 10:35:42 up 2 days,  3:45,  1 user,  load average: 0.08, 0.03, 0.01`;
        } else if (command === 'df -h') {
          mockOutput = `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G  5.8G   14G  30% /\ntmpfs           499M     0  499M   0% /tmp`;
        } else if (command.startsWith('echo ')) {
          mockOutput = command.substring(5);
        } else {
          mockOutput = `Command '${command}' executed successfully.`;
        }

        // 添加输出行
        const outputLines: TerminalLine[] = [];
        if (mockOutput) {
          const lines = mockOutput.split('\n');
          lines.forEach((line: string, index: number) => {
            if (line.trim() || index < lines.length - 1) {
              outputLines.push({
                id: Math.random().toString(),
                content: line,
                type: 'output',
                timestamp: Date.now() + (index + 1) * 10
              });
            }
          });
        }

        // 更新会话
        this.currentSession.lines = [...this.currentSession.lines, inputLine, ...outputLines];

        // 添加新的提示符
        const promptLine: TerminalLine = {
          id: Math.random().toString(),
          content: `${this.currentSession.host.username}@${this.currentSession.host.name}:~$ `,
          type: 'output',
          timestamp: Date.now() + outputLines.length * 10 + 10
        };

        this.currentSession.lines.push(promptLine);

        return [inputLine, ...outputLines, promptLine];
      }

      // 使用Electron IPC执行命令
      if (this.isElectron()) {
        log.info('ssh.command.executing', 'Executing SSH command', {
          connection_id: this.currentSession.connectionId,
          command: command.substring(0, 100),
        });

        const result = await window.electron.sshExecute(this.currentSession.connectionId, command);

        // 处理命令输出
        const outputLines: TerminalLine[] = [];
        if (result.output) {
          const lines = result.output.split('\n');
          lines.forEach((line: string, index: number) => {
            if (line.trim() || index < lines.length - 1) {
              outputLines.push({
                id: Math.random().toString(),
                content: line,
                type: 'output',
                timestamp: Date.now() + (index + 1) * 10
              });
            }
          });
        }

        // 更新会话
        this.currentSession.lines = [...this.currentSession.lines, inputLine, ...outputLines];

        // 添加新的提示符
        const promptLine: TerminalLine = {
          id: Math.random().toString(),
          content: `${this.currentSession.host.username}@${this.currentSession.host.name}:~$ `,
          type: 'output',
          timestamp: Date.now() + outputLines.length * 10 + 10
        };

        this.currentSession.lines.push(promptLine);

        return [inputLine, ...outputLines, promptLine];
      }

      // 生产环境使用真实API (备用方案)
      const response = await apiService.executeCommand(this.currentSession.connectionId, command);

      // 添加输出行
      const outputLines: TerminalLine[] = [];
      if (response.output) {
        // 处理多行输出
        const lines = response.output.split('\n');
        lines.forEach((line: string, index: number) => {
          if (line.trim() || index < lines.length - 1) { // 保留空行，但过滤最后的空行
            outputLines.push({
              id: Math.random().toString(),
              content: line,
              type: 'output',
              timestamp: Date.now() + (index + 1) * 10
            });
          }
        });
      }

      // 更新会话
      this.currentSession.lines = [...this.currentSession.lines, inputLine, ...outputLines];

      // 添加新的提示符
      const promptLine: TerminalLine = {
        id: Math.random().toString(),
        content: `${this.currentSession.host.username}@${this.currentSession.host.name}:~$ `,
        type: 'output',
        timestamp: Date.now() + outputLines.length * 10 + 10
      };

      this.currentSession.lines.push(promptLine);

      return [inputLine, ...outputLines, promptLine];
    } catch (error) {
      log.error('ssh.command.execution_failed', 'Command execution failed', {
        connection_id: this.currentSession?.connectionId,
        error: 1005,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });

      // 添加错误行
      const errorLine: TerminalLine = {
        id: Math.random().toString(),
        content: `Error: ${error}`,
        type: 'error',
        timestamp: Date.now()
      };

      // 添加新的提示符
      const promptLine: TerminalLine = {
        id: Math.random().toString(),
        content: `${this.currentSession.host.username}@${this.currentSession.host.name}:~$ `,
        type: 'output',
        timestamp: Date.now() + 10
      };

      if (this.currentSession) {
        this.currentSession.lines = [...this.currentSession.lines, errorLine, promptLine];
      }

      return [errorLine, promptLine];
    }
  }

  // 断开连接（断开当前会话）
  async disconnect(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const sessionId = this.currentSession.connectionId;

    try {
      // 先停止所有隧道
      if (this.isElectron()) {
        await tunnelService.stopAllTunnels(sessionId).catch((err) => {
          log.warn('ssh.tunnels.stop_failed', 'Failed to stop tunnels on disconnect', {
            connection_id: sessionId,
            msg: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // 使用Electron IPC断开连接
      if (this.isElectron()) {
        await window.electron.sshDisconnect(sessionId);
      } else {
        // 备用方案：使用API断开连接
        await apiService.disconnectSSH(sessionId);
      }

      // 添加断开连接的消息
      const disconnectLine: TerminalLine = {
        id: Math.random().toString(),
        content: 'Connection closed.',
        type: 'system',
        timestamp: Date.now()
      };

      this.currentSession.lines.push(disconnectLine);
      this.currentSession.isConnected = false;
    } catch (error) {
      log.error('ssh.disconnect.failed', 'SSH disconnect failed', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      // 即使断开失败，也标记为已断开
      if (this.currentSession) {
        this.currentSession.isConnected = false;
      }
    }
  }

  // 断开指定会话的连接
  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // 先停止所有隧道
      if (this.isElectron()) {
        await tunnelService.stopAllTunnels(sessionId).catch((err) => {
          log.warn('ssh.tunnels.stop_failed', 'Failed to stop tunnels on disconnect', {
            connection_id: sessionId,
            msg: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // 使用Electron IPC断开连接
      if (this.isElectron()) {
        await window.electron.sshDisconnect(sessionId);
      } else {
        // 备用方案：使用API断开连接
        await apiService.disconnectSSH(sessionId);
      }

      // 添加断开连接的消息
      const disconnectLine: TerminalLine = {
        id: Math.random().toString(),
        content: 'Connection closed.',
        type: 'system',
        timestamp: Date.now()
      };

      session.lines.push(disconnectLine);
      session.isConnected = false;

      // 如果断开的是当前会话，清空当前会话
      if (this.currentSession?.connectionId === sessionId) {
        this.currentSession = null;
      }
    } catch (error) {
      log.error('ssh.disconnect.session_failed', 'SSH disconnect failed', {
        session_id: sessionId,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      // 即使断开失败，也标记为已断开
      session.isConnected = false;
    }
  }

  // 获取当前会话
  getCurrentSession(): SSHSession | null {
    return this.currentSession;
  }

  // 获取所有会话
  getSessions(): SSHSession[] {
    return Array.from(this.sessions.values());
  }

  // 切换会话（通过 sessionId）
  switchSession(sessionId: string): SSHSession | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session || null;
  }

  // 获取指定会话（通过 sessionId）
  getSession(sessionId: string): SSHSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // 清理会话（通过 sessionId）
  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.isConnected) {
      // 断开指定会话的连接
      if (this.isElectron()) {
        window.electron.sshDisconnect(sessionId).catch(err => {
          log.error('ssh.disconnect.catch_error', 'Failed to disconnect session', {
            session_id: sessionId,
            error: 1,
            msg: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }
    }
    this.sessions.delete(sessionId);
    if (this.currentSession?.connectionId === sessionId) {
      this.currentSession = null;
    }
  }
}

export const sshService = new SSHService();
