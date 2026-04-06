/**
 * Terminal-based file system handler
 *
 * Implements IFsHandler by executing shell commands through an ICmdExecutor
 * (specifically TerminalCmdExecutor). Used when nested SSH makes the original
 * SFTP channel unreachable — we fall back to command-line file operations
 * through the interactive terminal.
 */

import type { IFsHandler, DirectoryNode } from './IFsHandler';
import type { ICmdExecutor } from './ICmdExecutor';
import { FileItem } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.FILE });

const TRANSFER_NOT_SUPPORTED_MSG =
  'File transfer is not supported in nested SSH mode. Please use scp or configure a direct connection.';

export class TerminalFsHandler implements IFsHandler {
  constructor(private executor: ICmdExecutor) {}

  /**
   * List files in specified directory
   */
  async listFiles(path: string): Promise<FileItem[]> {
    try {
      const command = `ls -alh --time-style="+%Y/%m/%d %H:%M" "${path}" 2>/dev/null || ls -alh "${path}"`;

      log.debug('file.list.fetching', 'Fetching file list', { path });
      const result = await this.executor.execute(command);

      if (!result.output) {
        return [];
      }

      return this.parseFileList(result.output, path);
    } catch (error) {
      log.error('file.list.failed', 'Failed to list files', {
        error: 2001,
        msg: error instanceof Error ? error.message : 'Unknown error',
        path,
      });
      throw error;
    }
  }

