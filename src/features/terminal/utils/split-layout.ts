/**
 * Split Pane Layout Tree — Pure utility functions (no React dependency).
 * All operations return new trees (immutable updates).
 */

import type { LayoutNode, PaneNode, SplitNode, DropEdge } from '../types';

// ── Query ──

/** DFS find a PaneNode by paneId */
export function findPaneNode(layout: LayoutNode, paneId: string): PaneNode | null {
  if (layout.type === 'pane') {
    return layout.paneId === paneId ? layout : null;
  }
  return findPaneNode(layout.first, paneId) || findPaneNode(layout.second, paneId);
}

/** Find the parent SplitNode of a pane and whether it is first or second child */
export function findParentSplit(
  layout: LayoutNode,
  paneId: string,
): { node: SplitNode; position: 'first' | 'second' } | null {
  if (layout.type === 'pane') return null;
  if (layout.first.type === 'pane' && layout.first.paneId === paneId) {
    return { node: layout, position: 'first' };
  }
  if (layout.second.type === 'pane' && layout.second.paneId === paneId) {
    return { node: layout, position: 'second' };
  }
  return findParentSplit(layout.first, paneId) || findParentSplit(layout.second, paneId);
}

/** Collect all paneIds in the layout tree */
export function collectAllPaneIds(layout: LayoutNode): string[] {
  if (layout.type === 'pane') return [layout.paneId];
  return [...collectAllPaneIds(layout.first), ...collectAllPaneIds(layout.second)];
}

/** Count total panes in the layout tree */
export function countPanes(layout: LayoutNode): number {
  if (layout.type === 'pane') return 1;
  return countPanes(layout.first) + countPanes(layout.second);
}

// ── Mutation (immutable) ──

/**
 * Split a pane into two. Returns a new layout tree.
 * The original pane becomes `first`, the new pane becomes `second`.
 */
export function splitPane(
  layout: LayoutNode,
  targetPaneId: string,
  direction: 'horizontal' | 'vertical',
  newPaneId: string,
  newSessionId: string,
): LayoutNode {
  if (layout.type === 'pane') {
    if (layout.paneId === targetPaneId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: layout,
        second: { type: 'pane', paneId: newPaneId, sessionId: newSessionId },
      };
    }
    return layout;
  }
  const newFirst = splitPane(layout.first, targetPaneId, direction, newPaneId, newSessionId);
  const newSecond = splitPane(layout.second, targetPaneId, direction, newPaneId, newSessionId);
  if (newFirst === layout.first && newSecond === layout.second) return layout;
  return { ...layout, first: newFirst, second: newSecond };
}

/**
 * Close a pane. Its sibling takes over the parent split's position.
 * Returns null if the root pane itself is closed (tab should be removed).
 */
export function closePane(
  layout: LayoutNode,
  targetPaneId: string,
): LayoutNode | null {
  if (layout.type === 'pane') {
    return layout.paneId === targetPaneId ? null : layout;
  }
  // Direct child — sibling takes over
  if (layout.first.type === 'pane' && layout.first.paneId === targetPaneId) {
    return layout.second;
  }
  if (layout.second.type === 'pane' && layout.second.paneId === targetPaneId) {
    return layout.first;
  }
  // Recurse deeper
  const newFirst = closePane(layout.first, targetPaneId);
  if (newFirst === null) return layout.second;
  const newSecond = closePane(layout.second, targetPaneId);
  if (newSecond === null) return layout.first;
  if (newFirst === layout.first && newSecond === layout.second) return layout;
  return { ...layout, first: newFirst, second: newSecond };
}

/**
 * Update ratio of a split node identified by path from root.
 * path: array of 0 (first) or 1 (second) indices to traverse.
 */
export function resizeSplit(
  layout: LayoutNode,
  path: number[],
  newRatio: number,
): LayoutNode {
  const clampedRatio = Math.max(0.1, Math.min(0.9, newRatio));
  if (path.length === 0 && layout.type === 'split') {
    return { ...layout, ratio: clampedRatio };
  }
  if (layout.type !== 'split' || path.length === 0) return layout;
  const [head, ...rest] = path;
  if (head === 0) {
    return { ...layout, first: resizeSplit(layout.first, rest, clampedRatio) };
  }
  return { ...layout, second: resizeSplit(layout.second, rest, clampedRatio) };
}

/**
 * Pick the first available pane in the layout tree (leftmost / topmost).
 * Used to select a new active pane after closing the current one.
 */
export function firstPaneId(layout: LayoutNode): string {
  if (layout.type === 'pane') return layout.paneId;
  return firstPaneId(layout.first);
}

// ── Drag-and-drop operations ──

/**
 * Remove a pane from the tree. The sibling of the removed pane takes over
 * the parent split's position. Returns the new tree (null if root pane removed)
 * and the sessionId that belonged to the removed pane.
 */
export function removePaneFromTree(
  layout: LayoutNode,
  paneId: string,
): { layout: LayoutNode | null; sessionId: string | null } {
  // Find the pane first to capture sessionId
  const pane = findPaneNode(layout, paneId);
  if (!pane) return { layout, sessionId: null };

  const newLayout = closePane(layout, paneId);
  return { layout: newLayout, sessionId: pane.sessionId };
}

/**
 * Insert a new pane next to a target pane based on drop edge.
 * - left/right → vertical split
 * - top/bottom → horizontal split
 * - left/top → new pane is `first`, target is `second`
 * - right/bottom → target is `first`, new pane is `second`
 * - center → replaces the target pane (same as right for now)
 */
export function insertPaneAt(
  layout: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  newSessionId: string,
  edge: DropEdge,
): LayoutNode {
  if (edge === 'center') {
    // Center drop: treat as right split
    return insertPaneAt(layout, targetPaneId, newPaneId, newSessionId, 'right');
  }

  const direction: 'horizontal' | 'vertical' =
    edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal';
  const newPaneFirst = edge === 'left' || edge === 'top';

  return insertPaneAtInternal(layout, targetPaneId, newPaneId, newSessionId, direction, newPaneFirst);
}

function insertPaneAtInternal(
  layout: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  newSessionId: string,
  direction: 'horizontal' | 'vertical',
  newPaneFirst: boolean,
): LayoutNode {
  if (layout.type === 'pane') {
    if (layout.paneId === targetPaneId) {
      const newPane: PaneNode = { type: 'pane', paneId: newPaneId, sessionId: newSessionId };
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: newPaneFirst ? newPane : layout,
        second: newPaneFirst ? layout : newPane,
      };
    }
    return layout;
  }
  const newFirst = insertPaneAtInternal(layout.first, targetPaneId, newPaneId, newSessionId, direction, newPaneFirst);
  const newSecond = insertPaneAtInternal(layout.second, targetPaneId, newPaneId, newSessionId, direction, newPaneFirst);
  if (newFirst === layout.first && newSecond === layout.second) return layout;
  return { ...layout, first: newFirst, second: newSecond };
}
