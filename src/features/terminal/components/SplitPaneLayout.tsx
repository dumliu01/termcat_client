/**
 * SplitPaneLayout — Recursive layout renderer for split pane trees.
 * Flattens the binary tree into absolute-positioned PaneRects,
 * so TerminalView instances never change DOM parents (preserves xterm.js).
 */

import React, { useMemo } from 'react';
import type { LayoutNode, Tab } from '../types';
import { PaneDivider } from './PaneDivider';

// ── Types ──

interface PaneRect {
  paneId: string;
  sessionId: string;
  left: number;   // percentage 0-100
  top: number;
  width: number;
  height: number;
}

interface DividerInfo {
  id: string;
  direction: 'horizontal' | 'vertical';
  /** Position along the split axis (percentage) */
  left: number;
  top: number;
  length: number; // percentage
  /** Path from root to this split node (for resizeSplit) */
  path: number[];
  ratio: number;
}

// ── Layout computation (pure) ──

function computePaneRects(
  node: LayoutNode,
  bounds: { left: number; top: number; width: number; height: number },
): PaneRect[] {
  if (node.type === 'pane') {
    return [{ paneId: node.paneId, sessionId: node.sessionId, ...bounds }];
  }
  const { direction, ratio, first, second } = node;
  if (direction === 'vertical') {
    const firstWidth = bounds.width * ratio;
    const secondWidth = bounds.width * (1 - ratio);
    return [
      ...computePaneRects(first, { ...bounds, width: firstWidth }),
      ...computePaneRects(second, {
        ...bounds,
        left: bounds.left + firstWidth,
        width: secondWidth,
      }),
    ];
  } else {
    const firstHeight = bounds.height * ratio;
    const secondHeight = bounds.height * (1 - ratio);
    return [
      ...computePaneRects(first, { ...bounds, height: firstHeight }),
      ...computePaneRects(second, {
        ...bounds,
        top: bounds.top + firstHeight,
        height: secondHeight,
      }),
    ];
  }
}

function computeDividers(
  node: LayoutNode,
  bounds: { left: number; top: number; width: number; height: number },
  path: number[],
): DividerInfo[] {
  if (node.type === 'pane') return [];
  const { direction, ratio, first, second } = node;
  const dividers: DividerInfo[] = [];

  if (direction === 'vertical') {
    const splitPos = bounds.left + bounds.width * ratio;
    dividers.push({
      id: path.join('-') || 'root',
      direction: 'vertical',
      left: splitPos,
      top: bounds.top,
      length: bounds.height,
      path,
      ratio,
    });
    const firstWidth = bounds.width * ratio;
    const secondWidth = bounds.width * (1 - ratio);
    dividers.push(
      ...computeDividers(first, { ...bounds, width: firstWidth }, [...path, 0]),
      ...computeDividers(second, {
        ...bounds,
        left: bounds.left + firstWidth,
        width: secondWidth,
      }, [...path, 1]),
    );
  } else {
    const splitPos = bounds.top + bounds.height * ratio;
    dividers.push({
      id: path.join('-') || 'root',
      direction: 'horizontal',
      left: bounds.left,
      top: splitPos,
      length: bounds.width,
      path,
      ratio,
    });
    const firstHeight = bounds.height * ratio;
    const secondHeight = bounds.height * (1 - ratio);
    dividers.push(
      ...computeDividers(first, { ...bounds, height: firstHeight }, [...path, 0]),
      ...computeDividers(second, {
        ...bounds,
        top: bounds.top + firstHeight,
        height: secondHeight,
      }, [...path, 1]),
    );
  }
  return dividers;
}

// ── Component ──

interface SplitPaneLayoutProps {
  tab: Tab;
  onResizePane: (tabId: string, path: number[], ratio: number) => void;
  /** Render function for each pane slot */
  renderPane: (paneId: string, sessionId: string, isPaneActive: boolean) => React.ReactNode;
}

export const SplitPaneLayout: React.FC<SplitPaneLayoutProps> = React.memo(({
  tab,
  onResizePane,
  renderPane,
}) => {
  const fullBounds = { left: 0, top: 0, width: 100, height: 100 };

  const paneRects = useMemo(
    () => computePaneRects(tab.layout, fullBounds),
    [tab.layout],
  );

  const dividers = useMemo(
    () => computeDividers(tab.layout, fullBounds, []),
    [tab.layout],
  );

  return (
    <div className="relative w-full h-full" style={{ isolation: 'isolate' }}>
      {paneRects.map(rect => (
        <div
          key={rect.sessionId}
          style={{
            position: 'absolute',
            left: `${rect.left}%`,
            top: `${rect.top}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            overflow: 'hidden',
          }}
        >
          {renderPane(rect.paneId, rect.sessionId, rect.paneId === tab.activePaneId)}
        </div>
      ))}

      {dividers.map(d => (
        <PaneDivider
          key={d.id}
          direction={d.direction}
          left={d.left}
          top={d.top}
          length={d.length}
          ratio={d.ratio}
          onRatioChange={(newRatio) => onResizePane(tab.id, d.path, newRatio)}
        />
      ))}
    </div>
  );
});

SplitPaneLayout.displayName = 'SplitPaneLayout';
