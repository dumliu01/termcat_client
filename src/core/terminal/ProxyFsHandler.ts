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
  private _switchCallbacks: Array<() => void> = [];
  /**
   * Terminal CWD tracked from OSC sequences (set externally by HostConnection).
   * Used by getTerminalCwd() in nested mode so we return the user's interactive
   * terminal CWD instead of the private shell's home directory.
   */
  private _trackedCwd: string | null = null;
  /** Remote home directory, used to resolve ~ in OSC title sequences */
  private _remoteHome: string | null = null;

  constructor(original: IFsHandler) {
    this._original = original;
  }

  /** Update tracked terminal CWD (called by HostConnection when OSC sequences arrive) */
  _setTrackedCwd(cwd: string): void {
    this._trackedCwd = cwd;
  }

  /**
   * Update tracked CWD from an OSC title path that may contain ~.
   * Resolves ~ using the stored remote home directory.
   */
  _setTrackedCwdFromTitle(titlePath: string): void {
    if (titlePath.startsWith('/')) {
      this._trackedCwd = titlePath;
    } else if (titlePath.startsWith('~') && this._remoteHome) {
      this._trackedCwd = titlePath === '~'
        ? this._remoteHome
        : this._remoteHome + titlePath.slice(1);
    }
  }

  /** Set the remote home directory (called after getInitialPath resolves) */
  _setRemoteHome(home: string): void {
    this._remoteHome = home;
  }

  /** Active handler based on current mode */
  private get _active(): IFsHandler {
    return this._isNested && this._nested ? this._nested : this._original;
  }

  /** Register a callback for when the active handler switches (nested enter/exit) */
  onHandlerSwitch(cb: () => void): () => void {
    this._switchCallbacks.push(cb);
    return () => {
      const idx = this._switchCallbacks.indexOf(cb);
      if (idx >= 0) this._switchCallbacks.splice(idx, 1);
    };
  }

  private _notifySwitch(): void {
    for (const cb of this._switchCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  /** Switch to nested mode (internal, called by SSHHostConnection / LocalHostConnection) */
  _switchToNested(termHandler: TerminalFsHandler): void {
    this._nested = termHandler;
    this._isNested = true;
    this._notifySwitch();
  }

  /** Restore original mode (internal, called by SSHHostConnection / LocalHostConnection) */
  _switchToOriginal(): void {
    this._isNested = false;
    this._nested = null;
    this._notifySwitch();
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
    // In nested mode, prefer OSC-tracked CWD from the user's interactive terminal.
    // The nested handler's getTerminalCwd() runs `pwd` in a private shell which
    // always returns the home directory, not the user's current directory.
    if (this._isNested && this._trackedCwd) {
      return Promise.resolve(this._trackedCwd);
    }
    return this._active.getTerminalCwd?.() ?? Promise.resolve(null);
  }
}
