/**
 * PaneHeader — Small title bar rendered at the top of each split pane.
 * Shows terminal name, supports double-click to rename, and action buttons.
 */

import React, { useState, useCallback } from 'react';
import { X, SplitSquareVertical, SplitSquareHorizontal } from 'lucide-react';
import { Host } from '@/utils/types';
import { useI18n } from '@/base/i18n/I18nContext';
import { setActiveDragData } from '@/renderer/App';

interface PaneHeaderProps {
  host: Host;
  isActive: boolean;
  customName?: string;
  effectiveHostname?: string | null;
  tabId?: string;
  paneId?: string;
  onClose: () => void;
  onFocus: () => void;
  onRename?: (name: string | undefined) => void;
  onSplitVertical?: () => void;
  onSplitHorizontal?: () => void;
}

export const PaneHeader: React.FC<PaneHeaderProps> = React.memo(({
  host,
  isActive,
  customName,
  effectiveHostname,
  tabId,
  paneId,
  onClose,
  onFocus,
  onRename,
  onSplitVertical,
  onSplitHorizontal,
}) => {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const displayName = customName || (
    effectiveHostname
      ? `${host.name} → ${effectiveHostname}`
      : host.name
  );

  const handleDoubleClick = useCallback(() => {
    if (!onRename) return;
    setIsEditing(true);
    setEditValue(customName || host.name);
  }, [onRename, customName, host.name]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== host.name) {
      onRename?.(trimmed);
    } else {
      onRename?.(undefined);
    }
    setIsEditing(false);
  }, [editValue, host.name, onRename]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!tabId || !paneId) return;
    const dragData = { type: 'pane', tabId, paneId };
    e.dataTransfer.setData('text/termcat-drag', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    setActiveDragData(dragData);
    setIsDragging(true);
  }, [tabId, paneId]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // Don't clear __activeDragData here — document-level dragend handler reads it
  }, []);

  return (
    <div
      draggable={!isEditing && !!tabId && !!paneId}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`flex items-center h-6 px-2 shrink-0 select-none cursor-pointer ${
        isActive
          ? 'bg-[var(--bg-sidebar)]'
          : 'bg-[var(--bg-main)]'
      }`}
      style={{
        borderBottom: '1px solid var(--border-color)',
        opacity: isDragging ? 0.5 : 1,
      }}
      onMouseDown={onFocus}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent text-[10px] leading-none font-semibold text-[var(--text-main)] outline-none border-b border-[var(--primary-color)] py-0.5"
        />
      ) : (
        <span
          className={`flex-1 truncate text-[10px] leading-none ${
            isActive
              ? 'font-semibold text-[var(--text-main)]'
              : 'font-medium text-[var(--text-dim)]'
          }`}
          onDoubleClick={handleDoubleClick}
        >
          {displayName}
        </span>
      )}

      <div className="flex items-center gap-0.5 ml-1 shrink-0">
        {onSplitVertical && (
          <button
            onClick={(e) => { e.stopPropagation(); onSplitVertical(); }}
            className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-white/10 transition-all"
            title={t.terminal.splitVertical}
          >
            <SplitSquareHorizontal className="w-2.5 h-2.5" />
          </button>
        )}
        {onSplitHorizontal && (
          <button
            onClick={(e) => { e.stopPropagation(); onSplitHorizontal(); }}
            className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-white/10 transition-all"
            title={t.terminal.splitHorizontal}
          >
            <SplitSquareVertical className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className={`w-4 h-4 flex items-center justify-center rounded transition-all ${
            isActive
              ? 'opacity-30 hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-400'
              : 'opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-rose-500/15 hover:text-rose-400'
          }`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
});

PaneHeader.displayName = 'PaneHeader';
