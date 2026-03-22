/**
 * TermCat 插件系统 - 统一导出
 */

// 类型
export type {
  Disposable,
  PluginContext,
  PluginLogger,
  PluginManifest,
  PluginInfo,
  PluginModule,
  PluginState,
  ActivationEvent,
  PluginPermission,
  PluginContributes,
  TerminalInfo,
  CommandResult,
  TerminalDecorator,
  DecorationItem,
  CompletionContext,
  CompletionItem,
  TerminalCompletionProvider,
  SSHConnectionInfo,
  ConnectionInitHook,
  PluginFileItem,
  FilePreviewProvider,
  FileContextMenuItem,
  PluginAIMessage,
  AIMessagePreprocessor,
  SlashCommand,
  SlashCommandContext,
  PreExecuteHook,
  PluginSystemMetrics,
  MetricsCollector,
  CustomMetric,
  AlertRule,
  InputBoxOptions,
  QuickPickItem,
  ConfirmOptions,
  WebviewPanelOptions,
  WebviewPanel,
  SidebarViewProvider,
  StatusBarItem,
  ToolbarButton,
  PluginHost,
  HostDecorator,
  HostDecoration,
  PluginNotification,
} from './types';

export { PLUGIN_IPC_CHANNELS } from './types';

// Plugin Manager（Main 进程使用）
export { PluginManager, getPluginManager } from './plugin-manager';

// Plugin API & Registry
export { PluginRegistry, createPluginAPI } from './plugin-api';
export type { PluginAPI, MainProcessBridge } from './plugin-api';
