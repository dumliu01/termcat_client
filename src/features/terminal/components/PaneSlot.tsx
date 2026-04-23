/**
 * PaneSlot — Empty slot div that TerminalHostLayer portals a TerminalView into.
 *
 * Uses native DOM listeners (not React's synthetic events) for `dragenter` and
 * `contextmenu` because the TerminalView is rendered via createPortal: React
 * synthetic events fired on the xterm DOM bubble up the React tree (to
 * TerminalHostLayer), skipping this component's React ancestors entirely.
 * Native events bubble through the DOM, so plain addEventListener correctly
 * fires when the user drags or right-clicks over the terminal canvas.
 */

import React, { useCallback, useEffect, useRef } from 'react';

interface PaneSlotProps {
  paneId: string;
  /** Called when a termcat drag enters this slot. */
  onDragEnterPane: (paneId: string) => void;
  /** Stable ref callback from App.tsx's getSlotRef(sessionId). */
  slotRef: (el: HTMLDivElement | null) => void;
  /** Called on right-click anywhere in the slot (including over the xterm canvas). */
  onContextMenu: (x: number, y: number) => void;
  className?: string;
}

export const PaneSlot: React.FC<PaneSlotProps> = ({
  paneId,
  onDragEnterPane,
  slotRef,
  onContextMenu,
  className,
}) => {
  const localRef = useRef<HTMLDivElement | null>(null);
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      slotRef(el);
    },
    [slotRef],
  );

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const dragEnterHandler = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('text/termcat-drag')) return;
      e.preventDefault();
      onDragEnterPane(paneId);
    };
    const contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      onContextMenuRef.current(e.clientX, e.clientY);
    };
    el.addEventListener('dragenter', dragEnterHandler);
    el.addEventListener('contextmenu', contextMenuHandler);
    return () => {
      el.removeEventListener('dragenter', dragEnterHandler);
      el.removeEventListener('contextmenu', contextMenuHandler);
    };
  }, [paneId, onDragEnterPane]);

  return <div ref={setRefs} className={className} />;
};

PaneSlot.displayName = 'PaneSlot';
