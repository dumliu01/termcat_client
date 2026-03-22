/**
 * 直接 SSH 命令执行器
 *
 * 直接使用 ssh2 库建立 SSH 连接执行命令，不依赖 Electron IPC。
 * 适用于 CLI、auto_tuning 等非 Electron 场景。
 *
 * 注意：ssh2 使用延迟 require 加载，避免 Vite/esbuild 构建时
 * 尝试打包 .node 原生模块导致报错。
 */

import { ICommandExecutor, ExecuteOptions } from '../ICommandExecutor';
import { CommandResult } from '../types';

export interface DirectSSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

/** 延迟加载 ssh2，避免 Vite 静态分析时打包原生 .node 模块 */
function loadSSH2(): typeof import('ssh2') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('ssh2');
}

export class DirectSSHExecutor implements ICommandExecutor {
  private config: DirectSSHConfig;
  private client: any = null; // ssh2.Client，延迟加载所以用 any
  private _isReady = false;

  constructor(config: DirectSSHConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const { Client } = loadSSH2();

    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        this.client = client;
        this._isReady = true;
        resolve();
      });

      client.on('error', (err: Error) => {
        this._isReady = false;
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

  async execute(command: string, options?: ExecuteOptions): Promise<CommandResult> {
    if (!this.client || !this._isReady) {
      throw new Error('SSH not connected. Call initialize() first.');
    }

    const timeoutMs = options?.timeoutMs ?? 600000;

    // ssh2 exec 通道不是交互式 shell，不会自动加载 ~/.bashrc / ~/.bash_profile，
    // 导致 conda、nvm 等工具找不到。
    // 解决方案：显式 source 常见的初始化文件，再执行命令。
    // 注意：conda init 通常写在 ~/.bashrc，而 -l login shell 在某些发行版下
    // 不会 source ~/.bashrc（只读 ~/.bash_profile → ~/.profile），所以两者都 source。
    const initEnv = [
      '[ -f /etc/profile ] && source /etc/profile',
      '[ -f ~/.bash_profile ] && source ~/.bash_profile',
      '[ -f ~/.bashrc ] && source ~/.bashrc',
    ].join('; ');
    const wrappedCommand = `bash -c ${JSON.stringify(`${initEnv}; ${command}`)}`;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        resolve({
          success: false,
          output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : '') + '\n[TIMEOUT]',
          exitCode: -1,
        });
      }, timeoutMs);

      this.client.exec(wrappedCommand, (err: Error | undefined, stream: any) => {
        if (err) {
          clearTimeout(timer);
          resolve({
            success: false,
            output: `Exec error: ${err.message}`,
            exitCode: -1,
          });
          return;
        }

        stream.on('close', (code: number) => {
          if (timedOut) return;
          clearTimeout(timer);
          const exitCode = code ?? 0;
          const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
          resolve({
            success: exitCode === 0,
            output,
            exitCode,
          });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this._isReady = false;
  }

  isReady(): boolean {
    return this._isReady;
  }
}
