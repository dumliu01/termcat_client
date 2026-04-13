import React from 'react';
import {
  Folder, RefreshCw, Upload, ChevronRight, FolderOpen
} from 'lucide-react';
import type { DirectoryNode } from '@/core/terminal/IFsHandler';
import { useT } from '../i18n';

interface TreeNodeProps {
  node: DirectoryNode;
  level: number;
  selectedTreePath: string;
  onNodeClick: (path: string) => void;
  onToggle: (node: DirectoryNode) => void;
  onDrop: (e: React.DragEvent, targetPath: string) => void;
  dragOver: 'tree' | 'list' | null;
  onDragOver: (target: 'tree' | 'list') => void;
  onDragLeave: () => void;
  onContextMenu: (e: React.MouseEvent, node: DirectoryNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(({
  node, level, selectedTreePath, onNodeClick, onToggle, onDrop, dragOver, onDragOver, onDragLeave, onContextMenu
}) => {
  // All nodes in directory tree are directories, always show expand arrow (children may not be loaded yet)
  const hasLoadedChildren = node.children && node.children.length > 0;
  const isSelected = selectedTreePath === node.path;
  // Current node is ancestor of selected path (path highlight breadcrumb effect)
  const isAncestor = !isSelected && selectedTreePath.startsWith(node.path + '/');

  return (
    <div>
      <div
        className={`relative flex items-center gap-1 py-1 cursor-pointer transition-colors ${
          (isSelected || isAncestor)
            ? ''
            : 'hover:bg-white/[0.04]'
        } ${dragOver === 'tree' ? 'bg-indigo-500/10' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px`, paddingRight: '8px' }}
        onClick={() => onNodeClick(node.path)}
        onContextMenu={(e) => onContextMenu(e, node)}
        onDrop={(e) => onDrop(e, node.path)}
        onDragOver={(e) => { e.preventDefault(); onDragOver('tree'); }}
        onDragLeave={onDragLeave}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node);
          }}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${node.open ? 'rotate-90' : ''}`}
            style={{ color: isSelected || isAncestor ? 'var(--text-main)' : 'var(--text-dim)' }} />
        </button>
        <Folder className={`w-3.5 h-3.5 shrink-0 ${
          (isSelected || isAncestor) ? 'text-amber-400' : 'text-slate-500'
        }`} />
        <span className={`text-xs truncate flex-1 ${
          (isSelected || isAncestor)
            ? 'font-semibold text-amber-300/90'
            : 'text-[var(--text-dim)]'
        }`}>
          {node.name}
        </span>
      </div>
      {node.open && hasLoadedChildren && (
        <div>
          {node.children!.map((child: DirectoryNode) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedTreePath={selectedTreePath}
              onNodeClick={onNodeClick}
              onToggle={onToggle}
              onDrop={onDrop}
              dragOver={dragOver}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export interface FileTreePanelProps {
  directoryTree: DirectoryNode[];
  selectedTreePath: string;
  isLoadingTree: boolean;
  dragOver: 'tree' | 'list' | null;
  onNodeClick: (path: string) => void;
  onToggle: (node: DirectoryNode) => void;
  onRefresh: () => void;
  onDrop: (e: React.DragEvent, targetPath: string) => void;
  onDragOver: (target: 'tree' | 'list') => void;
  onDragLeave: () => void;
  onContextMenu: (e: React.MouseEvent, node: DirectoryNode) => void;
}

export const FileTreePanel: React.FC<FileTreePanelProps> = React.memo(({
  directoryTree, selectedTreePath, isLoadingTree, dragOver,
  onNodeClick, onToggle, onRefresh, onDrop, onDragOver, onDragLeave, onContextMenu
}) => {
  const t = useT();

  return (
    <div data-testid="file-tree-panel" className="contents">
      <div className="px-3 py-2 border-b flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--bg-tab)/40', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            {t.directories}
          </span>
        </div>
        <button onClick={onRefresh} disabled={isLoadingTree} className="hover:text-primary transition">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTree ? 'animate-spin' : ''}`} style={{ color: 'var(--text-dim)' }} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto relative">
        {/* Drag overlay */}
        {dragOver === 'tree' && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10">
            <div className="text-center">
              <Upload className="w-6 h-6 text-primary mx-auto mb-1" />
              <p className="text-xs font-medium text-primary">
                {t.dropToUpload}
              </p>
            </div>
          </div>
        )}

        {isLoadingTree ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="py-2">
            {/* Root directory node — always ancestor on path, unified golden highlight */}
            <div
              className={`relative flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors hover:bg-white/[0.04] ${dragOver === 'tree' ? 'bg-indigo-500/10' : ''}`}
              onClick={() => onNodeClick('/')}
              onContextMenu={(e) => onContextMenu(e, { name: '/', path: '/' })}
              onDrop={(e) => onDrop(e, '/')}
              onDragOver={(e) => { e.preventDefault(); onDragOver('tree'); }}
              onDragLeave={onDragLeave}
            >
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="text-xs truncate flex-1 font-semibold text-amber-300/90">/</span>
            </div>
            {/* Subdirectories */}
            {directoryTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                level={0}
                selectedTreePath={selectedTreePath}
                onNodeClick={onNodeClick}
                onToggle={onToggle}
                onDrop={onDrop}
                dragOver={dragOver}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
