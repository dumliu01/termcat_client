import type { IFsHandler, DirectoryNode } from './IFsHandler';
import { FileItem } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * SSH 文件系统操作
 *
 * 通过 sshExecute 执行 Shell 命令操作远程文件系统。
 * 能力层组件，由 SSHHostConnection 持有。
 */
export class SSHFsHandler implements IFsHandler {
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  /**
   * 列出指定目录的文件
   * @param path 目录路径
   * @returns 文件列表
   */
  async listFiles(path: string): Promise<FileItem[]> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }

      // 使用ls -alh命令获取文件列表，使用--time-style参数格式化时间
      const command = `ls -alh --time-style="+%Y/%m/%d %H:%M" "${path}" 2>/dev/null || ls -alh "${path}"`;

      logger.debug(LOG_MODULE.HTTP, 'file.list.fetching', 'Fetching file list', {
        module: LOG_MODULE.FILE,
        path,
      });
      const result = await window.electron.sshExecute(this.connectionId, command);

      if (!result.output) {
        return [];
      }

      return this.parseFileList(result.output, path);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'file.list.failed', 'Failed to list files', {
        module: LOG_MODULE.FILE,
        error: 2001,
        msg: error instanceof Error ? error.message : 'Unknown error',
        path,
      });
      throw error;
    }
  }

  /**
   * 解析ls命令的输出
   * @param output ls命令输出
   * @param currentPath 当前路径
   * @returns 文件列表
   */
  private parseFileList(output: string, currentPath: string): FileItem[] {
    const files: FileItem[] = [];
    const lines = output.trim().split('\n');

    // 跳过第一行（total xxx）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const file = this.parseFileLine(line);
        if (file && file.name !== '.' && file.name !== '..') {
          files.push(file);
        }
      } catch (error) {
        logger.warn(LOG_MODULE.HTTP, 'file.parse.line_failed', 'Failed to parse line', {
          module: LOG_MODULE.FILE,
          line,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return files;
  }

  /**
   * 解析单行文件信息
   * Linux --time-style格式: drwxr-xr-x 2 user group 4.0K 2026/01/16 11:23 filename
   * macOS/BSD默认格式:      drwxr-xr-x 2 user group 4.0K Jan 16 00:39 filename
   */
  private parseFileLine(line: string): FileItem | null {
    const parts = line.split(/\s+/);
    if (parts.length < 8) return null;

    const permission = parts[0];
    if (!/^[d\-lc][rwx\-sStT]{9}/.test(permission)) return null;

    const user = parts[2];
    const group = parts[3];
    const size = parts[4];

    // 判断日期格式：--time-style 格式 parts[5] 含 "/" ，macOS 格式 parts[5] 是月份名
    let mtime: string;
    let nameIndex: number;
    if (/^\d{4}\//.test(parts[5])) {
      // Linux --time-style: "2026/01/16 11:23"
      mtime = `${parts[5]} ${parts[6]}`;
      nameIndex = 7;
    } else {
      // macOS/BSD: "Jan 16 00:39" 或 "Jan 16 2025"
      mtime = `${parts[5]} ${parts[6]} ${parts[7]}`;
      nameIndex = 8;
    }

    const name = parts.slice(nameIndex).join(' ');

    // 判断是否是目录
    const isDir = permission.startsWith('d');

    // 判断是否是符号链接
    const isSymlink = permission.startsWith('l');

    // 处理符号链接的名称（移除 -> target部分）
    let fileName = name;
    if (isSymlink && name.includes(' -> ')) {
      fileName = name.split(' -> ')[0];
    }

    // 确定文件类型
    let type = '文件';
    if (isDir) {
      type = '文件夹';
    } else if (isSymlink) {
      type = '链接';
    } else if (permission.includes('x')) {
      type = '可执行文件';
    }

    return {
      name: fileName,
      size: isDir ? '-' : size,
      type,
      mtime,
      permission,
      userGroup: `${user}/${group}`,
      isDir,
    };
  }

  /**
   * 获取目录树结构
   * @param path 根路径
   * @param maxDepth 最大深度
   * @returns 目录树
   */
  async getDirectoryTree(path: string = '/', maxDepth: number = 3): Promise<DirectoryNode[]> {
    try {
      const command = `find "${path}" -maxdepth ${maxDepth} -type d 2>/dev/null | sort`;

      if (!window.electron) {
        throw new Error('Electron API not available');
      }

      const result = await window.electron.sshExecute(this.connectionId, command);

      if (!result.output) {
        return [];
      }

      return this.buildDirectoryTree(result.output, path);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'file.tree.failed', 'Failed to get directory tree', {
        module: LOG_MODULE.FILE,
        error: 2002,
        msg: error instanceof Error ? error.message : 'Unknown error',
        path,
      });
      // 返回基本的根目录树
      return [{ name: path, path, children: [] }];
    }
  }

  /**
   * 构建目录树结构
   */
  private buildDirectoryTree(output: string, rootPath: string): DirectoryNode[] {
    const paths = output.trim().split('\n').filter(p => p);
    const root: DirectoryNode = { name: rootPath, path: rootPath, children: [] };
    const pathMap = new Map<string, DirectoryNode>();
    pathMap.set(rootPath, root);

    for (const fullPath of paths) {
      if (fullPath === rootPath) continue;

      const parts = fullPath.split('/').filter(p => p);
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath || '/';
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

        if (!pathMap.has(currentPath)) {
          const node: DirectoryNode = {
            name: part,
            path: currentPath,
            children: [],
          };

          pathMap.set(currentPath, node);

          const parent = pathMap.get(parentPath);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push(node);
          }
        }
      }
    }

    return root.children || [];
  }

  /**
   * 获取文件内容（用于预览）
   * @param filePath 文件路径
   * @param maxLines 最大行数
   * @returns 文件内容
   */
  async getFileContent(filePath: string, maxLines: number = 100): Promise<string> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }

      const command = `head -n ${maxLines} "${filePath}"`;
      const result = await window.electron.sshExecute(this.connectionId, command);

      return result.output || '';
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'file.content.failed', 'Failed to get file content', {
        module: LOG_MODULE.FILE,
        error: 2003,
        msg: error instanceof Error ? error.message : 'Unknown error',
        filePath,
      });
      throw error;
    }
  }

  /**
   * 读取远程文件内容用于编辑（限制文件大小）
   * @param remotePath 远程文件完整路径
   * @param maxSizeKB 最大文件大小(KB)，默认2048KB
   * @returns 文件内容
   */
  async readFileForEdit(remotePath: string, maxSizeKB: number = 2048): Promise<string> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // 先检查文件大小
      const sizeResult = await window.electron.sshExecute(
        this.connectionId,
        `stat -c%s "${remotePath}" 2>/dev/null || stat -f%z "${remotePath}" 2>/dev/null`
      );
      const fileSize = parseInt(sizeResult.output?.trim() || '0', 10);
      if (fileSize > maxSizeKB * 1024) {
        throw new Error(`File too large: ${(fileSize / 1024).toFixed(0)}KB (max ${maxSizeKB}KB)`);
      }
      // 使用base64编码读取，避免特殊字符问题
      const result = await window.electron.sshExecute(
        this.connectionId,
        `cat "${remotePath}" | base64`
      );
      if (result.exitCode !== 0) throw new Error(result.output || 'Failed to read file');
      const base64Str = (result.output || '').replace(/\s/g, '');
      if (!base64Str) return '';
      // 解码base64
      const binaryStr = atob(base64Str);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.read_edit.failed', 'Failed to read file for editing', {
        remotePath, error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 写入文件内容到远程（通过base64编码传输，安全处理特殊字符）
   * @param remotePath 远程文件完整路径
   * @param content 文件内容
   */
  async writeFileContent(remotePath: string, content: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // UTF-8编码后base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // 分块写入避免命令行过长（每块64KB base64 ≈ 48KB原始数据）
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        const result = await window.electron.sshExecute(
          this.connectionId,
          `echo '${base64Str}' | base64 -d > "${remotePath}"`
        );
        if (result.exitCode !== 0) throw new Error(result.output || 'Write failed');
      } else {
        // 大文件分块写入
        const tmpPath = `/tmp/termcat_edit_${Date.now()}.b64`;
        for (let i = 0; i < base64Str.length; i += chunkSize) {
          const chunk = base64Str.slice(i, i + chunkSize);
          const op = i === 0 ? '>' : '>>';
          const result = await window.electron.sshExecute(
            this.connectionId,
            `printf '%s' '${chunk}' ${op} "${tmpPath}"`
          );
          if (result.exitCode !== 0) throw new Error(result.output || 'Write chunk failed');
        }
        const decodeResult = await window.electron.sshExecute(
          this.connectionId,
          `base64 -d < "${tmpPath}" > "${remotePath}" && rm -f "${tmpPath}"`
        );
        if (decodeResult.exitCode !== 0) throw new Error(decodeResult.output || 'Decode failed');
      }
      logger.info(LOG_MODULE.FILE, 'file.write.success', 'File content written', { remotePath, size: content.length });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.write.failed', 'Failed to write file content', {
        remotePath, error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 以sudo权限写入文件内容到远程（通过base64编码传输 + sudo tee写入）
   * @param remotePath 远程文件完整路径
   * @param content 文件内容
   * @param password sudo密码
   */
  async writeFileContentSudo(remotePath: string, content: string, password: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // UTF-8编码后base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // 分块写入避免命令行过长（每块64KB base64 ≈ 48KB原始数据）
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        // 小文件：直接用 sudo tee 写入
        const result = await window.electron.sshExecute(
          this.connectionId,
          `echo '${password}' | sudo -S sh -c "echo '${base64Str}' | base64 -d > '${remotePath}'" 2>&1`
        );
        if (result.exitCode !== 0) {
          const output = result.output || '';
          if (output.includes('incorrect password') || output.includes('Sorry, try again')) {
            throw new Error('Incorrect sudo password');
          }
          throw new Error(output || 'Sudo write failed');
        }
      } else {
        // 大文件：先分块写到临时文件，再用sudo移动
        const tmpPath = `/tmp/termcat_edit_${Date.now()}.b64`;
        for (let i = 0; i < base64Str.length; i += chunkSize) {
          const chunk = base64Str.slice(i, i + chunkSize);
          const op = i === 0 ? '>' : '>>';
          const result = await window.electron.sshExecute(
            this.connectionId,
            `printf '%s' '${chunk}' ${op} "${tmpPath}"`
          );
          if (result.exitCode !== 0) throw new Error(result.output || 'Write chunk failed');
        }
        // 用sudo将base64解码后写入目标文件
        const decodeResult = await window.electron.sshExecute(
          this.connectionId,
          `echo '${password}' | sudo -S sh -c "base64 -d < '${tmpPath}' > '${remotePath}'" 2>&1 && rm -f "${tmpPath}"`
        );
        if (decodeResult.exitCode !== 0) {
          // 清理临时文件
          await window.electron.sshExecute(this.connectionId, `rm -f "${tmpPath}"`);
          const output = decodeResult.output || '';
          if (output.includes('incorrect password') || output.includes('Sorry, try again')) {
            throw new Error('Incorrect sudo password');
          }
          throw new Error(output || 'Sudo decode failed');
        }
      }
      logger.info(LOG_MODULE.FILE, 'file.write_sudo.success', 'File content written with sudo', { remotePath, size: content.length });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.write_sudo.failed', 'Failed to write file content with sudo', {
        remotePath, error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 重命名文件或目录
   */
  async rename(dirPath: string, oldName: string, newName: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const oldPath = dirPath === '/' ? `/${oldName}` : `${dirPath}/${oldName}`;
      const newPath = dirPath === '/' ? `/${newName}` : `${dirPath}/${newName}`;
      const result = await window.electron.sshExecute(this.connectionId, `mv "${oldPath}" "${newPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Rename failed');
      logger.info(LOG_MODULE.FILE, 'file.rename.success', 'File renamed', { oldPath, newPath });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.rename.failed', 'Failed to rename', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 删除文件或目录 (SFTP方式)
   */
  async deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const cmd = isDir ? `rm -rf "${fullPath}"` : `rm -f "${fullPath}"`;
      const result = await window.electron.sshExecute(this.connectionId, cmd);
      if (result.exitCode !== 0) throw new Error(result.output || 'Delete failed');
      logger.info(LOG_MODULE.FILE, 'file.delete.success', 'File deleted', { fullPath });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.delete.failed', 'Failed to delete', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 新建目录
   */
  async mkdir(dirPath: string, name: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await window.electron.sshExecute(this.connectionId, `mkdir -p "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Mkdir failed');
      logger.info(LOG_MODULE.FILE, 'file.mkdir.success', 'Directory created', { fullPath });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.mkdir.failed', 'Failed to create directory', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 新建文件
   */
  async createFile(dirPath: string, name: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await window.electron.sshExecute(this.connectionId, `touch "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Create file failed');
      logger.info(LOG_MODULE.FILE, 'file.create.success', 'File created', { fullPath });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.create.failed', 'Failed to create file', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 修改文件权限
   */
  async chmod(dirPath: string, name: string, octal: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await window.electron.sshExecute(this.connectionId, `chmod ${octal} "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Chmod failed');
      logger.info(LOG_MODULE.FILE, 'file.chmod.success', 'Permission changed', { fullPath, octal });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.chmod.failed', 'Failed to change permission', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 打包多个文件为tar.gz
   * @param dirPath 文件所在目录
   * @param fileNames 要打包的文件名列表
   * @returns 远程临时文件路径
   */
  async packFiles(dirPath: string, fileNames: string[]): Promise<string> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      const timestamp = Date.now();
      const remoteTarPath = `/tmp/termcat_pack_${timestamp}.tar.gz`;
      const escapedNames = fileNames.map(n => `"${n}"`).join(' ');
      const cmd = `tar czf "${remoteTarPath}" -C "${dirPath}" ${escapedNames}`;
      const result = await window.electron.sshExecute(this.connectionId, cmd);
      if (result.exitCode !== 0) throw new Error(result.output || 'tar command failed');
      logger.info(LOG_MODULE.FILE, 'file.pack.success', 'Files packed', { remoteTarPath, count: fileNames.length });
      return remoteTarPath;
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.pack.failed', 'Failed to pack files', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * 删除远程临时文件
   */
  async removeTempFile(remotePath: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      await window.electron.sshExecute(this.connectionId, `rm -f "${remotePath}"`);
    } catch (error) {
      logger.warn(LOG_MODULE.FILE, 'file.temp_cleanup.failed', 'Failed to remove temp file', { remotePath });
    }
  }

  /**
   * 获取文件统计信息
   * @param filePath 文件路径
   * @returns 文件统计信息
   */
  async getFileStats(filePath: string): Promise<FileStats> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }

      const command = `stat "${filePath}" 2>/dev/null || ls -ld "${filePath}"`;
      const result = await window.electron.sshExecute(this.connectionId, command);

      return {
        path: filePath,
        size: '',
        type: '',
        modified: '',
        accessed: '',
        permissions: '',
        owner: '',
      };
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'file.stats.failed', 'Failed to get file stats', {
        module: LOG_MODULE.FILE,
        error: 2004,
        msg: error instanceof Error ? error.message : 'Unknown error',
        filePath,
      });
      throw error;
    }
  }

  /**
   * 获取初始路径（通过 SSH 获取终端当前目录）
   */
  async downloadFile(remotePath: string, localPath: string): Promise<string> {
    return (window as any).electron.downloadFile(this.connectionId, remotePath, localPath);
  }

  async downloadDirectory(remotePath: string, localPath: string): Promise<string> {
    return (window as any).electron.downloadDirectory(this.connectionId, remotePath, localPath);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<string> {
    return (window as any).electron.uploadFile(this.connectionId, localPath, remotePath);
  }

  async uploadDirectory(localPath: string, remotePath: string): Promise<string> {
    return (window as any).electron.uploadDirectory(this.connectionId, localPath, remotePath);
  }

  async getInitialPath(): Promise<string> {
    try {
      if (!window.electron) return '/';
      const pwd = await window.electron.sshPwd(this.connectionId);
      return (pwd && pwd.startsWith('/')) ? pwd : '/';
    } catch {
      return '/';
    }
  }

  async getTerminalCwd(): Promise<string | null> {
    try {
      if (!window.electron) return null;
      const pwd = await window.electron.sshPwd(this.connectionId);
      return (pwd && pwd.startsWith('/')) ? pwd : null;
    } catch {
      return null;
    }
  }
}

