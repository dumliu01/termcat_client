/**
 * 内置插件：快捷命令库（底部面板）
 *
 * 自管理命令列表状态（localStorage 持久化）。
 * 选中命令时通过事件总线通知宿主填入终端输入框。
 */

import React from 'react';
import { Terminal } from 'lucide-react';
import type { BuiltinPlugin, BottomPanelProps } from '../types';
import { CommandLibraryPanel } from './components/CommandLibraryPanel';
import { getLocale } from './i18n';

export { COMMAND_LIBRARY_EVENTS } from '../events';

const CommandLibraryWrapper: React.FC<BottomPanelProps> = ({ theme, isVisible }) => {
  return React.createElement(CommandLibraryPanel, { theme, isVisible });
};

export const commandLibraryPlugin: BuiltinPlugin = {
  id: 'builtin-command-library',
  displayName: '快捷命令',
  description: '快捷命令库管理',
  version: '1.0.0',
  getLocalizedName: (lang) => getLocale(lang).displayName,
  getLocalizedDescription: (lang) => getLocale(lang).description,

  activate(context) {
    context.registerBottomPanel({
      id: 'commands',
      title: 'Commands',
      getLocalizedTitle: (lang) => getLocale(lang).tabTitle,
      icon: Terminal,
      priority: 30,
      component: CommandLibraryWrapper,
    });
  },
};
