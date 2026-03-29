/**
 * Direct SSH Command Executor
 *
 * Directly uses ssh2 library to establish SSH connection and execute commands, without depending on Electron IPC.
 * Suitable for CLI, auto_tuning and other non-Electron scenarios.
 *
 * Note: ssh2 uses lazy require loading to avoid Vite/esbuild build errors
 * when trying to bundle .node native modules.
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

/** Lazy load ssh2 to avoid Vite static analysis bundling native .node modules */
function loadSSH2(): typeof import('ssh2') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('ssh2');
}

export class DirectSSHExecutor implements ICommandExecutor {
  private config: DirectSSHConfig;
  private client: any = null; // ssh2.Client, delayed load so use any
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

    // ssh2 exec channel is not an interactive shell, won't auto-load ~/.bashrc / ~/.bash_profile,
    // causing conda, nvm and other tools to be not found.
    // Solution: explicitly source common initialization files, then execute command.
    // Note: conda init is usually in ~/.bashrc, but -l login shell on some distros
    // doesn't source ~/.bashrc (only reads ~/.bash_profile → ~/.profile), so source both.
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