  /**
   * Parse ls command output
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
        log.warn('file.parse.line_failed', 'Failed to parse line', {
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
   * macOS/BSD default format:  drwxr-xr-x 2 user group 4.0K Jan 16 00:39 filename
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
   */
  async getDirectoryTree(path: string = '/', maxDepth: number = 3): Promise<DirectoryNode[]> {
    try {
      const command = `find "${path}" -maxdepth ${maxDepth} -type d 2>/dev/null | sort`;
      const result = await this.executor.execute(command);

      if (!result.output) {
        return [];
      }

      return this.buildDirectoryTree(result.output, path);
    } catch (error) {
      log.error('file.tree.failed', 'Failed to get directory tree', {
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
   */
  async getFileContent(filePath: string, maxLines: number = 100): Promise<string> {
    try {
      const command = `head -n ${maxLines} "${filePath}"`;
      const result = await this.executor.execute(command);
      return result.output || '';
    } catch (error) {
      log.error('file.content.failed', 'Failed to get file content', {
        error: 2003,
        msg: error instanceof Error ? error.message : 'Unknown error',
        filePath,
      });
      throw error;
    }
  }

  /**
   * Read file content for editing (with file size limit)
   */
  async readFileForEdit(filePath: string, maxSizeKB: number = 2048): Promise<string> {
    try {
      // First check file size
      const sizeResult = await this.executor.execute(
        `stat -c%s "${filePath}" 2>/dev/null || stat -f%z "${filePath}" 2>/dev/null`
      );
      const fileSize = parseInt(sizeResult.output?.trim() || '0', 10);
      if (fileSize > maxSizeKB * 1024) {
        throw new Error(`File too large: ${(fileSize / 1024).toFixed(0)}KB (max ${maxSizeKB}KB)`);
      }
      // Use base64 encoding to read, avoid special character issues
      const result = await this.executor.execute(`cat "${filePath}" | base64`);
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
      log.error('file.read_edit.failed', 'Failed to read file for editing', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Write file content (via base64 encoding, safely handles special characters)
   */
  async writeFileContent(filePath: string, content: string): Promise<void> {
    try {
      // UTF-8 encode then base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // Write in chunks to avoid command line too long (each chunk 64KB base64 ~ 48KB raw data)
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        const result = await this.executor.execute(
          `echo '${base64Str}' | base64 -d > "${filePath}"`
        );
        if (result.exitCode !== 0) throw new Error(result.output || 'Write failed');
      } else {
        // Large file: write in chunks
        const tmpPath = `/tmp/termcat_edit_${Date.now()}.b64`;
        for (let i = 0; i < base64Str.length; i += chunkSize) {
          const chunk = base64Str.slice(i, i + chunkSize);
          const op = i === 0 ? '>' : '>>';
          const result = await this.executor.execute(
            `printf '%s' '${chunk}' ${op} "${tmpPath}"`
          );
          if (result.exitCode !== 0) throw new Error(result.output || 'Write chunk failed');
        }
        const decodeResult = await this.executor.execute(
          `base64 -d < "${tmpPath}" > "${filePath}" && rm -f "${tmpPath}"`
        );
        if (decodeResult.exitCode !== 0) throw new Error(decodeResult.output || 'Decode failed');
      }
      log.info('file.write.success', 'File content written', {
        filePath,
        size: content.length,
      });
    } catch (error) {
      log.error('file.write.failed', 'Failed to write file content', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Write file content with sudo (via base64 encoding + sudo)
   */
  async writeFileContentSudo(filePath: string, content: string, password: string): Promise<void> {
    try {
      // UTF-8 encode then base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Str = btoa(binary);
      // Write in chunks to avoid command line too long (each chunk 64KB base64 ~ 48KB raw data)
      const chunkSize = 65536;
      if (base64Str.length <= chunkSize) {
        const result = await this.executor.execute(
          `echo '${password}' | sudo -S sh -c "echo '${base64Str}' | base64 -d > '${filePath}'" 2>&1`
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
          const result = await this.executor.execute(
            `printf '%s' '${chunk}' ${op} "${tmpPath}"`
          );
          if (result.exitCode !== 0) throw new Error(result.output || 'Write chunk failed');
        }
        // Use sudo to decode base64 and write to target file
        const decodeResult = await this.executor.execute(
          `echo '${password}' | sudo -S sh -c "base64 -d < '${tmpPath}' > '${filePath}'" 2>&1 && rm -f "${tmpPath}"`
        );
        if (decodeResult.exitCode !== 0) {
          // Clean up temp file
          await this.executor.execute(`rm -f "${tmpPath}"`);
          const output = decodeResult.output || '';
          if (output.includes('incorrect password') || output.includes('Sorry, try again')) {
            throw new Error('Incorrect sudo password');
          }
          throw new Error(output || 'Sudo decode failed');
        }
      }
      log.info('file.write_sudo.success', 'File content written with sudo', {
        filePath,
        size: content.length,
      });
    } catch (error) {
      log.error('file.write_sudo.failed', 'Failed to write file content with sudo', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Rename file or directory
   */
  async rename(dirPath: string, oldName: string, newName: string): Promise<void> {
    try {
      const oldPath = dirPath === '/' ? `/${oldName}` : `${dirPath}/${oldName}`;
      const newPath = dirPath === '/' ? `/${newName}` : `${dirPath}/${newName}`;
      const result = await this.executor.execute(`mv "${oldPath}" "${newPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Rename failed');
      log.info('file.rename.success', 'File renamed', { oldPath, newPath });
    } catch (error) {
      log.error('file.rename.failed', 'Failed to rename', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete file or directory
   */
  async deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void> {
    try {
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const cmd = isDir ? `rm -rf "${fullPath}"` : `rm -f "${fullPath}"`;
      const result = await this.executor.execute(cmd);
      if (result.exitCode !== 0) throw new Error(result.output || 'Delete failed');
      log.info('file.delete.success', 'File deleted', { fullPath });
    } catch (error) {
      log.error('file.delete.failed', 'Failed to delete', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new directory
   */
  async mkdir(dirPath: string, name: string): Promise<void> {
    try {
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await this.executor.execute(`mkdir -p "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Mkdir failed');
      log.info('file.mkdir.success', 'Directory created', { fullPath });
    } catch (error) {
      log.error('file.mkdir.failed', 'Failed to create directory', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new file
   */
  async createFile(dirPath: string, name: string): Promise<void> {
    try {
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await this.executor.execute(`touch "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Create file failed');
      log.info('file.create.success', 'File created', { fullPath });
    } catch (error) {
      log.error('file.create.failed', 'Failed to create file', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Change file permissions
   */
  async chmod(dirPath: string, name: string, octal: string): Promise<void> {
    try {
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
      const result = await this.executor.execute(`chmod ${octal} "${fullPath}"`);
      if (result.exitCode !== 0) throw new Error(result.output || 'Chmod failed');
      log.info('file.chmod.success', 'Permission changed', { fullPath, octal });
    } catch (error) {
      log.error('file.chmod.failed', 'Failed to change permission', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Pack multiple files into tar.gz
   */
  async packFiles(dirPath: string, fileNames: string[]): Promise<string> {
    try {
      const timestamp = Date.now();
      const remoteTarPath = `/tmp/termcat_pack_${timestamp}.tar.gz`;
      const escapedNames = fileNames.map(n => `"${n}"`).join(' ');
      const cmd = `tar czf "${remoteTarPath}" -C "${dirPath}" ${escapedNames}`;
      const result = await this.executor.execute(cmd);
      if (result.exitCode !== 0) throw new Error(result.output || 'tar command failed');
      log.info('file.pack.success', 'Files packed', {
        remoteTarPath,
        count: fileNames.length,
      });
      return remoteTarPath;
    } catch (error) {
      log.error('file.pack.failed', 'Failed to pack files', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete remote temporary file
   */
  async removeTempFile(remotePath: string): Promise<void> {
    try {
      await this.executor.execute(`rm -f "${remotePath}"`);
    } catch (error) {
      log.warn('file.temp_cleanup.failed', 'Failed to remove temp file', { remotePath });
    }
  }

  /**
   * Download file — not supported in nested SSH mode
   */
  async downloadFile(_remotePath: string, _localPath: string): Promise<string> {
    throw new Error(TRANSFER_NOT_SUPPORTED_MSG);
  }

  /**
   * Download directory — not supported in nested SSH mode
   */
  async downloadDirectory(_remotePath: string, _localPath: string): Promise<string> {
    throw new Error(TRANSFER_NOT_SUPPORTED_MSG);
  }

  /**
   * Upload file — not supported in nested SSH mode
   */
  async uploadFile(_localPath: string, _remotePath: string): Promise<string> {
    throw new Error(TRANSFER_NOT_SUPPORTED_MSG);
  }

  /**
   * Upload directory — not supported in nested SSH mode
   */
  async uploadDirectory(_localPath: string, _remotePath: string): Promise<string> {
    throw new Error(TRANSFER_NOT_SUPPORTED_MSG);
  }

  /**
   * Get initial path (user home directory)
   */
  async getInitialPath(): Promise<string> {
    try {
      const result = await this.executor.execute('echo $HOME');
      const home = result.output?.trim();
      return (home && home.startsWith('/')) ? home : '/';
    } catch {
      return '/';
    }
  }

  /**
   * Get terminal current working directory
   */
  async getTerminalCwd(): Promise<string | null> {
    try {
      const result = await this.executor.execute('pwd');
      const cwd = result.output?.trim();
      return (cwd && cwd.startsWith('/')) ? cwd : null;
    } catch {
      return null;
    }
  }
}
