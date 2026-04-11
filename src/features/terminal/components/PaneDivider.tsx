/**
 * PaneDivider — Draggable split divider between panes.
 * Uses rAF-throttled mouse tracking during drag, commits ratio on mouseup.
 */

import React, { useCallback, useRef } from 'react';

interface PaneDividerProps {
  direction: 'horizontal' | 'vertical'; // horizontal = top/bottom split line, vertical = left/right
  left: number;   // percentage position
  top: number;
  length: number; // percentage
  ratio: number;
  onRatioChange: (newRatio: number) => void;
}

const DIVIDER_SIZE = 4; // px

export const PaneDivider: React.FC<PaneDividerProps> = React.memo(({
  direction,
  left,
  top,
  length,
  ratio,
  onRatioChange,
}) => {
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startPos = direction === 'vertical' ? e.clientX : e.clientY;
    const startRatio = ratio;

    // Get the layout container (parent of divider)
    const container = dividerRef.current?.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const totalSize = direction === 'vertical' ? containerRect.width : containerRect.height;

    let rafId: number | null = null;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        const currentPos = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
        const delta = (currentPos - startPos) / totalSize;
        const newRatio = Math.max(0.1, Math.min(0.9, startRatio + delta));
        onRatioChange(newRatio);
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, ratio, onRatioChange]);

  const isVertical = direction === 'vertical';

  const style: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: `${DIVIDER_SIZE}px`,
        height: `${length}%`,
        transform: 'translateX(-50%)',
        cursor: 'col-resize',
        zIndex: 10,
      }
    : {
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: `${length}%`,
        height: `${DIVIDER_SIZE}px`,
        transform: 'translateY(-50%)',
        cursor: 'row-resize',
        zIndex: 10,
      };

  return (
    <div
      ref={dividerRef}
      className="group"
      style={style}
      onMouseDown={handleMouseDown}
    >
      {/* Visible divider line */}
      <div
        className={`
          ${isVertical ? 'w-px h-full mx-auto' : 'h-px w-full my-auto'}
          bg-[var(--border-dim)] group-hover:bg-indigo-500/60
          transition-colors duration-150
        `}
      />
      {/* Enlarged hit area (invisible) */}
      <div
        className="absolute inset-0"
        style={isVertical
          ? { left: '-4px', right: '-4px', width: 'auto' }
          : { top: '-4px', bottom: '-4px', height: 'auto' }
        }
      />
    </div>
  );
});

PaneDivider.displayName = 'PaneDivider';
