/**
 * 内置插件：AI 运维面板（右侧边栏）
 *
 * 将 AIOpsPluginPanel 注册为右侧边栏插件。
 * - 通过 AIServiceContext 获取 user / availableModels
 * - 通过事件总线通知宿主执行命令、更新宝石余额
 * - 使用 msg-viewer 通用控件渲染消息列表
 */

import React, { useCallback } from 'react';
import type { BuiltinPlugin, SidebarPanelProps } from '../types';
import { AIOpsPluginPanel } from './AIOpsPanel';
import { useAIService } from '@/features/shared/contexts/AIServiceContext';
import { builtinPluginManager } from '../builtin-plugin-manager';
import type { Host } from '@/utils/types';
import { getLocale } from './i18n';
import { locales } from './locales';

import { AI_OPS_EVENTS } from '../events';
export { AI_OPS_EVENTS };

/**
 * AIOpsPanel 的插件适配包装器
 *
 * 将 SidebarPanelProps 映射为 AIOpsPluginPanel 所需的 props，
 * 从 AIServiceContext 获取 app 级别依赖，
 * 通过事件总线替代直接回调。
 */
const AIOpsWrapper: React.FC<SidebarPanelProps> = ({
  sessionId,
  connectionId,
  connectionType,
  terminalId,
  host: hostUnknown,
  isVisible,
  isActive,
  onClose,
}) => {
  const host = hostUnknown as Host;
  const { user, availableModels, availableModes } = useAIService();

  const handleExecute = useCallback((cmd: string) => {
    builtinPluginManager.emit(AI_OPS_EVENTS.EXECUTE_COMMAND, cmd);
  }, []);

  const handleGemsUpdated = useCallback((newBalance: number) => {
    builtinPluginManager.emit(AI_OPS_EVENTS.GEMS_UPDATED, newBalance);
  }, []);

  return React.createElement(AIOpsPluginPanel, {
    user,
    sessionId: connectionId || undefined,
    hostId: host?.id,
    hostName: host?.name,
    // Cannot use isActive to determine isVisible: parent component TerminalView's React.memo
    // intentionally doesn't compare isActive (to avoid canvas flicker), causing this component not to re-render when isActive changes.
    // If combining isActive into isVisible, panel in inactive tab will always return null, still blank after switching.
    isVisible,
    onClose,
    onExecute: handleExecute,
    availableModels,
    availableModes,
    onGemsUpdated: handleGemsUpdated,
    connectionType,
    terminalId,
  });
};

function getLocalizedTitle(language: string): string {
  return getLocale(language).panelTitle;
}

export const aiOpsPlugin: BuiltinPlugin = {
  id: 'builtin-ai-ops',
  displayName: locales.zh.displayName,
  description: locales.zh.description,
  version: '1.0.0',
  getLocalizedName: (lang) => getLocale(lang).displayName,
  getLocalizedDescription: (lang) => getLocale(lang).description,

  activate(context) {
    context.registerSidebarPanel({
      id: 'ai-ops',
      position: 'right',
      component: AIOpsWrapper,
      defaultWidth: 360,
      defaultVisible: false,
      storageKeyPrefix: 'termcat_ai_panel',
    });
  },
};
