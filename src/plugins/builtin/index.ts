/**
 * 内置插件注册中心
 *
 * 所有内置插件在此注册，由 App 初始化时统一激活。
 * 新增内置插件只需：
 *   1. 在 builtin/ 下创建插件目录
 *   2. 实现 BuiltinPlugin 接口
 *   3. 在此文件 import 并添加到 registerBuiltinPlugins()
 */

import { builtinPluginManager } from './builtin-plugin-manager';

/** 懒加载并注册所有内置插件 */
async function registerBuiltinPlugins(): Promise<void> {
  const [
    { monitoringSidebarPlugin },
    { fileBrowserPlugin },
    { transferManagerPlugin },
    { commandLibraryPlugin },
    { aiOpsPlugin },
  ] = await Promise.all([
    import('./monitoring-sidebar'),
    import('./file-browser'),
    import('./transfer-manager'),
    import('./command-library'),
    import('./ai-ops'),
  ]);

  builtinPluginManager.register(monitoringSidebarPlugin);
  builtinPluginManager.register(fileBrowserPlugin);
  builtinPluginManager.register(transferManagerPlugin);
  builtinPluginManager.register(commandLibraryPlugin);
  builtinPluginManager.register(aiOpsPlugin);
}

/** 激活所有内置插件 */
export async function activateBuiltinPlugins(): Promise<void> {
  await registerBuiltinPlugins();
  await builtinPluginManager.activateAll();
}

export { builtinPluginManager } from './builtin-plugin-manager';
export type { BuiltinPlugin, BuiltinPluginContext, SidebarPanelRegistration, SidebarPanelProps, ToolbarToggleRegistration, BottomPanelRegistration, BottomPanelProps, ConnectionInfo } from './types';

// UI 贡献点系统（从 plugins/ui-contribution 重新导出）
export { panelDataStore, panelEventBus, PanelRenderer } from '../ui-contribution';
export type { PanelRegistration, SectionDescriptor, TemplateData, TemplateType } from '../ui-contribution/types';
