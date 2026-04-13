import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FileItem, ThemeType } from '@/utils/types';
import {
  Folder, FileText, RefreshCw, ArrowUp, Upload, Download,
  Check, Square, ArrowUpDown, ChevronUp, ChevronDown as ChevronDownIcon,
  Terminal
} from 'lucide-react';
import { useT } from '../i18n';

type SortKey = 'name' | 'size' | 'type' | 'mtime' | 'permission' | 'userGroup';
type SortDirection = 'asc' | 'desc';

const COL_WIDTHS_STORAGE_KEY = 'termcat-file-list-col-widths';
const MIN_COL_WIDTH = 40;

type ResizableColKey = 'name' | 'size' | 'type' | 'mtime' | 'permission' | 'userGroup';
type ColWidths = Record<ResizableColKey, number>;

const DEFAULT_COL_WIDTHS: ColWidths = {
  name: 250,
  size: 80,
  type: 70,
  mtime: 150,
  permission: 110,
  userGroup: 110,
};

function loadColWidths(): ColWidths {
  try {
    const stored = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_COL_WIDTHS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_COL_WIDTHS };
}

function saveColWidths(widths: ColWidths): void {
  try {
    localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch { /* ignore */ }
}

export interface FileListPanelProps {
  files: FileItem[];
  currentPath: string;
  isLoadingFiles: boolean;
  dragOver: 'tree' | 'list' | null;
  selectedFiles: Set<string>;
  theme: ThemeType;
  onRefresh: () => void;
  onGoToParent: () => void;
  onNavigateTo: (path: string) => void;
  onSyncTerminalPath: () => void;
  onUploadClick: () => void;
  onDownloadClick: () => void;
  onDownloadFile: (file: FileItem) => void;
  onFileDoubleClick: (file: FileItem) => void;
  onFileDragStart: (e: React.DragEvent, file: FileItem) => void;
  onListContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onBlankContextMenu: (e: React.MouseEvent) => void;
  onListDrop: (e: React.DragEvent) => void;
  onDragOver: (target: 'tree' | 'list') => void;
  onDragLeave: () => void;
  onToggleSelectAll: () => void;
  onToggleFileSelection: (fileName: string) => void;
}

const parseSizeToBytes = (size: string): number => {
  if (!size || size === '-') return 0;
  const match = size.match(/^([\d.]+)\s*([BKMGT]?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return num * (multipliers[unit] || 1);
};

export const FileListPanel: React.FC<FileListPanelProps> = React.memo(({
  files, currentPath, isLoadingFiles, dragOver, selectedFiles, theme,
  onRefresh, onGoToParent, onNavigateTo, onSyncTerminalPath, onUploadClick, onDownloadClick, onDownloadFile,
  onFileDoubleClick, onFileDragStart, onListContextMenu, onBlankContextMenu,
  onListDrop, onDragOver, onDragLeave, onToggleSelectAll, onToggleFileSelection
}) => {
  const t = useT();

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [colWidths, setColWidths] = useState<ColWidths>(loadColWidths);
  const resizingRef = useRef<{ key: ResizableColKey; startX: number; startWidth: number } | null>(null);
  const resizingKeyRef = useRef<ResizableColKey | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, key: ResizableColKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    resizingKeyRef.current = key;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !resizingKeyRef.current) return;
      // 手柄在列右边，往右拖变宽，往左拖变窄
      const delta = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(MIN_COL_WIDTH, resizingRef.current.startWidth + delta);
      setColWidths(prev => {
        const updated = { ...prev, [resizingKeyRef.current!]: newWidth };
        return updated;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColWidths(prev => {
        saveColWidths(prev);
        return prev;
      });
      resizingRef.current = null;
      resizingKeyRef.current = null;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editPath, setEditPath] = useState(currentPath);
  const pathInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditPath(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (isEditingPath && pathInputRef.current) {
      pathInputRef.current.focus();
      pathInputRef.current.select();
    }
  }, [isEditingPath]);

  const handlePathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = editPath.trim();
      if (trimmed && trimmed !== currentPath) {
        onNavigateTo(trimmed);
      }
      setIsEditingPath(false);
    } else if (e.key === 'Escape') {
      setEditPath(currentPath);
      setIsEditingPath(false);
    }
  };

  const handlePathBlur = () => {
    setEditPath(currentPath);
    setIsEditingPath(false);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedFiles = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = parseSizeToBytes(a.size) - parseSizeToBytes(b.size);
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'mtime':
          cmp = a.mtime.localeCompare(b.mtime);
          break;
        case 'permission':
          cmp = a.permission.localeCompare(b.permission);
          break;
        case 'userGroup':
          cmp = a.userGroup.localeCompare(b.userGroup);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [files, sortKey, sortDirection]);

  const sortColumns: { key: SortKey; label: string; px: string }[] = [
    { key: 'name', label: t.files.name, px: 'px-2' },
    { key: 'size', label: t.files.size, px: 'px-4' },
    { key: 'type', label: t.files.type, px: 'px-4' },
    { key: 'mtime', label: t.files.modified, px: 'px-4' },
    { key: 'permission', label: t.files.permission, px: 'px-4' },
    { key: 'userGroup', label: t.files.userGroup, px: 'px-4' },
  ];

  return (
    <div data-testid="file-list-panel" className="contents">
      {/* 文件路径工具栏 */}
      <div className="px-4 py-2 border-b flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--bg-tab)/20', borderColor: 'var(--border-color)' }}>
        <div
          className="flex-1 border rounded px-3 py-1 text-xs font-mono flex items-center gap-2 max-w-xl cursor-text"
          style={{ backgroundColor: 'var(--bg-main)', borderColor: isEditingPath ? 'var(--primary)' : 'var(--border-color)', color: 'var(--text-dim)' }}
          onClick={() => setIsEditingPath(true)}
        >
          <Folder className="w-3.5 h-3.5 text-primary opacity-60 shrink-0" />
          {isEditingPath ? (
            <input
              ref={pathInputRef}
              value={editPath}
              onChange={(e) => setEditPath(e.target.value)}
              onKeyDown={handlePathKeyDown}
              onBlur={handlePathBlur}
              className="flex-1 bg-transparent outline-none text-xs font-mono"
              style={{ color: 'var(--text-main)' }}
              spellCheck={false}
            />
          ) : (
            <span className="flex-1 truncate">{currentPath}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSyncTerminalPath(); }}
            title={t.syncTerminalPath}
            className="ml-1 p-0.5 hover:bg-primary/20 rounded transition shrink-0 group/sync"
            style={{ color: 'var(--text-dim)' }}
          >
            <Terminal className="w-3.5 h-3.5 hover:text-primary group-active/sync:scale-90 transition-all" />
          </button>
        </div>
        <div className="flex gap-4 ml-4" style={{ color: 'var(--text-dim)' }}>
          <button onClick={onRefresh} disabled={isLoadingFiles} className="hover:text-primary transition">
            <RefreshCw className={`w-3.5 h-3.5 cursor-pointer ${isLoadingFiles ? 'animate-spin' : ''}`}/>
          </button>
          <button onClick={onGoToParent} disabled={currentPath === '/'} className="hover:text-primary transition disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5 cursor-pointer"/>
          </button>
          <button onClick={onUploadClick} className="hover:text-primary transition" title={t.uploadTooltip}>
            <Upload className="w-3.5 h-3.5 cursor-pointer"/>
          </button>
          <button
            onClick={onDownloadClick}
            disabled={selectedFiles.size === 0}
            className={`transition ${selectedFiles.size > 0 ? 'hover:text-primary' : 'opacity-30 cursor-not-allowed'}`}
            title={t.downloadSelected}
          >
            <Download className="w-3.5 h-3.5 cursor-pointer"/>
          </button>
        </div>
      </div>

      {/* 文件列表表格 */}
      <div
        data-testid="file-list-area"
        className="flex-1 overflow-auto relative bg-[var(--bg-card)]"
        onDrop={onListDrop}
        onDragOver={(e) => { e.preventDefault(); onDragOver('list'); }}
        onDragLeave={onDragLeave}
        onContextMenu={onBlankContextMenu}
      >
        {/* 拖拽覆盖层 */}
        {dragOver === 'list' && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
            <div className="text-center">
              <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">
                {t.dropToUploadFiles}
              </p>
            </div>
          </div>
        )}
        {isLoadingFiles ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <table className="w-full text-left text-[11px]" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 border-b font-bold z-10" style={{ backgroundColor: theme === 'dark' ? '#1a2234' : 'var(--bg-tab)', borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}>
              <tr>
                <th className="px-2 py-2" style={{ width: 32 }}>
                  <button
                    onClick={onToggleSelectAll}
                    className="p-0.5 hover:bg-primary/20 rounded transition-colors"
                    title={t.selectAllTooltip}
                  >
                    {files.length > 0 && selectedFiles.size === files.length ? (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-primary/40" />
                    )}
                  </button>
                </th>
                {sortColumns.map(col => {
                  const isResizable = true;
                  const widthStyle = { width: colWidths[col.key as ResizableColKey] };
                  return (
                    <th
                      key={col.key}
                      className={`${col.px} py-2 cursor-pointer select-none hover:text-primary transition-colors relative`}
                      style={widthStyle}
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key ? (
                          sortDirection === 'asc'
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDownIcon className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                        )}
                      </div>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize group/resize flex items-center justify-center"
                        onMouseDown={(e) => handleResizeStart(e, col.key as ResizableColKey)}
                      >
                        {/* 可见的分隔线 */}
                        <div className="absolute right-1.5 top-2 bottom-2 w-px bg-[var(--border-color)]" />
                        {/* 三个点的视觉提示 */}
                        <div className="flex flex-col gap-0.5 opacity-20 group-hover/resize:opacity-40 transition-opacity">
                          <div className="w-1 h-1 rounded-full bg-primary" />
                          <div className="w-1 h-1 rounded-full bg-primary" />
                          <div className="w-1 h-1 rounded-full bg-primary" />
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-2" style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody style={{ borderColor: 'var(--border-color)' }}>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-dim)' }}>
                    {t.noFilesFound}
                  </td>
                </tr>
              ) : (
                sortedFiles.map(f => (
                  <tr
                    key={f.name}
                    className={`group hover:bg-primary/5 border-b cursor-pointer transition-colors ${
                      selectedFiles.has(f.name) ? 'bg-primary/10' : ''
                    }`}
                    style={{ borderColor: 'var(--border-color)' }}
                    onDoubleClick={() => onFileDoubleClick(f)}
                    onContextMenu={(e) => onListContextMenu(e, f)}
                    draggable
                    onDragStart={(e) => onFileDragStart(e, f)}
                  >
                    <td className="px-2 py-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFileSelection(f.name);
                        }}
                        className="p-0.5 hover:bg-primary/20 rounded transition-colors"
                      >
                        {selectedFiles.has(f.name) ? (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-primary/40" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {f.isDir ? (
                          <Folder className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate" style={{ color: 'var(--text-main)' }}>{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 font-mono truncate" style={{ color: 'var(--text-dim)' }}>{f.size}</td>
                    <td className="px-4 py-1.5 truncate" style={{ color: 'var(--text-dim)' }}>{f.type}</td>
                    <td className="px-4 py-1.5 truncate" style={{ color: 'var(--text-dim)' }}>{f.mtime}</td>
                    <td className="px-4 py-1.5 font-mono text-[10px] truncate" style={{ color: 'var(--text-dim)' }}>{f.permission}</td>
                    <td className="px-4 py-1.5 font-mono text-[10px] truncate" style={{ color: 'var(--text-dim)' }}>{f.userGroup}</td>
                    <td className="px-4 py-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadFile(f);
                        }}
                        className="p-1 hover:bg-primary/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title={t.downloadTooltip}
                      >
                        <Download className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
