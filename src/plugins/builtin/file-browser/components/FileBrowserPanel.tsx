import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileItem, TransferItem, ThemeType } from '@/utils/types';
import { SSHFsHandler } from '@/core/terminal/SSHFsHandler';
import type { IFsHandler, DirectoryNode } from '@/core/terminal/IFsHandler';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useI18n } from '@/base/i18n/I18nContext';
import { useT } from '../i18n';
import { FileContextMenu, ContextMenuState, INITIAL_MENU_STATE, calcMenuPosition } from './FileContextMenu';
import { FilePermissionModal } from './FilePermissionModal';
import { FileEditorModal } from './FileEditorModal';
import { InputDialog } from './InputDialog';
import { FileTreePanel } from './FileTreePanel';
import { FileListPanel } from './FileListPanel';
import { builtinPluginManager } from '@/plugins/builtin/builtin-plugin-manager';
import { FILE_BROWSER_EVENTS } from '@/plugins/builtin/events';

interface FileBrowserPanelProps {
  connectionId: string | null;
  fsHandler?: IFsHandler;
  theme: ThemeType;
  onTransferStart: (transfer: TransferItem) => void;
  isVisible: boolean;
}

export const FileBrowserPanel: React.FC<FileBrowserPanelProps> = ({
  connectionId,
  fsHandler: fsHandlerProp,
  theme,
  onTransferStart,
  isVisible
}) => {
  const { language } = useI18n();
  const t = useT();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [directoryTree, setDirectoryTree] = useState<DirectoryNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [selectedTreePath, setSelectedTreePath] = useState<string>('/');
  const [currentPath, setCurrentPath] = useState('/');
  const [dragOver, setDragOver] = useState<'tree' | 'list' | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const [fileBrowserRef, setFileBrowserRef] = useState<IFsHandler | null>(null);
  const [isDirectoryTreeLoaded, setIsDirectoryTreeLoaded] = useState(false);
  const isInitialPathSyncedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_MENU_STATE);
  const [permissionModalFile, setPermissionModalFile] = useState<FileItem | null>(null);
  const [editorState, setEditorState] = useState<{ remotePath: string; content: string } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    defaultValue: string;
    onConfirm: (value: string) => void;
  } | null>(null);

  // 左侧面板宽度管理
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = localStorage.getItem('termcat_filebrowser_treewidth');
    return saved ? Math.max(100, Math.min(parseInt(saved, 10), 400)) : 200;
  });
  const [isResizing, setIsResizing] = useState(false);

  // 处理宽度拖拽
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - containerRect.left;
      const newWidth = Math.max(100, Math.min(offsetX - 4, 400));
      setTreeWidth(newWidth);
      localStorage.setItem('termcat_filebrowser_treewidth', newWidth.toString());
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 初始化文件浏览器服务 — 优先使用 fsHandler prop（来自 IHostConnection）
  useEffect(() => {
    if (fsHandlerProp) {
      setFileBrowserRef(fsHandlerProp);
      setIsDirectoryTreeLoaded(false);
      isInitialPathSyncedRef.current = false;
    } else if (connectionId) {
      // 向后兼容：无 fsHandler 时使用旧逻辑
      const fileBrowser = new SSHFsHandler(connectionId);
      setFileBrowserRef(fileBrowser);
      setIsDirectoryTreeLoaded(false);
      isInitialPathSyncedRef.current = false;
    }
    return () => {
      setFileBrowserRef(null);
      setIsDirectoryTreeLoaded(false);
      isInitialPathSyncedRef.current = false;
    };
  }, [fsHandlerProp, connectionId]);

  // 当文件tab变为可见时，首次同步终端目录，之后切换tab时刷新文件列表
  useEffect(() => {
    if (isVisible && fileBrowserRef) {
      if (!isInitialPathSyncedRef.current) {
        isInitialPathSyncedRef.current = true;
        // 通过 fsHandler.getInitialPath() 获取初始路径（SSH: sshPwd, Local: homedir）
        fileBrowserRef.getInitialPath()
          .then(initPath => {
            loadFiles(initPath);
            logger.info(LOG_MODULE.FILE, 'filebrowser.initial_sync', 'Initial path synced', { path: initPath });
          })
          .catch(() => {
            loadFiles('/');
          });
      } else if (currentPath) {
        loadFiles(currentPath);
      }
    }
  }, [isVisible, fileBrowserRef, connectionId]);

  // 目录树加载（独立于文件列表加载，避免触发文件列表重载）
  useEffect(() => {
    if (isVisible && fileBrowserRef && !isDirectoryTreeLoaded) {
      loadDirectoryTree();
    }
  }, [isVisible, fileBrowserRef, isDirectoryTreeLoaded]);

  // 添加全局拖拽事件监听器
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      logger.debug(LOG_MODULE.FILE, 'filebrowser.drop', 'Global drop event', { files: e.dataTransfer?.files });
    };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  // ─── Data loading ───

  /**
   * 懒加载：获取某个目录的直接子目录（depth=1），并插入到树中
   */
  const loadChildrenForNode = useCallback(async (parentPath: string): Promise<DirectoryNode[]> => {
    if (!fileBrowserRef) return [];
    try {
      return await fileBrowserRef.getDirectoryTree(parentPath, 1);
    } catch {
      return [];
    }
  }, [fileBrowserRef]);

  /**
   * 展开树中 targetPath 的所有祖先节点。
   * 对于不在树中的路径段，逐级懒加载子目录。
   */
  const expandTreeToPath = useCallback(async (targetPath: string) => {
    if (targetPath === '/' || !fileBrowserRef) return;

    // 将路径拆解为逐级前缀：/a/b/c → ['/a', '/a/b', '/a/b/c']
    const parts = targetPath.split('/').filter(Boolean);
    const ancestorPaths = parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'));

    const findNode = (nodes: DirectoryNode[], path: string): DirectoryNode | null => {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children && path.startsWith(n.path + '/')) {
          const found = findNode(n.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    // 逐级检查并加载缺失的节点
    let currentTree: DirectoryNode[] = [];
    setDirectoryTree(prev => { currentTree = prev; return prev; });

    for (let i = 0; i < ancestorPaths.length; i++) {
      const ap = ancestorPaths[i];
      if (!findNode(currentTree, ap)) {
        // 缺失节点 → 加载其父目录的子目录
        const parentPath = i > 0 ? ancestorPaths[i - 1] : '/';
        const children = await loadChildrenForNode(parentPath);
        if (children.length === 0) break;

        // 将加载的子目录插入到树中
        const insertChildren = (nodes: DirectoryNode[]): DirectoryNode[] =>
          nodes.map(n => {
            if (n.path === parentPath) {
              // 合并：保留已有子节点，添加新发现的
              const existingNames = new Set((n.children || []).map(c => c.name));
              const merged = [...(n.children || [])];
              for (const child of children) {
                if (!existingNames.has(child.name)) merged.push(child);
              }
              merged.sort((a, b) => a.name.localeCompare(b.name));
              return { ...n, open: true, children: merged };
            }
            if (n.children && parentPath.startsWith(n.path + '/')) {
              return { ...n, children: insertChildren(n.children) };
            }
            return n;
          });

        if (parentPath === '/') {
          // 根级别：合并到顶层
          const existingNames = new Set(currentTree.map(c => c.name));
          const merged = [...currentTree];
          for (const child of children) {
            if (!existingNames.has(child.name)) merged.push(child);
          }
          merged.sort((a, b) => a.name.localeCompare(b.name));
          currentTree = merged;
        } else {
          currentTree = insertChildren(currentTree);
        }
        setDirectoryTree(currentTree);
      }
    }

    // 展开所有祖先
    setDirectoryTree(prev => {
      const expandAncestors = (nodes: DirectoryNode[]): DirectoryNode[] =>
        nodes.map(n => {
          const isAncestor = targetPath === n.path || targetPath.startsWith(n.path + '/');
          const children = n.children ? expandAncestors(n.children) : n.children;
          if (isAncestor && !n.open) return { ...n, open: true, children };
          if (children !== n.children) return { ...n, children };
          return n;
        });
      return expandAncestors(prev);
    });
  }, [fileBrowserRef, loadChildrenForNode]);

  const loadFiles = useCallback(async (path: string) => {
    if (!fileBrowserRef) return;
    try {
      setIsLoadingFiles(true);
      const fileList = await fileBrowserRef.listFiles(path);
      setFiles(fileList);
      setCurrentPath(path);
      setSelectedTreePath(path);
      await expandTreeToPath(path);
      logger.debug(LOG_MODULE.FILE, 'filebrowser.files.loaded', 'Loaded files for path', { path, count: fileList.length });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'filebrowser.files.load_failed', 'Failed to load files', { error: error instanceof Error ? error.message : 'Unknown error' });
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [fileBrowserRef, expandTreeToPath]);

  const loadDirectoryTree = useCallback(async () => {
    if (!fileBrowserRef) return;
    try {
      setIsLoadingTree(true);
      // 只加载根目录的直接子目录（depth=1），后续按需懒加载
      const tree = await fileBrowserRef.getDirectoryTree('/', 1);
      setDirectoryTree(tree);
      setIsDirectoryTreeLoaded(true);
      logger.debug(LOG_MODULE.FILE, 'filebrowser.tree.loaded', 'Loaded root directory tree', { count: tree.length });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'filebrowser.tree.load_failed', 'Failed to load directory tree', { error: error instanceof Error ? error.message : 'Unknown error' });
      setDirectoryTree([]);
    } finally {
      setIsLoadingTree(false);
    }
  }, [fileBrowserRef]);

  // ─── Tree handlers ───

  const handleTreeNodeClick = useCallback((path: string) => {
    loadFiles(path);
  }, [loadFiles]);

  const toggleTreeNode = useCallback(async (node: DirectoryNode) => {
    if (node.open) {
      // 收起：直接 toggle
      const collapse = (nodes: DirectoryNode[]): DirectoryNode[] =>
        nodes.map(n => {
          if (n.path === node.path) return { ...n, open: false };
          if (n.children) return { ...n, children: collapse(n.children) };
          return n;
        });
      setDirectoryTree(prev => collapse(prev));
      return;
    }

    // 展开：如果子节点为空或未加载，先懒加载
    const needsLoad = !node.children || node.children.length === 0;
    let loadedChildren: DirectoryNode[] | null = null;
    if (needsLoad) {
      loadedChildren = await loadChildrenForNode(node.path);
    }

    const expand = (nodes: DirectoryNode[]): DirectoryNode[] =>
      nodes.map(n => {
        if (n.path === node.path) {
          return {
            ...n,
            open: true,
            children: loadedChildren !== null ? loadedChildren : n.children,
          };
        }
        if (n.children) return { ...n, children: expand(n.children) };
        return n;
      });
    setDirectoryTree(prev => expand(prev));
  }, [loadChildrenForNode]);

  // ─── File list handlers ───
  // 使用 ref 保存 currentPath，避免 useCallback 依赖频繁变化的值
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const handleRefreshFiles = useCallback(() => {
    loadFiles(currentPathRef.current);
    loadDirectoryTree();
  }, [loadFiles, loadDirectoryTree]);

  const handleFileDoubleClick = useCallback(async (file: FileItem) => {
    const cp = currentPathRef.current;
    if (file.isDir) {
      const newPath = cp === '/' ? `/${file.name}` : `${cp}/${file.name}`;
      loadFiles(newPath);
    } else if (fileBrowserRef) {
      const remotePath = cp === '/' ? `/${file.name}` : `${cp}/${file.name}`;
      try {
        const content = await fileBrowserRef.readFileForEdit(remotePath);
        setEditorState({ remotePath, content });
      } catch (error: any) {
        logger.error(LOG_MODULE.FILE, 'file.open.failed', 'Failed to open file', { error: error?.message });
        alert(t.editor.loadFailed.replace('{error}', error?.message || 'Unknown error'));
      }
    }
  }, [fileBrowserRef, loadFiles, t]);

  /** 发出传输记录事件，供 TransferManager 展示 */
  const emitTransfer = useCallback((transferId: string, type: 'upload' | 'download', localPath: string, remotePath: string) => {
    // 本地复制（transferId 以 local-copy 开头）已同步完成，直接标记 completed
    const isLocal = transferId.startsWith('local-copy');
    const name = remotePath.split('/').pop() || 'transfer';
    builtinPluginManager.emit(FILE_BROWSER_EVENTS.TRANSFER_START, {
      id: transferId,
      name,
      size: '-',
      sizeBytes: 0,
      progress: isLocal ? 100 : 0,
      transferred: 0,
      speed: isLocal ? '-' : '0 B/s',
      type,
      status: isLocal ? 'completed' : 'running',
      timestamp: new Date().toLocaleString(),
      localPath,
      remotePath,
    } as TransferItem);
  }, []);

  const handleGoToParent = useCallback(() => {
    const cp = currentPathRef.current;
    if (cp === '/') return;
    const parentPath = cp.substring(0, cp.lastIndexOf('/')) || '/';
    loadFiles(parentPath);
  }, [loadFiles]);

  const handleSyncTerminalPath = useCallback(async () => {
    if (!fileBrowserRef) return;
    try {
      // 通过 fsHandler.getTerminalCwd() 获取终端当前目录（兼容 SSH 和 Local）
      const pwd = fileBrowserRef.getTerminalCwd
        ? await fileBrowserRef.getTerminalCwd()
        : await fileBrowserRef.getInitialPath();

      if (pwd && pwd.startsWith('/')) {
        loadFiles(pwd);
        logger.info(LOG_MODULE.FILE, 'filebrowser.sync_terminal_path', 'Synced path from terminal', { pwd });
      }
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'filebrowser.sync_terminal_path.failed', 'Failed to sync terminal path', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [fileBrowserRef, loadFiles]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // ─── Drag & drop upload ───

  const detectDirectoryDrag = (droppedFiles: File[], filesWithPaths: { file: File; localPath: string; webkitRelativePath: string; name: string }[]) => {
    let hasDirectoryDrag = false;
    const directoryRoots = new Set<string>();

    const hasRelativePathStructure = filesWithPaths.some(f => f.webkitRelativePath.includes('/'));
    if (hasRelativePathStructure) {
      hasDirectoryDrag = true;
      filesWithPaths.forEach(({ webkitRelativePath }) => {
        if (webkitRelativePath.includes('/')) {
          directoryRoots.add(webkitRelativePath.split('/')[0]);
        }
      });
    }

    if (!hasDirectoryDrag && droppedFiles.length === 1) {
      const file = droppedFiles[0];
      if ((file as any).webkitGetAsEntry) {
        try {
          const entry = (file as any).webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            hasDirectoryDrag = true;
            directoryRoots.add(file.name);
          }
        } catch (e) {
          logger.debug(LOG_MODULE.FILE, 'filebrowser.webkitentry.check', 'webkitGetAsEntry check failed', { error: e });
        }
      }
    }

    if (!hasDirectoryDrag && droppedFiles.length === 1) {
      const file = droppedFiles[0];
      if (!file.name.includes('.') && file.type === '') {
        hasDirectoryDrag = true;
        directoryRoots.add(file.name);
      }
    }

    return { hasDirectoryDrag, directoryRoots };
  };

  const handleTreeDrop = async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!fileBrowserRef) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const filesWithPaths = droppedFiles.map(file => ({
      file, localPath: (file as any).path, webkitRelativePath: (file as any).webkitRelativePath || '', name: file.name
    }));

    const { hasDirectoryDrag, directoryRoots } = detectDirectoryDrag(droppedFiles, filesWithPaths);

    if (hasDirectoryDrag && directoryRoots.size > 0) {
      await handleDirectoryDrop(filesWithPaths, targetPath, directoryRoots);
    } else {
      await handleFileDrop(droppedFiles, targetPath);
    }
  };

  const handleDirectoryDrop = async (filesWithPaths: any[], targetPath: string, directoryRoots: Set<string>) => {
    logger.debug(LOG_MODULE.FILE, 'filebrowser.upload.dir_start', 'Processing directory drag', { rootDirs: Array.from(directoryRoots) });

    for (const rootDir of directoryRoots) {
      try {
        let localDirPath: string | undefined = undefined;

        const dirFiles = filesWithPaths.filter(f => f.webkitRelativePath.startsWith(rootDir + '/'));
        if (dirFiles.length > 0) {
          const localFilePath = dirFiles[0].localPath;
          if (localFilePath) {
            const lastSlashIndex = localFilePath.lastIndexOf('/');
            localDirPath = lastSlashIndex > 0 ? localFilePath.substring(0, lastSlashIndex) : localFilePath;
            const candidateDir = localDirPath as string;
            if (!candidateDir.endsWith('/' + rootDir) && !candidateDir.endsWith(rootDir)) {
              localDirPath = localFilePath.substring(0, localFilePath.lastIndexOf('/' + rootDir) + rootDir.length + 1);
            }
          }
        }

        if (!localDirPath) {
          const directDirFile = filesWithPaths.find(f => f.name === rootDir && f.localPath);
          if (directDirFile) localDirPath = directDirFile.localPath;
        }

        if (!localDirPath) {
          logger.error(LOG_MODULE.FILE, 'filebrowser.upload.dir_path_missing', 'Cannot determine local directory path', { rootDir });
          continue;
        }

        const remoteDirPath = `${targetPath}/${rootDir}`;
        const transferId = await fileBrowserRef!.uploadDirectory(localDirPath as string, remoteDirPath);
        emitTransfer(transferId, 'upload', localDirPath as string, remoteDirPath);
        logger.debug(LOG_MODULE.FILE, 'filebrowser.upload.dir_started', 'Directory transfer started', { transferId });
      } catch (error: any) {
        logger.error(LOG_MODULE.FILE, 'filebrowser.upload.dir_failed', 'Directory upload failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        alert(t.errors.directoryUploadFailed.replace('{error}', error.message || 'Directory upload failed'));
      }
    }
  };

  const handleFileDrop = async (droppedFiles: File[], targetPath: string) => {
    for (const file of droppedFiles) {
      let localPath = (file as any).path;
      if (!localPath && (file as any).webkitGetAsEntry) {
        const entry = (file as any).webkitGetAsEntry();
        if (entry) localPath = entry.fullPath || entry.name;
      }

      if (!localPath) {
        logger.error(LOG_MODULE.FILE, 'filebrowser.file.no_path', 'No valid path available', { fileName: file.name });
        continue;
      }

      try {
        const remotePath = `${targetPath}/${file.name}`;
        const transferId = await fileBrowserRef!.uploadFile(localPath, remotePath);
        emitTransfer(transferId, 'upload', localPath, remotePath);
        logger.debug(LOG_MODULE.FILE, 'filebrowser.file.started', 'File transfer started', { transferId });
      } catch (error: any) {
        logger.error(LOG_MODULE.FILE, 'filebrowser.file.upload_failed', 'File upload failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        alert(`File upload failed: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const handleListDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    if (!fileBrowserRef) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    const filesWithPaths = droppedFiles.map(file => ({
      file, localPath: (file as any).path, webkitRelativePath: (file as any).webkitRelativePath || '', name: file.name
    }));

    const { hasDirectoryDrag, directoryRoots } = detectDirectoryDrag(droppedFiles, filesWithPaths);

    if (hasDirectoryDrag && directoryRoots.size > 0) {
      await handleDirectoryDrop(filesWithPaths, currentPathRef.current, directoryRoots);
    } else {
      await handleFileDrop(droppedFiles, currentPathRef.current);
    }
  }, [fileBrowserRef]);

  const handleDragOver = useCallback((target: 'tree' | 'list') => setDragOver(target), []);
  const handleDragLeave = useCallback(() => setDragOver(null), []);

  // ─── Download ───

  const handleDownload = useCallback(async (file: FileItem) => {
    if (!fileBrowserRef) return;
    try {
      const cp = currentPathRef.current;
      const remotePath = cp === '/' ? `/${file.name}` : `${cp}/${file.name}`;
      const result = await (window as any).electron.showSaveDialog({
        title: t.dialogs.chooseSaveLocation,
        defaultPath: file.name,
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });
      if (result.canceled || !result.filePath) return;

      const transferId = file.isDir
        ? await fileBrowserRef.downloadDirectory(remotePath, result.filePath)
        : await fileBrowserRef.downloadFile(remotePath, result.filePath);
      emitTransfer(transferId, 'download', result.filePath, remotePath);

      logger.debug(LOG_MODULE.FILE, 'filebrowser.download.started', 'Download started', { transferId });
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'Download error:', error);
    }
  }, [fileBrowserRef, emitTransfer, t]);

  const handleUploadClick = useCallback(async () => {
    if (!fileBrowserRef) return;
    try {
      const result = await (window as any).electron.showOpenDialog({
        title: t.dialogs.selectFilesToUpload,
        buttonLabel: t.dialogs.select,
        properties: ['multiSelections', 'openFile', 'openDirectory']
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;

      for (const localPath of result.filePaths) {
        const isDirectory = !localPath.endsWith('/') && !/\.[a-zA-Z0-9]+$/.test(localPath.split('/').pop() || '');
        const pathParts = localPath.split('/');
        const name = isDirectory
          ? (pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2])
          : (localPath.split('/').pop() || '');
        const remoteDirPath = `${currentPathRef.current}/${name}`;

        try {
          const transferId = isDirectory
            ? await fileBrowserRef.uploadDirectory(localPath, remoteDirPath)
            : await fileBrowserRef.uploadFile(localPath, remoteDirPath);
          emitTransfer(transferId, 'upload', localPath, remoteDirPath);
          logger.debug(LOG_MODULE.FILE, 'Upload started with ID:', transferId);
        } catch (error: any) {
          logger.error(LOG_MODULE.FILE, 'Upload error:', error);
          alert(t.errors.uploadFailed.replace('{error}', error.message));
        }
      }
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'Open dialog error:', error);
    }
  }, [fileBrowserRef, loadFiles, t]);

  const selectedFilesRef = useRef(selectedFiles);
  selectedFilesRef.current = selectedFiles;

  const handleDownloadClick = useCallback(async () => {
    const curSelectedFiles = selectedFilesRef.current;
    const curFiles = filesRef.current;
    const cp = currentPathRef.current;
    if (!fileBrowserRef || curSelectedFiles.size === 0) return;

    let targetDirectory: string | null = null;
    if (curSelectedFiles.size === 1) {
      const fileName = Array.from(curSelectedFiles)[0];
      const result = await (window as any).electron.showSaveDialog({
        title: t.dialogs.chooseSaveLocation,
        defaultPath: fileName,
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });
      if (result.canceled || !result.filePath) return;
      targetDirectory = result.filePath;
    } else {
      const result = await (window as any).electron.showOpenDialog({
        title: t.dialogs.chooseSaveDirectory,
        buttonLabel: t.dialogs.select,
        properties: ['openDirectory', 'createDirectory']
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
      targetDirectory = result.filePaths[0];
    }

    for (const fileName of curSelectedFiles) {
      const file = curFiles.find(f => f.name === fileName);
      if (!file) continue;
      const remotePath = cp === '/' ? `/${file.name}` : `${cp}/${file.name}`;
      const localPath = curSelectedFiles.size === 1 ? targetDirectory! : `${targetDirectory}/${file.name}`;
      try {
        const transferId = file.isDir
          ? await fileBrowserRef.downloadDirectory(remotePath, localPath)
          : await fileBrowserRef.downloadFile(remotePath, localPath);
        emitTransfer(transferId, 'download', localPath, remotePath);
        logger.debug(LOG_MODULE.FILE, 'filebrowser.download.started', 'Download started', { transferId });
      } catch (error: any) {
        logger.error(LOG_MODULE.FILE, 'Download error:', error);
        alert(t.errors.downloadFailed.replace('{error}', error.message));
      }
    }
    setSelectedFiles(new Set());
  }, [fileBrowserRef, t]);

  // ─── Selection ───

  const toggleFileSelection = useCallback((fileName: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) { newSet.delete(fileName); } else { newSet.add(fileName); }
      return newSet;
    });
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;

  const toggleSelectAll = useCallback(() => {
    setSelectedFiles(prev => {
      if (prev.size === filesRef.current.length) {
        return new Set<string>();
      } else {
        return new Set(filesRef.current.map(f => f.name));
      }
    });
  }, []);

  // ─── File drag out ───

  const handleFileDragStart = useCallback((e: React.DragEvent, file: FileItem) => {
    e.dataTransfer.effectAllowed = 'copy';
    const cp = currentPathRef.current;
    const remotePath = cp === '/' ? `/${file.name}` : `${cp}/${file.name}`;
    e.dataTransfer.setData('remote-file', JSON.stringify({
      remotePath, fileName: file.name, isDir: file.isDir, connectionId
    }));
  }, [connectionId]);

  // ─── Context menu ───

  const handleTreeContextMenu = useCallback((e: React.MouseEvent, node: DirectoryNode) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = calcMenuPosition(e, 'tree', 9, 13);
    const fileItem: FileItem = { name: node.name, size: '-', type: '', mtime: '', permission: '', userGroup: '', isDir: true };
    setContextMenu({ x, y, visible: true, file: fileItem, targetPath: node.path, source: 'tree' });
  }, []);

  const handleListContextMenu = useCallback((e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = calcMenuPosition(e, 'list', 9, 13);
    setContextMenu({ x, y, visible: true, file, targetPath: currentPathRef.current, source: 'list' });
  }, []);

  const handleListBlankContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = calcMenuPosition(e, 'list', 9, 13);
    setContextMenu({ x, y, visible: true, file: null, targetPath: currentPathRef.current, source: 'list' });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const handleMenuAction = useCallback(async (actionId: string, file: FileItem | null, targetPath: string, source: 'tree' | 'list') => {
    closeContextMenu();

    switch (actionId) {
      case 'refresh':
        loadFiles(source === 'tree' ? targetPath : currentPath);
        loadDirectoryTree();
        break;
      case 'open':
      case 'open-with-editor': {
        if (!file || file.isDir || !fileBrowserRef) break;
        const openPath = targetPath === '/' ? `/${file.name}` : `${targetPath}/${file.name}`;
        try {
          const content = await fileBrowserRef.readFileForEdit(openPath);
          setEditorState({ remotePath: openPath, content });
          logger.info(LOG_MODULE.FILE, 'file.open.editor', 'Opened file in editor', { remotePath: openPath });
        } catch (error: any) {
          logger.error(LOG_MODULE.FILE, 'file.open.failed', 'Failed to open file', { error: error?.message });
          alert(t.editor.loadFailed.replace('{error}', error?.message || 'Unknown error'));
        }
        break;
      }
      case 'copy-path': {
        const fullPath = file
          ? (targetPath === '/' ? `/${file.name}` : `${targetPath}/${file.name}`)
          : targetPath;
        try { await navigator.clipboard.writeText(fullPath); } catch { /* fallback */ }
        break;
      }
      case 'download':
        if (file) handleDownload(file);
        break;
      case 'upload':
        handleUploadClick();
        break;
      case 'new-folder': {
        if (!fileBrowserRef) break;
        const mkdirPath = source === 'tree' ? targetPath : currentPath;
        setInputDialog({
          title: t.inputPrompt.newFolderName,
          defaultValue: t.inputPrompt.defaultFolderName,
          onConfirm: async (folderName) => {
            setInputDialog(null);
            try {
              await fileBrowserRef.mkdir(mkdirPath, folderName);
              loadFiles(mkdirPath);
              loadDirectoryTree();
            } catch (error) {
              logger.error(LOG_MODULE.FILE, 'file.mkdir.failed', 'Failed to create folder', { error: error instanceof Error ? error.message : 'Unknown' });
            }
          }
        });
        break;
      }
      case 'new-file': {
        if (!fileBrowserRef) break;
        setInputDialog({
          title: t.inputPrompt.newFileName,
          defaultValue: t.inputPrompt.defaultFileName,
          onConfirm: async (fileName) => {
            setInputDialog(null);
            try {
              await fileBrowserRef.createFile(currentPath, fileName);
              loadFiles(currentPath);
            } catch (error) {
              logger.error(LOG_MODULE.FILE, 'file.create.failed', 'Failed to create file', { error: error instanceof Error ? error.message : 'Unknown' });
            }
          }
        });
        break;
      }
      case 'rename': {
        if (!file || !fileBrowserRef) break;
        // 树节点: targetPath 是节点自身路径，需要取父目录
        const renameDir = source === 'tree'
          ? (targetPath.substring(0, targetPath.lastIndexOf('/')) || '/')
          : targetPath;
        setInputDialog({
          title: t.inputPrompt.renameTo,
          defaultValue: file.name,
          onConfirm: async (newName) => {
            setInputDialog(null);
            if (newName === file.name) return;
            try {
              await fileBrowserRef.rename(renameDir, file.name, newName);
              loadFiles(source === 'tree' ? renameDir : currentPath);
              loadDirectoryTree();
            } catch (error) {
              logger.error(LOG_MODULE.FILE, 'file.rename.failed', 'Failed to rename', { error: error instanceof Error ? error.message : 'Unknown' });
            }
          }
        });
        break;
      }
      case 'delete': {
        if (!file || !fileBrowserRef) break;
        const confirmed = window.confirm(t.confirmDelete.replace('{name}', file.name));
        if (confirmed) {
          try {
            await fileBrowserRef.deleteFile(targetPath, file.name, file.isDir);
            loadFiles(source === 'tree' ? targetPath : currentPath);
            loadDirectoryTree();
          } catch (error) {
            logger.error(LOG_MODULE.FILE, 'file.delete.failed', 'Failed to delete', { error: error instanceof Error ? error.message : 'Unknown' });
          }
        }
        break;
      }
      case 'fast-delete': {
        if (!file || !fileBrowserRef) break;
        try {
          await fileBrowserRef.deleteFile(targetPath, file.name, file.isDir);
          loadFiles(source === 'tree' ? targetPath : currentPath);
          loadDirectoryTree();
        } catch (error) {
          logger.error(LOG_MODULE.FILE, 'file.fast_delete.failed', 'Failed to fast delete', { error: error instanceof Error ? error.message : 'Unknown' });
        }
        break;
      }
      case 'permission':
        if (file) setPermissionModalFile(file);
        break;
      case 'pack': {
        if (!connectionId || !fileBrowserRef) break;
        // 优先使用勾选的文件，否则使用右键点击的文件
        const fileNames = selectedFiles.size > 0
          ? Array.from(selectedFiles)
          : (file ? [file.name] : []);
        if (fileNames.length === 0) break;
        try {
          const remoteTarPath = await fileBrowserRef.packFiles(currentPath, fileNames);
          const defaultName = fileNames.length === 1
            ? `${fileNames[0]}.tar.gz`
            : `termcat_pack_${Date.now()}.tar.gz`;
          const result = await (window as any).electron.showSaveDialog({
            title: t.dialogs.chooseSaveLocation,
            defaultPath: defaultName,
            filters: [{ name: 'Archive', extensions: ['tar.gz', 'tgz'] }],
            properties: ['createDirectory', 'showOverwriteConfirmation']
          });
          if (result.canceled || !result.filePath) {
            await fileBrowserRef.removeTempFile(remoteTarPath);
            break;
          }
          try {
            const packTransferId = await fileBrowserRef.downloadFile(remoteTarPath, result.filePath);
            emitTransfer(packTransferId, 'download', result.filePath, remoteTarPath);
            logger.info(LOG_MODULE.FILE, 'file.pack_download.started', 'Pack download started', { remoteTarPath, localPath: result.filePath });
          } finally {
            await fileBrowserRef.removeTempFile(remoteTarPath);
          }
        } catch (error: any) {
          logger.error(LOG_MODULE.FILE, 'file.pack.failed', 'Pack transfer failed', { error: error instanceof Error ? error.message : 'Unknown error' });
          alert(t.errors.packFailed.replace('{error}', error.message || 'Unknown error'));
        }
        break;
      }
      default:
        logger.info(LOG_MODULE.FILE, 'file.menu_action', 'Menu action', { actionId, file: file?.name });
        break;
    }
  }, [closeContextMenu, currentPath, fileBrowserRef, loadFiles, loadDirectoryTree, handleDownload, handleUploadClick, t]);

  const handlePermissionConfirm = useCallback(async (octal: string) => {
    if (!permissionModalFile || !fileBrowserRef) return;
    try {
      await fileBrowserRef.chmod(currentPath, permissionModalFile.name, octal);
      loadFiles(currentPath);
      logger.info(LOG_MODULE.FILE, 'file.chmod.success', 'Permission changed', { file: permissionModalFile.name, octal });
    } catch (error) {
      logger.error(LOG_MODULE.FILE, 'file.chmod.failed', 'Failed to change permission', { error: error instanceof Error ? error.message : 'Unknown' });
    }
    setPermissionModalFile(null);
  }, [permissionModalFile, fileBrowserRef, currentPath, loadFiles]);

  const handleEditorSave = useCallback(async (content: string) => {
    if (!editorState || !fileBrowserRef) return;
    try {
      await fileBrowserRef.writeFileContent(editorState.remotePath, content);
      logger.info(LOG_MODULE.FILE, 'file.editor.save.success', 'File saved from editor', { remotePath: editorState.remotePath });
      loadFiles(currentPath);
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.editor.save.failed', 'Failed to save file', { error: error?.message });
      alert(t.editor.saveFailed.replace('{error}', error?.message || 'Unknown error'));
      throw error;
    }
  }, [editorState, fileBrowserRef, currentPath, loadFiles, t]);

  const handleEditorSudoSave = useCallback(async (content: string, password: string) => {
    if (!editorState || !fileBrowserRef) return;
    try {
      if (!fileBrowserRef.writeFileContentSudo) {
        throw new Error('Sudo save is not supported in local mode');
      }
      await fileBrowserRef.writeFileContentSudo(editorState.remotePath, content, password);
      logger.info(LOG_MODULE.FILE, 'file.editor.sudo_save.success', 'File saved with sudo from editor', { remotePath: editorState.remotePath });
      loadFiles(currentPath);
    } catch (error: any) {
      logger.error(LOG_MODULE.FILE, 'file.editor.sudo_save.failed', 'Failed to sudo save file', { error: error?.message });
      alert(t.editor.saveFailed.replace('{error}', error?.message || 'Unknown error'));
      throw error;
    }
  }, [editorState, fileBrowserRef, currentPath, loadFiles, t]);

  // ─── Render ───

  return (
    <div ref={containerRef} className="flex h-full animate-in fade-in duration-200 overflow-hidden bg-[var(--bg-card)]">
      {/* 左侧目录树 */}
      <div
        className="border-r flex flex-col overflow-hidden shrink-0"
        style={{
          width: `${treeWidth}px`,
          minWidth: '100px',
          borderColor: 'var(--border-color)',
          backgroundColor: 'var(--bg-sidebar)/30'
        }}
      >
        <FileTreePanel
          directoryTree={directoryTree}
          selectedTreePath={selectedTreePath}
          isLoadingTree={isLoadingTree}
          dragOver={dragOver}
          onNodeClick={handleTreeNodeClick}
          onToggle={toggleTreeNode}
          onRefresh={loadDirectoryTree}
          onDrop={handleTreeDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onContextMenu={handleTreeContextMenu}
        />
      </div>

      {/* 宽度分割器 */}
      <div
        className="w-1.5 h-full cursor-col-resize z-10 relative group flex items-center justify-center transition-all shrink-0 hover:bg-white/10"
        onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
      >
        <div className="w-0.5 h-6 rounded-full bg-white/20 group-hover:bg-white/30 group-hover:scale-y-110 transition-all" />
      </div>

      {/* 右侧文件列表 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <FileListPanel
          files={files}
          currentPath={currentPath}
          isLoadingFiles={isLoadingFiles}
          dragOver={dragOver}
          selectedFiles={selectedFiles}
          theme={theme}
          onRefresh={handleRefreshFiles}
          onGoToParent={handleGoToParent}
          onNavigateTo={loadFiles}
          onSyncTerminalPath={handleSyncTerminalPath}
          onUploadClick={handleUploadClick}
          onDownloadClick={handleDownloadClick}
          onDownloadFile={handleDownload}
          onFileDoubleClick={handleFileDoubleClick}
          onFileDragStart={handleFileDragStart}
          onListContextMenu={handleListContextMenu}
          onBlankContextMenu={handleListBlankContextMenu}
          onListDrop={handleListDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onToggleSelectAll={toggleSelectAll}
          onToggleFileSelection={toggleFileSelection}
        />
      </div>

      {/* Context Menu */}
      <FileContextMenu
        menu={contextMenu}
        selectedFilesCount={selectedFiles.size}
        onClose={closeContextMenu}
        onAction={handleMenuAction}
      />

      {/* Permission Modal */}
      {permissionModalFile && (
        <FilePermissionModal
          file={permissionModalFile}
          onClose={() => setPermissionModalFile(null)}
          onConfirm={handlePermissionConfirm}
        />
      )}

      {/* File Editor Modal */}
      {editorState && (
        <FileEditorModal
          remotePath={editorState.remotePath}
          initialContent={editorState.content}
          theme={theme}
          onClose={() => setEditorState(null)}
          onSave={handleEditorSave}
          onSudoSave={handleEditorSudoSave}
        />
      )}

      {/* Input Dialog */}
      {inputDialog && (
        <InputDialog
          title={inputDialog.title}
          defaultValue={inputDialog.defaultValue}
          onConfirm={inputDialog.onConfirm}
          onCancel={() => setInputDialog(null)}
        />
      )}
    </div>
  );
};
