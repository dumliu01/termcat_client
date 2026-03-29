/**
 * 内置插件：文件浏览器（底部面板）
 *
 * 将 FileBrowserPanel 注册为底部面板插件，
 * 通过事件总线与宿主通信（如文件传输开始事件）。
 */

import React, { useCallback } from 'react';
import { Folder } from 'lucide-react';
import type { BuiltinPlugin } from '../types';
import type { BottomPanelProps } from '../types';
import { FileBrowserPanel } from './components/FileBrowserPanel';
import { builtinPluginManager } from '../builtin-plugin-manager';
import type { TransferItem, ThemeType } from '@/utils/types';
import { getLocale } from './i18n';
import { FILE_BROWSER_EVENTS } from '../events';

export { FILE_BROWSER_EVENTS } from '../events';

/**
 * FileBrowserPanel 的插件适配包装器
 * 将 BottomPanelProps 映射为 FileBrowserPanel 所需的 props，
 * 并通过事件总线替代直接回调。
 */
const FileBrowserWrapper: React.FC<BottomPanelProps> = ({ connectionId, fsHandler, theme, isVisible }) => {
  const handleTransferStart = useCallback((transfer: TransferItem) => {
    builtinPluginManager.emit(FILE_BROWSER_EVENTS.TRANSFER_START, transfer);
  }, []);

  return React.createElement(FileBrowserPanel, {
    connectionId,
    fsHandler,
    theme: theme as ThemeType,
    onTransferStart: handleTransferStart,
    isVisible,
  });
};

export const fileBrowserPlugin: BuiltinPlugin = {
  id: 'builtin-file-browser',
  displayName: 'File Browser',
  description: 'SFTP file browsing, editing and transfer management',
  version: '1.0.0',
  getLocalizedName: (lang) => getLocale(lang).displayName,
  getLocalizedDescription: (lang) => getLocale(lang).description,

  activate(context) {
    context.registerBottomPanel({
      id: 'files',
      title: 'Files',
      getLocalizedTitle: (lang) => getLocale(lang).tabTitle,
      icon: Folder,
      priority: 10,
      component: FileBrowserWrapper,
    });
  },
};
