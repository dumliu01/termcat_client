/**
 * File system operation abstraction interface
 *
 * Capability layer component, SSH and local implementations.
 * Held by IHostConnection, upper layers (FileBrowserPanel etc.) operate files through it.
 */

/**
 * Directory tree node
 */
export interface DirectoryNode {
  name: string;
  path: string;
  children?: DirectoryNode[];
  open?: boolean;
}

export interface IFsHandler {
  /** List files in directory */
  listFiles(path: string): Promise<FileItem[]>;

  /** Get directory tree */
  getDirectoryTree(path: string, maxDepth?: number): Promise<DirectoryNode[]>;

  /** Get file content (preview, limited lines) */
  getFileContent(filePath: string, maxLines?: number): Promise<string>;

  /** Read full file content (for editing) */
  readFileForEdit(filePath: string, maxSizeKB?: number): Promise<string>;

  /** Write file content */
  writeFileContent(filePath: string, content: string): Promise<void>;

  /** Write file content with sudo (SSH only, not supported locally) */
  writeFileContentSudo?(filePath: string, content: string, password: string): Promise<void>;

  /** Rename */
  rename(dirPath: string, oldName: string, newName: string): Promise<void>;

  /** Delete */
  deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void>;

  /** Create directory */
  mkdir(dirPath: string, name: string): Promise<void>;

  /** Create empty file */
  createFile(dirPath: string, name: string): Promise<void>;

  /** Change permissions */
  chmod(dirPath: string, name: string, octal: string): Promise<void>;

  /** Pack files */
  packFiles(dirPath: string, fileNames: string[]): Promise<string>;

  /** Remove temporary file */
  removeTempFile(tempPath: string): Promise<void>;

  /** Download file (remote path -> local save path) */
  downloadFile(remotePath: string, localPath: string): Promise<string>;

  /** Download directory (remote path -> local save path) */
  downloadDirectory(remotePath: string, localPath: string): Promise<string>;

  /** Upload file (local path -> remote path) */
  uploadFile(localPath: string, remotePath: string): Promise<string>;

  /** Upload directory (local path -> remote path) */
  uploadDirectory(localPath: string, remotePath: string): Promise<string>;

  /** Get initial path */
  getInitialPath(): Promise<string>;

  /** Get terminal current working directory (for syncing file browser path) */
  getTerminalCwd?(): Promise<string | null>;
}
