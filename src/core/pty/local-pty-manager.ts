/**
 * 本地 PTY 服务
 *
 * Main 进程中管理本地终端进程，与 ssh-service.ts 平行独立。
 */

import * as pty from 'node-pty';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { logger, LOG_MODULE } from '../../base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

export interface ShellInfo {
  name: string;
  path: string;
  args?: string[];
}

interface PtyInstance {
  id: string;
  process: pty.IPty;
  shell: string;
  cwd: string;
  webContents: Electron.WebContents;
  createdAt: number;
}

export class LocalPtyService {
  private instances = new Map<string, PtyInstance>();

  async detectShells(): Promise<ShellInfo[]> {
    if (process.platform === 'win32') {
      return this.detectWindowsShells();
    }
    return this.detectUnixShells();
  }

  getDefaultShell(): ShellInfo {
    if (process.platform === 'win32') {
      const pwsh = this.findExecutable('pwsh.exe');
      if (pwsh) return { name: 'PowerShell 7', path: pwsh };
      return { name: 'PowerShell', path: 'powershell.exe' };
    }
    const shell = process.env.SHELL || '/bin/sh';
    // macOS/Linux: 以 login shell 启动，确保加载完整 PATH（与 Terminal.app 行为一致）
    return { name: path.basename(shell), path: shell, args: ['-l'] };
  }

  create(options: {
    shell?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    cols: number;
    rows: number;
    webContents: Electron.WebContents;
  }): string {
    const ptyId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultShell = this.getDefaultShell();
    const shell = options.shell || defaultShell.path;
    const args = options.args || defaultShell.args || [];
    const cwd = options.cwd || os.homedir();

    log.info('pty.creating', 'Creating local PTY', { pty_id: ptyId, shell, cwd });

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd,
      env: {
        ...process.env,
        // 确保 UTF-8 locale（macOS GUI 应用可能不继承 shell 的 LANG）
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_CTYPE: process.env.LC_CTYPE || 'UTF-8',
        ...options.env,
      } as Record<string, string>,
    });

    ptyProcess.onData((data) => {
      if (!options.webContents.isDestroyed()) {
        options.webContents.send('local-pty-data', ptyId, data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      log.info('pty.exited', 'Local PTY exited', { pty_id: ptyId, exit_code: exitCode, signal });
      if (!options.webContents.isDestroyed()) {
        options.webContents.send('local-pty-close', ptyId, exitCode);
      }
      this.instances.delete(ptyId);
    });

    this.instances.set(ptyId, {
      id: ptyId,
      process: ptyProcess,
      shell,
      cwd,
      webContents: options.webContents,
      createdAt: Date.now(),
    });

    log.info('pty.created', 'Local PTY created', { pty_id: ptyId });
    return ptyId;
  }

  write(ptyId: string, data: string): boolean {
    const instance = this.instances.get(ptyId);
    if (!instance) return false;
    instance.process.write(data);
    return true;
  }

  resize(ptyId: string, cols: number, rows: number): boolean {
    const instance = this.instances.get(ptyId);
    if (!instance) return false;
    instance.process.resize(cols, rows);
    return true;
  }

  destroy(ptyId: string): void {
    const instance = this.instances.get(ptyId);
    if (!instance) return;
    log.info('pty.destroying', 'Destroying local PTY', { pty_id: ptyId });
    instance.process.kill();
    this.instances.delete(ptyId);
  }

  destroyAll(): void {
    log.info('pty.destroying_all', 'Destroying all local PTY instances', { count: this.instances.size });
    for (const [id] of this.instances) {
      this.destroy(id);
    }
  }

  exists(ptyId: string): boolean {
    return this.instances.has(ptyId);
  }

  /**
   * 获取 PTY 子进程的当前工作目录
   */
  async getCwd(ptyId: string): Promise<string | null> {
    const instance = this.instances.get(ptyId);
    if (!instance) return null;
    const pid = instance.process.pid;
    try {
      if (process.platform === 'darwin') {
        // macOS: 通过 lsof 获取 cwd
        const { execSync } = require('child_process');
        const output = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 });
        const match = output.match(/\nn(.+)/);
        return match ? match[1] : null;
      } else if (process.platform === 'linux') {
        // Linux: 读取 /proc/{pid}/cwd 软链接
        return await fs.promises.readlink(`/proc/${pid}/cwd`);
      } else {
        // Windows: 不支持
        return null;
      }
    } catch {
      return null;
    }
  }

  private async detectUnixShells(): Promise<ShellInfo[]> {
    const shells: ShellInfo[] = [];
    try {
      const content = await fs.promises.readFile('/etc/shells', 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      for (const shellPath of lines) {
        try {
          await fs.promises.access(shellPath, fs.constants.X_OK);
          shells.push({ name: path.basename(shellPath), path: shellPath });
        } catch { /* skip */ }
      }
    } catch {
      const fallback = process.env.SHELL || '/bin/sh';
      shells.push({ name: path.basename(fallback), path: fallback });
    }
    return shells;
  }

  private async detectWindowsShells(): Promise<ShellInfo[]> {
    const shells: ShellInfo[] = [];
    const candidates: Array<{ name: string; paths: string[]; args?: string[] }> = [
      { name: 'PowerShell 7', paths: ['pwsh.exe'] },
      { name: 'PowerShell', paths: ['powershell.exe'] },
      { name: 'CMD', paths: ['cmd.exe'] },
      { name: 'WSL', paths: ['wsl.exe'] },
      {
        name: 'Git Bash',
        paths: ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
        args: ['--login', '-i'],
      },
    ];
    for (const candidate of candidates) {
      const found = this.findExecutableFromPaths(candidate.paths);
      if (found) {
        shells.push({ name: candidate.name, path: found, args: candidate.args });
      }
    }
    return shells;
  }

  private findExecutable(name: string): string | null {
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, name);
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch { continue; }
    }
    return null;
  }

  private findExecutableFromPaths(paths: string[]): string | null {
    for (const p of paths) {
      if (path.isAbsolute(p)) {
        try {
          fs.accessSync(p, fs.constants.X_OK);
          return p;
        } catch { continue; }
      }
      const found = this.findExecutable(p);
      if (found) return found;
    }
    return null;
  }
}

export const localPtyService = new LocalPtyService();
