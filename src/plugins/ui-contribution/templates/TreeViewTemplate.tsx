import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { TemplateProps, TreeViewData, TreeNodeData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';

const TreeNode: React.FC<{
  node: TreeNodeData;
  depth: number;
  defaultExpandAll?: boolean;
  onEvent?: (eventId: string, payload: unknown) => void;
}> = ({ node, depth, defaultExpandAll, onEvent }) => {
  const [expanded, setExpanded] = useState(node.expanded ?? defaultExpandAll ?? false);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = resolveIcon(node.icon);

  const toggle = useCallback(() => {
    if (hasChildren) setExpanded(prev => !prev);
  }, [hasChildren]);

  const handleSelect = useCallback(() => {
    if (node.selectable !== false) {
      onEvent?.('tree:select', { id: node.id });
    }
  }, [node.id, node.selectable, onEvent]);

  return (
    <>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-[var(--bg-hover)] cursor-pointer text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => { toggle(); handleSelect(); }}
      >
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-dim)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-dim)]" />
          ) : null}
        </span>
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0" />}
        <span className="text-[var(--text-main)] truncate">{node.label}</span>
      </div>
      {expanded && hasChildren && node.children!.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} defaultExpandAll={defaultExpandAll} onEvent={onEvent} />
      ))}
    </>
  );
};

export const TreeViewTemplate: React.FC<TemplateProps<TreeViewData>> = ({ data, onEvent }) => {
  return (
    <div className="flex flex-col py-1">
      {data.nodes.map(node => (
        <TreeNode key={node.id} node={node} depth={0} defaultExpandAll={data.defaultExpandAll} onEvent={onEvent} />
      ))}
    </div>
  );
};
