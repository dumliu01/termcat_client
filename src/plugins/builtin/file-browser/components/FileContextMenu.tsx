import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { FileItem } from '@/utils/types';
import { useT } from '../i18n';

export interface MenuItem {
  id: string;
  label: string;
  section: number;
  hasSub?: boolean;
  disabledForDir?: boolean;
  isDivider?: boolean;
  subItems?: MenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
  file: FileItem | null;
  targetPath: string;
  source: 'tree' | 'list';
}

export const INITIAL_MENU_STATE: ContextMenuState = {
  x: 0, y: 0, visible: false, file: null, targetPath: '', source: 'list'
};

interface FileContextMenuProps {
  menu: ContextMenuState;
  selectedFilesCount: number;
  onClose: () => void;
  onAction: (actionId: string, file: FileItem | null, targetPath: string, source: 'tree' | 'list') => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({ menu, selectedFilesCount, onClose, onAction }) => {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);

  const cm = t.contextMenu;

  const treeMenuItems: MenuItem[] = useMemo(() => [
    { id: 'refresh', label: cm.refresh, section: 1 },
    { id: 'new-folder', label: cm.newFolder, section: 2 },
    { id: 'rename', label: cm.rename, section: 2 },
    { id: 'delete', label: cm.delete, section: 2 },
    { id: 'copy-path', label: cm.copyPath, section: 3 },
    { id: 'download', label: cm.download, section: 4 },
    { id: 'upload', label: cm.upload, section: 4 },
    { id: 'permission', label: cm.permission, section: 5 },
  ], [cm]);

  const listMenuItems: MenuItem[] = useMemo(() => [
    { id: 'refresh', label: cm.refresh, section: 1 },
    { id: 'open', label: cm.open, section: 2, disabledForDir: true },
    { id: 'copy-path', label: cm.copyPath, section: 3 },
    { id: 'download', label: cm.download, section: 4 },
    { id: 'upload', label: cm.upload, section: 4 },
    { id: 'pack', label: cm.packTransfer, section: 5 },
    {
      id: 'new', label: cm.newMenu, section: 6, hasSub: true,
      subItems: [
        { id: 'new-file', label: cm.newFile, section: 1 },
        { id: 'new-folder', label: cm.newFolder, section: 1 },
      ]
    },
    { id: 'rename', label: cm.rename, section: 7 },
    { id: 'delete', label: cm.delete, section: 7 },
    { id: 'permission', label: cm.permission, section: 8 },
  ], [cm]);

  useEffect(() => {
    const handleClick = () => onClose();
    const handleScroll = () => { if (menu.visible) onClose(); };

    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleClick);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu.visible, onClose]);

  useEffect(() => {
    setActiveSubMenuId(null);
  }, [menu.visible]);

  if (!menu.visible) return null;

  const activeMenuItems = menu.source === 'tree' ? treeMenuItems : listMenuItems;

  const renderSubMenu = (item: MenuItem, parentX: number, parentY: number, parentIdx: number) => {
    if (!item.subItems) return null;
    const subWidth = 180;
    let subX = parentX + 178;
    if (subX + subWidth > window.innerWidth) {
      subX = parentX - subWidth + 2;
    }
    const itemsBefore = activeMenuItems.slice(0, parentIdx);
    const sectionCountBefore = new Set(itemsBefore.map(i => i.section)).size;
    const dividerCount = Math.max(0, sectionCountBefore - 1);
    const yOffset = (parentIdx * 30) + (dividerCount * 9) + 4;

    return (
      <div
        style={{ top: `${parentY + yOffset}px`, left: `${subX}px`, borderColor: 'var(--border-color)' }}
        className="fixed z-[510] w-[180px] bg-[var(--bg-card)] border shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-75 rounded-sm"
      >
        {item.subItems.map((sub, idx) => {
          const showDiv = idx > 0 && sub.section !== item.subItems![idx - 1].section;
          if (sub.isDivider) return <div key={sub.id} className="h-[1px] my-1 mx-0" style={{ backgroundColor: 'var(--border-color)' }} />;

          return (
            <React.Fragment key={sub.id}>
              {showDiv && <div className="h-[1px] my-1 mx-0" style={{ backgroundColor: 'var(--border-color)' }} />}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(sub.id, menu.file, menu.targetPath, menu.source);
                }}
                className="w-full flex items-center px-4 py-1.5 text-[13px] hover:bg-indigo-600/90 hover:text-white transition-colors cursor-default rounded-[3px] mx-0.5"
                style={{ color: 'var(--text-main)', width: 'calc(100% - 4px)' }}
              >
                <span className="select-none">{sub.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      onMouseLeave={() => setActiveSubMenuId(null)}
      style={{
        top: `${menu.y}px`,
        left: `${menu.x}px`,
        borderColor: 'var(--border-color)',
      }}
      className="fixed z-[500] w-[180px] bg-[var(--bg-card)] border shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100 rounded-sm"
    >
      {activeMenuItems.map((item, index) => {
        const isTargetDisabled = menu.source === 'list' && menu.file?.isDir && item.id === 'open';
        const showDivider = index > 0 && item.section !== activeMenuItems[index - 1].section;

        return (
          <React.Fragment key={item.id}>
            {showDivider && <div className="h-[1px] my-1 mx-0" style={{ backgroundColor: 'var(--border-color)' }} />}
            <div
              onMouseEnter={() => item.hasSub && !isTargetDisabled ? setActiveSubMenuId(item.id) : setActiveSubMenuId(null)}
              onClick={(e) => {
                if (isTargetDisabled || item.hasSub) return;
                e.stopPropagation();
                onAction(item.id, menu.file, menu.targetPath, menu.source);
              }}
              className={`w-full flex items-center justify-between px-4 py-1.5 text-[13px] transition-colors group cursor-default rounded-[3px] mx-0.5 ${
                isTargetDisabled
                  ? 'opacity-40 pointer-events-none'
                  : (activeSubMenuId === item.id ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-600/90 hover:text-white')
              }`}
              style={{ color: isTargetDisabled ? 'var(--text-dim)' : (activeSubMenuId === item.id ? 'white' : 'var(--text-main)'), width: 'calc(100% - 4px)' }}
            >
              <span className="select-none">{item.label}</span>
              {item.hasSub && <ChevronRight className={`w-3.5 h-3.5 ${activeSubMenuId === item.id ? 'text-white opacity-70' : 'opacity-40 group-hover:text-white group-hover:opacity-70'}`} />}
            </div>
            {activeSubMenuId === item.id && renderSubMenu(item, menu.x, menu.y, index)}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * Calculate context menu position, avoiding overflow
 */
export function calcMenuPosition(
  e: React.MouseEvent,
  source: 'tree' | 'list',
  treeItemCount: number,
  listItemCount: number
): { x: number; y: number } {
  let x = e.clientX;
  let y = e.clientY;

  const menuWidth = 180;
  const itemCount = source === 'tree' ? treeItemCount : listItemCount;
  const itemHeight = 30;
  const dividerHeight = 9;
  // Rough estimate of sections based on menu type
  const sectionCount = source === 'tree' ? 4 : 7;
  const estimatedHeight = (itemCount * itemHeight) + (sectionCount * dividerHeight) + 8;

  if (x + menuWidth > window.innerWidth) x = x - menuWidth;
  if (y + estimatedHeight > window.innerHeight) y = Math.max(10, window.innerHeight - estimatedHeight - 10);
  else y = y + 2;

  return { x, y };
}
