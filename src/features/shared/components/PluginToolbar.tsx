/**
 * 插件工具栏按钮组件
 *
 * 在终端/AI面板/文件浏览器的工具栏区域渲染插件注册的按钮。
 */

import React from 'react';
import { usePluginToolbar } from '@/features/terminal/hooks/usePlugins';

interface PluginToolbarProps {
  area: 'terminal' | 'aiops' | 'filebrowser';
}

export const PluginToolbar: React.FC<PluginToolbarProps> = ({ area }) => {
  const { buttons, handleClick } = usePluginToolbar(area);

  if (buttons.length === 0) return null;

  return (
    <div className="flex items-center gap-1 ml-1 border-l border-[var(--border-color)] pl-1">
      {buttons.map(button => (
        <button
          key={button.id}
          onClick={() => handleClick(button.id)}
          title={button.title}
          className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="text-xs">{button.icon}</span>
        </button>
      ))}
    </div>
  );
};
