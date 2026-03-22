/**
 * Node.js SSH Shell 命令执行器
 *
 * 继承 BaseShellExecutor，通过 ssh2 的 shell() 建立交互式 shell。
 * 与 ElectronShellExecutor 共享完全相同的命令执行逻辑。
 *
 * 优点（对比 DirectSSHExecutor 的 exec() 模式）：
 * - 自动加载 ~/.bashrc，conda/nvm 等环境变量正常可用
 * - 支持交互式提示检测与自动响应
 * - 支持分页器自动退出
 *
 * 适用场景：CLI（cli-agent）、auto_tuning 等非 Electron 场景。
 *
 * 注意：ssh2 使用延迟 require 加载，避免 Vite/esbuild 构建时
 * 尝试打包 .node 原生模块导致报错。
 */

import { BaseShellExecutor } from './BaseShellExecutor';

export interface NodeSSHShellConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

/** 远程服务器操作系统信息 */
export interface OSInfo {
  osType: string;    // "linux/ubuntu", "linux/centos", "macos", "windows"
  osVersion: string; // "22.04", "14.2" 等
  kernel: string;    // "Linux 5.15.0-91-generic"
  shell: string;     // "bash", "zsh", "sh"
}

/** 延迟加载 ssh2，避免 Vite 静态分析时打包原生 .node 模块 */
function loadSSH2(): typeof import('ssh2') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('ssh2');
}

export class NodeSSHShellExecutor extends BaseShellExecutor {
  private config: NodeSSHShellConfig;
  private client: any = null;
  private shellStream: any = null;

  constructor(config: NodeSSHShellConfig) {
    super();
    this.config = config;
  }

  protected async setupShell(): Promise<void> {
    const { Client } = loadSSH2();

    await new Promise<void>((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        this.client = client;

        // 请求交互式 shell（会自动加载 ~/.bashrc）
        client.shell({ term: 'xterm' }, (err: Error | undefined, stream: any) => {
          if (err) {
            client.end();
            reject(new Error(`Failed to open shell: ${err.message}`));
            return;
          }

          this.shellStream = stream;

          // 等待初始 prompt 出现后再标记就绪
          // 给 shell 2 秒时间输出初始内容，然后清空缓冲区
          setTimeout(() => {
            this.outputBuffer = '';
            resolve();
          }, 2000);
        });
      });

      client.on('error', (err: Error) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      const connectConfig: any = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
      };

      if (this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey;
      } else if (this.config.password) {
        connectConfig.password = this.config.password;
      }

      client.connect(connectConfig);
    });
  }

  protected async writeRaw(data: string): Promise<void> {
    if (!this.shellStream) {
      throw new Error('Shell stream not available');
    }
    this.shellStream.write(data);
  }

  protected onShellDataSetup(): () => void {
    const handler = (data: Buffer) => {
      this.handleShellData(data.toString());
    };
    this.shellStream.on('data', handler);
    return () => {
      if (this.shellStream) {
        this.shellStream.removeListener('data', handler);
      }
    };
  }

  /**
   * 通过 ssh2 exec 检测远程服务器操作系统信息。
   * 必须在 initialize() 之后调用（需要 this.client 已就绪）。
   * 检测失败时返回 undefined，不影响主流程。
   */
  async detectOSInfo(): Promise<OSInfo | undefined> {
    if (!this.client) return undefined;

    return new Promise<OSInfo | undefined>((resolve) => {
      const cmd = 'uname -s && uname -r && (cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true) && echo "===SHELL===$SHELL"';

      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 5000);

      this.client.exec(cmd, (err: Error | undefined, stream: any) => {
        if (err) {
          clearTimeout(timeout);
          resolve(undefined);
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
              const versionLine = lines.find(l => /ProductVersion/i.test(l));
              if (versionLine) {
                const match = versionLine.match(/:\s*(.+)/);
                osVersion = match ? match[1].trim() : '';
              }
            } else if (unameSys === 'Linux') {
              const idLine = lines.find(l => /^ID=/i.test(l));
              const versionLine = lines.find(l => /^VERSION_ID=/i.test(l));

              const distroId = idLine ? idLine.replace(/^ID=/i, '').replace(/"/g, '').trim() : '';
              osVersion = versionLine ? versionLine.replace(/^VERSION_ID=/i, '').replace(/"/g, '').trim() : '';

              if (distroId) {
                osType = `linux/${distroId}`;
              }
            }

            resolve({
              osType,
              osVersion,
              kernel: `${unameSys} ${unameRel}`,
              shell,
            });
          } catch {
            resolve(undefined);
          }
        });
      });
    });
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    if (this.shellStream) {
      this.shellStream.end();
      this.shellStream = null;
    }
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}
