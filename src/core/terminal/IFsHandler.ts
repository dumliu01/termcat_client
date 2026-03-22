/**
 * 文件系统操作抽象接口
 *
 * 能力层组件，SSH 和本地各自实现。
 * 由 IHostConnection 持有，上层（FileBrowserPanel 等）通过它操作文件。
 */

import { FileItem } from '@/utils/types';

/**
 * 目录树节点
 */
export interface DirectoryNode {
  name: string;
  path: string;
  children?: DirectoryNode[];
  open?: boolean;
}

export interface IFsHandler {
  /** 列出目录下的文件和文件夹 */
  listFiles(path: string): Promise<FileItem[]>;

  /** 获取目录树 */
  getDirectoryTree(path: string, maxDepth?: number): Promise<DirectoryNode[]>;

  /** 获取文件内容（预览，限制行数） */
  getFileContent(filePath: string, maxLines?: number): Promise<string>;

  /** 读取文件完整内容（编辑用） */
  readFileForEdit(filePath: string, maxSizeKB?: number): Promise<string>;

  /** 写入文件内容 */
  writeFileContent(filePath: string, content: string): Promise<void>;

  /** sudo 写入文件内容（SSH 专用，本地不支持） */
  writeFileContentSudo?(filePath: string, content: string, password: string): Promise<void>;

  /** 重命名 */
  rename(dirPath: string, oldName: string, newName: string): Promise<void>;

  /** 删除 */
  deleteFile(dirPath: string, name: string, isDir: boolean): Promise<void>;

  /** 创建目录 */
  mkdir(dirPath: string, name: string): Promise<void>;

  /** 创建空文件 */
  createFile(dirPath: string, name: string): Promise<void>;

  /** 修改权限 */
  chmod(dirPath: string, name: string, octal: string): Promise<void>;

  /** 打包文件 */
  packFiles(dirPath: string, fileNames: string[]): Promise<string>;

  /** 删除临时文件 */
  removeTempFile(tempPath: string): Promise<void>;

  /** 下载文件（远程/浏览路径 → 本地保存路径） */
  downloadFile(remotePath: string, localPath: string): Promise<string>;

  /** 下载目录（远程/浏览路径 → 本地保存路径） */
  downloadDirectory(remotePath: string, localPath: string): Promise<string>;

  /** 上传文件（本地路径 → 远程/浏览目标路径） */
  uploadFile(localPath: string, remotePath: string): Promise<string>;

  /** 上传目录（本地路径 → 远程/浏览目标路径） */
  uploadDirectory(localPath: string, remotePath: string): Promise<string>;

  /** 获取初始路径 */
  getInitialPath(): Promise<string>;

  /** 获取终端当前工作目录（用于同步文件浏览器路径） */
  getTerminalCwd?(): Promise<string | null>;
}
