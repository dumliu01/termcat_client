/**
 * PaneDropZone — Overlay for drag-and-drop onto a terminal pane.
 * Divides the pane into 5 zones: top/bottom/left/right (25% from each edge), center.
 * Shows a semi-transparent highlight on the zone the mouse is over.
 */

import React, { useState, useCallback, useRef } from 'react';
import type { DropEdge } from '../types';

interface PaneDropZoneProps {
  onDrop: (edge: DropEdge, e: React.DragEvent) => void;
  onDragLeave: () => void;
}

function getEdgeFromPosition(
  x: number,
  y: number,
  rect: DOMRect,
): DropEdge {
  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;

  // Check edges first (25% from each side)
  if (relY < 0.25) return 'top';
  if (relY > 0.75) return 'bottom';
  if (relX < 0.25) return 'left';
  if (relX > 0.75) return 'right';
  return 'center';
}

/** CSS for the highlight region based on active edge */
function getHighlightStyle(edge: DropEdge | null): React.CSSProperties {
  if (!edge) return { display: 'none' };

  const base: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    border: '2px solid rgba(99, 102, 241, 0.4)',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
    pointerEvents: 'none',
  };

  switch (edge) {
    case 'top':
      return { ...base, top: 0, left: 0, right: 0, height: '50%' };
    case 'bottom':
      return { ...base, bottom: 0, left: 0, right: 0, height: '50%' };
    case 'left':
      return { ...base, top: 0, left: 0, bottom: 0, width: '50%' };
    case 'right':
      return { ...base, top: 0, right: 0, bottom: 0, width: '50%' };
    case 'center':
      return { ...base, top: '10%', left: '10%', right: '10%', bottom: '10%' };
  }
}

export const PaneDropZone: React.FC<PaneDropZoneProps> = React.memo(({
  onDrop,
  onDragLeave,
}) => {
  const [activeEdge, setActiveEdge] = useState<DropEdge | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!containerRef.current) return;
    const edge = getEdgeFromPosition(e.clientX, e.clientY, containerRef.current.getBoundingClientRect());
    setActiveEdge(edge);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeEdge) {
      onDrop(activeEdge, e);
    }
    setActiveEdge(null);
  }, [activeEdge, onDrop]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only fire if leaving the container itself, not entering a child
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setActiveEdge(null);
      onDragLeave();
    }
  }, [onDragLeave]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-50"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div style={getHighlightStyle(activeEdge)} />
    </div>
  );
});

PaneDropZone.displayName = 'PaneDropZone';
