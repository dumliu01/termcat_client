/**
 * Local file system operations
 *
 * Operates local file system through Main process IPC (localFs.*).
 * Implements IFsHandler interface, held by LocalHostConnection.
 */

import type { IFsHandler, DirectoryNode } from './IFsHandler';
import { FileItem } from '@/utils/types';

export class LocalFsHandler implements IFsHandler {
  private connectionId: string | null = null;

  /** Set associated local terminal pty ID, used for getting terminal current directory */
  setConnectionId(id: string): void {
    this.connectionId = id;
  }

  async listFiles(path: string): Promise<FileItem[]> {
    return window.electron.localFs.list(path);
  }

  async getDirectoryTree(path: string = '/', maxDepth: number = 3): Promise<DirectoryNode[]> {
    return window.electron.localFs.tree(path, maxDepth);
  }

  async getFileContent(filePath: string, maxLines: number = 100): Promise<string> {
    return window.electron.localFs.readPreview(filePath, maxLines);
  }

  async readFileForEdit(filePath: string, maxSizeKB: number = 2048): Promise<string> {
    return window.electron.localFs.read(filePath, maxSizeKB);
  }

  async writeFileContent(filePath: string, content: string): Promise<void> {
    await window.electron.localFs.write(filePath, content);
  }

  // Sudo write is not supported in local mode

  async rename(dirPath: string, oldName: string, newName: string): Promise<void> {
    await window.electron.localFs.rename(dirPath, oldName, newName);
  }

  async deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void> {
    await window.electron.localFs.delete(dirPath, name, isDir);
  }

  async mkdir(dirPath: string, name: string): Promise<void> {
    await window.electron.localFs.mkdir(dirPath, name);
  }

  async createFile(dirPath: string, name: string): Promise<void> {
    await window.electron.localFs.createFile(dirPath, name);
  }

  async chmod(dirPath: string, name: string, octal: string): Promise<void> {
    await window.electron.localFs.chmod(dirPath, name, octal);
  }

  async packFiles(dirPath: string, fileNames: string[]): Promise<string> {
    return window.electron.localFs.pack(dirPath, fileNames);
  }

  async removeTempFile(tempPath: string): Promise<void> {
    await window.electron.localFs.removeTempFile(tempPath);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<string> {
    return window.electron.localFs.copyFile(remotePath, localPath);
  }

  async downloadDirectory(remotePath: string, localPath: string): Promise<string> {
    return window.electron.localFs.copyDir(remotePath, localPath);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<string> {
    return window.electron.localFs.copyFile(localPath, remotePath);
  }

  async uploadDirectory(localPath: string, remotePath: string): Promise<string> {
    return window.electron.localFs.copyDir(localPath, remotePath);
  }

  async getInitialPath(): Promise<string> {
    return window.electron.localFs.getHomedir();
  }

  async getTerminalCwd(): Promise<string | null> {
    if (!this.connectionId) return null;
    try {
      return await window.electron.getSessionCwd(this.connectionId, 'local');
    } catch {
      return null;
    }
  }
}
