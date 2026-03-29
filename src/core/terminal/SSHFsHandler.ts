import type { IFsHandler, DirectoryNode } from './IFsHandler';
import { FileItem } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * SSH file system operations
 *
 * Operates remote file system by executing shell commands via sshExecute.
 * Capability layer component, held by SSHHostConnection.
 */
export class SSHFsHandler implements IFsHandler {
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  /**
   * List files in specified directory
   * @param path Directory path
   * @returns File list
   */
  async listFiles(path: string): Promise<FileItem[]> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }

      // Use ls -alh command to get file list, use --time-style parameter to format time
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
   * Parse ls command output
   * @param output ls command output
   * @param currentPath Current path
   * @returns File list
   */
  private parseFileList(output: string, currentPath: string): FileItem[] {
    const files: FileItem[] = [];
    const lines = output.trim().split('\n');

    // Skip first line (total xxx)
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
   * Parse single line of file info
   * Linux --time-style format: drwxr-xr-x 2 user group 4.0K 2026/01/16 11:23 filename
   * macOS/BSD default format:      drwxr-xr-x 2 user group 4.0K Jan 16 00:39 filename
   */
  private parseFileLine(line: string): FileItem | null {
    const parts = line.split(/\s+/);
    if (parts.length < 8) return null;

    const permission = parts[0];
    if (!/^[d\-lc][rwx\-sStT]{9}/.test(permission)) return null;

    const user = parts[2];
    const group = parts[3];
    const size = parts[4];

    // Determine date format: --time-style format parts[5] contains "/", macOS format parts[5] is month name
    let mtime: string;
    let nameIndex: number;
    if (/^\d{4}\//.test(parts[5])) {
      // Linux --time-style: "2026/01/16 11:23"
      mtime = `${parts[5]} ${parts[6]}`;
      nameIndex = 7;
    } else {
      // macOS/BSD: "Jan 16 00:39" or "Jan 16 2025"
      mtime = `${parts[5]} ${parts[6]} ${parts[7]}`;
      nameIndex = 8;
    }

    const name = parts.slice(nameIndex).join(' ');

    // Determine if directory
    const isDir = permission.startsWith('d');

    // Determine if symlink
    const isSymlink = permission.startsWith('l');

    // Handle symlink name (remove -> target part)
    let fileName = name;
    if (isSymlink && name.includes(' -> ')) {
      fileName = name.split(' -> ')[0];
    }

    // Determine file type
    let type = 'File';
    if (isDir) {
      type = 'Directory';
    } else if (isSymlink) {
      type = 'Link';
    } else if (permission.includes('x')) {
      type = 'Executable';
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
   * Get directory tree structure
   * @param path Root path
   * @param maxDepth Maximum depth
   * @returns Directory tree
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
      // Return basic root directory tree
      return [{ name: path, path, children: [] }];
    }
  }

  /**
   * Build directory tree structure
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
   * Get file content (for preview)
   * @param filePath File path
   * @param maxLines Maximum lines
   * @returns File content
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
   * Read remote file content for editing (with file size limit)
   * @param remotePath Remote file full path
   * @param maxSizeKB Maximum file size (KB), default 2048KB
   * @returns File content
   */
  async readFileForEdit(remotePath: string, maxSizeKB: number = 2048): Promise<string> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // First check file size
      const sizeResult = await window.electron.sshExecute(
        this.connectionId,
        `stat -c%s "${remotePath}" 2>/dev/null || stat -f%z "${remotePath}" 2>/dev/null`
      );
      const fileSize = parseInt(sizeResult.output?.trim() || '0', 10);
      if (fileSize > maxSizeKB * 1024) {
        throw new Error(`File too large: ${(fileSize / 1024).toFixed(0)}KB (max ${maxSizeKB}KB)`);
      }
      // Use base64 encoding to read, avoid special character issues
      const result = await window.electron.sshExecute(
        this.connectionId,
        `cat "${remotePath}" | base64`
      );
      if (result.exitCode !== 0) throw new Error(result.output || 'Failed to read file');
      const base64Str = (result.output || '').replace(/\s/g, '');
      if (!base64Str) return '';
      // Decode base64
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
   * Write file content to remote (via base64 encoding, safely handles special characters)
   * @param remotePath Remote file full path
   * @param content File content
   */
  async writeFileContent(remotePath: string, content: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // UTF-8 encode then base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // Write in chunks to avoid command line too long (each chunk 64KB base64 ≈ 48KB raw data)
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        const result = await window.electron.sshExecute(
          this.connectionId,
          `echo '${base64Str}' | base64 -d > "${remotePath}"`
        );
        if (result.exitCode !== 0) throw new Error(result.output || 'Write failed');
      } else {
        // Large file: write in chunks
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
   * Write file content to remote with sudo (via base64 encoding + sudo tee)
   * @param remotePath Remote file full path
   * @param content File content
   * @param password sudo password
   */
  async writeFileContentSudo(remotePath: string, content: string, password: string): Promise<void> {
    try {
      if (!window.electron) throw new Error('Electron API not available');
      // UTF-8 encode then base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // Write in chunks to avoid command line too long (each chunk 64KB base64 ≈ 48KB raw data)
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        // Small file: write directly with sudo tee
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
        // Large file: write chunks to temp file first, then move with sudo
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
        // Use sudo to decode base64 and write to target file
        const decodeResult = await window.electron.sshExecute(
          this.connectionId,
          `echo '${password}' | sudo -S sh -c "base64 -d < '${tmpPath}' > '${remotePath}'" 2>&1 && rm -f "${tmpPath}"`
        );
        if (decodeResult.exitCode !== 0) {
          // Clean up temp file
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
   * Rename file or directory
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
   * Delete file or directory (SFTP method)
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
   * Create new directory
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
   * Create new file
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
   * Change file permissions
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
   * Pack multiple files into tar.gz
   * @param dirPath Directory containing files
   * @param fileNames List of file names to pack
   * @returns Remote temporary file path
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
   * Delete remote temporary file
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
   * Get file statistics
   * @param filePath File path
   * @returns File statistics
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
   * Get initial path (via SSH to get terminal current directory)
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

