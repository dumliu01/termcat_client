/**
 * ProxyFsHandler — transparent file operation proxy
 *
 * Routes calls to either the original SSH/local fs handler or a
 * terminal-based handler depending on nested SSH state.
 * Upper layers operate files without knowing which backend is active.
 */

import type { TerminalFsHandler } from './TerminalFsHandler';
import type { IFsHandler, DirectoryNode } from './IFsHandler';
import { FileItem } from '@/utils/types';

export class ProxyFsHandler implements IFsHandler {
  private _original: IFsHandler;
  private _nested: TerminalFsHandler | null = null;
  private _isNested = false;

  constructor(original: IFsHandler) {
    this._original = original;
  }

  /** Active handler based on current mode */
  private get _active(): IFsHandler {
    return this._isNested && this._nested ? this._nested : this._original;
  }

  /** Switch to nested mode (internal, called by SSHHostConnection) */
  _switchToNested(termHandler: TerminalFsHandler): void {
    this._nested = termHandler;
    this._isNested = true;
  }

  /** Restore original mode (internal, called by SSHHostConnection) */
  _switchToOriginal(): void {
    this._isNested = false;
    this._nested = null;
  }

  /** Whether currently in nested mode */
  get isNested(): boolean {
    return this._isNested;
  }

  // ─── IFsHandler delegation ───────────────────────────────────────

  listFiles(path: string): Promise<FileItem[]> {
    return this._active.listFiles(path);
  }

  getDirectoryTree(path: string, maxDepth?: number): Promise<DirectoryNode[]> {
    return this._active.getDirectoryTree(path, maxDepth);
  }

  getFileContent(filePath: string, maxLines?: number): Promise<string> {
    return this._active.getFileContent(filePath, maxLines);
  }

  readFileForEdit(filePath: string, maxSizeKB?: number): Promise<string> {
    return this._active.readFileForEdit(filePath, maxSizeKB);
  }

  writeFileContent(filePath: string, content: string): Promise<void> {
    return this._active.writeFileContent(filePath, content);
  }

  async writeFileContentSudo(filePath: string, content: string, password: string): Promise<void> {
    const handler = this._active;
    if (!handler.writeFileContentSudo) {
      throw new Error('writeFileContentSudo is not supported by the active handler');
    }
    return handler.writeFileContentSudo(filePath, content, password);
  }

  rename(dirPath: string, oldName: string, newName: string): Promise<void> {
    return this._active.rename(dirPath, oldName, newName);
  }

  deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void> {
    return this._active.deleteFile(dirPath, name, isDir);
  }

  mkdir(dirPath: string, name: string): Promise<void> {
    return this._active.mkdir(dirPath, name);
  }

  createFile(dirPath: string, name: string): Promise<void> {
    return this._active.createFile(dirPath, name);
  }

  chmod(dirPath: string, name: string, octal: string): Promise<void> {
    return this._active.chmod(dirPath, name, octal);
  }

  packFiles(dirPath: string, fileNames: string[]): Promise<string> {
    return this._active.packFiles(dirPath, fileNames);
  }

  removeTempFile(tempPath: string): Promise<void> {
    return this._active.removeTempFile(tempPath);
  }

  downloadFile(remotePath: string, localPath: string): Promise<string> {
    return this._active.downloadFile(remotePath, localPath);
  }

  downloadDirectory(remotePath: string, localPath: string): Promise<string> {
    return this._active.downloadDirectory(remotePath, localPath);
  }

  uploadFile(localPath: string, remotePath: string): Promise<string> {
    return this._active.uploadFile(localPath, remotePath);
  }

  uploadDirectory(localPath: string, remotePath: string): Promise<string> {
    return this._active.uploadDirectory(localPath, remotePath);
  }

  getInitialPath(): Promise<string> {
    return this._active.getInitialPath();
  }

  getTerminalCwd(): Promise<string | null> {
    return this._active.getTerminalCwd?.() ?? Promise.resolve(null);
  }
}
