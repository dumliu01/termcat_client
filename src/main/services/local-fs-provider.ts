/**
 * 本地文件系统操作提供者（Main 进程）
 *
 * 封装 Node.js fs API，通过 IPC 提供给 Renderer 进程。
 * 应用层服务，不属于 core 传输层。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { logger, LOG_MODULE } from '../../base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.FILE });

interface FileItem {
  name: string;
  size: string;
  type: string;
  mtime: string;
  permission: string;
  userGroup: string;
  isDir: boolean;
}

interface DirectoryNode {
  name: string;
  path: string;
  children?: DirectoryNode[];
}

export class LocalFsProvider {

  async list(dirPath: string): Promise<FileItem[]> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items: FileItem[] = [];

    for (const entry of entries) {
      try {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.promises.lstat(fullPath);
        items.push(this.statsToFileItem(entry.name, stats));
      } catch {
        // 无权限访问，跳过
      }
    }

    items.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  async tree(dirPath: string, maxDepth: number = 3): Promise<DirectoryNode[]> {
    return this.buildTree(dirPath, 0, maxDepth);
  }

  async readPreview(filePath: string, maxLines: number = 100): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(0, maxLines).join('\n');
  }

  async read(filePath: string, maxSizeKB: number = 2048): Promise<string> {
    const stats = await fs.promises.stat(filePath);
    if (stats.size > maxSizeKB * 1024) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max ${maxSizeKB / 1024}MB)`);
    }
    return fs.promises.readFile(filePath, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async rename(dirPath: string, oldName: string, newName: string): Promise<void> {
    await fs.promises.rename(path.join(dirPath, oldName), path.join(dirPath, newName));
  }

  async delete(dirPath: string, name: string, isDir: boolean): Promise<void> {
    await fs.promises.rm(path.join(dirPath, name), { recursive: isDir, force: true });
  }

  async mkdir(dirPath: string, name: string): Promise<void> {
    await fs.promises.mkdir(path.join(dirPath, name), { recursive: true });
  }

  async createFile(dirPath: string, name: string): Promise<void> {
    await fs.promises.writeFile(path.join(dirPath, name), '', 'utf-8');
  }

  async chmod(dirPath: string, name: string, octal: string): Promise<void> {
    await fs.promises.chmod(path.join(dirPath, name), parseInt(octal, 8));
  }

  async pack(dirPath: string, fileNames: string[]): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `termcat_pack_${Date.now()}.tar.gz`);
    const escapedNames = fileNames.map(n => `'${n.replace(/'/g, "'\\''")}'`).join(' ');

    return new Promise<string>((resolve, reject) => {
      exec(
        `cd '${dirPath.replace(/'/g, "'\\''")}' && tar czf '${tempPath}' ${escapedNames}`,
        { timeout: 30000 },
        (error) => {
          if (error) reject(error);
          else resolve(tempPath);
        },
      );
    });
  }

  async removeTempFile(tempPath: string): Promise<void> {
    try {
      await fs.promises.rm(tempPath, { force: true });
    } catch { /* ignore */ }
  }

  /**
   * 复制文件（本地 → 本地）
   * 返回一个伪 transferId 以保持与 SSH 传输接口一致
   */
  async copyFile(srcPath: string, destPath: string): Promise<string> {
    await fs.promises.copyFile(srcPath, destPath);
    log.info('local-fs.copy_file', 'File copied', { src: srcPath, dest: destPath });
    return `local-copy-${Date.now()}`;
  }

  /**
   * 递归复制目录（本地 → 本地）
   */
  async copyDirectory(srcPath: string, destPath: string): Promise<string> {
    await this.copyDirRecursive(srcPath, destPath);
    log.info('local-fs.copy_dir', 'Directory copied', { src: srcPath, dest: destPath });
    return `local-copy-dir-${Date.now()}`;
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcFull = path.join(src, entry.name);
      const destFull = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcFull, destFull);
      } else {
        await fs.promises.copyFile(srcFull, destFull);
      }
    }
  }

  getHomedir(): string {
    return os.homedir();
  }

  // ── Private ──

  private statsToFileItem(name: string, stats: fs.Stats): FileItem {
    const isDir = stats.isDirectory();
    const isLink = stats.isSymbolicLink();
    const isExec = !isDir && (stats.mode & 0o111) !== 0;

    let type = '文件';
    if (isDir) type = '文件夹';
    else if (isLink) type = '链接';
    else if (isExec) type = '可执行文件';

    return {
      name,
      size: isDir ? '-' : this.formatSize(stats.size),
      type,
      mtime: this.formatDate(stats.mtime),
      permission: this.formatPermission(stats.mode, isDir),
      userGroup: `${stats.uid}/${stats.gid}`,
      isDir,
    };
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
  }

  private formatPermission(mode: number, isDir: boolean): string {
    const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    const user = perms[(mode >> 6) & 7];
    const group = perms[(mode >> 3) & 7];
    const other = perms[mode & 7];
    return `${isDir ? 'd' : '-'}${user}${group}${other}`;
  }

  private async buildTree(dirPath: string, depth: number, maxDepth: number): Promise<DirectoryNode[]> {
    if (depth >= maxDepth) return [];

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const nodes: DirectoryNode[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dirPath, entry.name);
        try {
          const children = await this.buildTree(fullPath, depth + 1, maxDepth);
          nodes.push({ name: entry.name, path: fullPath, children });
        } catch {
          nodes.push({ name: entry.name, path: fullPath, children: [] });
        }
      }

      nodes.sort((a, b) => a.name.localeCompare(b.name));
      return nodes;
    } catch {
      return [];
    }
  }
}

export const localFsProvider = new LocalFsProvider();
