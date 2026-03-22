/**
 * TermCat 插件系统 - 类型定义
 */

// ==================== 基础类型 ====================

/** 可释放资源 */
export interface Disposable {
  dispose(): void;
}

/** 插件上下文 */
export interface PluginContext {
  /** 插件 ID */
  pluginId: string;
  /** 插件安装路径 */
  pluginPath: string;
  /** 订阅列表（deactivate 时自动 dispose） */
  subscriptions: Disposable[];
  /** 日志 */
  logger: PluginLogger;
  /** 插件数据目录 */
  storagePath: string;
}

/** 插件日志 */
export interface PluginLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

// ==================== 插件清单 ====================

/** 插件清单（package.json 中的 termcat 字段） */
export interface PluginManifest {
  /** 插件 ID（npm 包名） */
  id: string;
  /** 显示名称 */
  displayName: string;
  /** 描述 */
  description: string;
  /** 版本 */
  version: string;
  /** 入口文件路径 */
  entry: string;
  /** 激活事件 */
  activationEvents: ActivationEvent[];
  /** 权限声明 */
  permissions: PluginPermission[];
  /** 声明式扩展 */
  contributes: PluginContributes;
}

/** 激活事件类型 */
export type ActivationEvent =
  | 'onStartup'
  | 'onTerminalOpen'
  | 'onTerminalData'
  | 'onSSHConnect'
  | 'onSSHDisconnect'
  | 'onFileOpen'
  | 'onFileSave'
  | 'onAIMessage'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onHostConnect:${string}`;

/** 权限类型 */
export type PluginPermission =
  | 'terminal.read'
  | 'terminal.write'
  | 'ssh.exec'
  | 'files.read'
  | 'files.write'
  | 'network'
  | 'monitor.read'
  | 'ai.message'
  | 'host.read';

/** 声明式扩展 */
export interface PluginContributes {
  commands?: PluginCommandContribution[];
  menus?: Record<string, PluginMenuContribution[]>;
  sidebar?: PluginSidebarContribution;
  settings?: Record<string, PluginSettingContribution>;
  i18n?: Record<string, Record<string, string>>;
}

export interface PluginCommandContribution {
  id: string;
  title: string;
  icon?: string;
}

export interface PluginMenuContribution {
  command: string;
  when?: string;
}

export interface PluginSidebarContribution {
  id: string;
  title: string;
  icon?: string;
  position?: 'top' | 'bottom';
}

export interface PluginSettingContribution {
  type: 'string' | 'boolean' | 'number' | 'select';
  default: unknown;
  description: string;
  options?: { label: string; value: unknown }[];
}

// ==================== 插件状态 ====================

export type PluginState = 'installed' | 'activated' | 'deactivated' | 'error';

export interface PluginInfo {
  manifest: PluginManifest;
  state: PluginState;
  enabled: boolean;
  error?: string;
  activatedAt?: number;
  /** 是否为内置插件（不可卸载） */
  builtin?: boolean;
  /** 是否允许禁用（默认 true） */
  disableable?: boolean;
}

// ==================== 插件入口模块 ====================

export interface PluginModule {
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ==================== Terminal API ====================

export interface TerminalInfo {
  sessionId: string;
  hostId: string;
  title: string;
  isActive: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TerminalDecorator {
  id: string;
  decorate(line: string, lineNumber: number): DecorationItem[];
}

export interface DecorationItem {
  startIndex: number;
  endIndex: number;
  className?: string;
  color?: string;
  backgroundColor?: string;
  tooltip?: string;
}

export interface CompletionContext {
  sessionId: string;
  currentInput: string;
  cursorPosition: number;
}

export interface CompletionItem {
  label: string;
  detail?: string;
  insertText: string;
  kind?: 'command' | 'file' | 'variable' | 'snippet';
}

export interface TerminalCompletionProvider {
  provideCompletions(context: CompletionContext): Promise<CompletionItem[]>;
}

// ==================== SSH API ====================

export interface SSHConnectionInfo {
  sessionId: string;
  hostId: string;
  host: string;
  port: number;
  username: string;
  connectedAt: number;
}

export interface ConnectionInitHook {
  onConnect(connection: SSHConnectionInfo): Promise<void>;
}

// ==================== Files API ====================

export interface PluginFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  permissions?: string;
}

export interface FilePreviewProvider {
  extensions: string[];
  providePreview(file: PluginFileItem, content: string): Promise<string>;
}

export interface FileContextMenuItem {
  id: string;
  title: string;
  icon?: string;
  fileTypes: string[];
  onClick(file: PluginFileItem): Promise<void>;
}

// ==================== AI API ====================

export interface PluginAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: string;
  timestamp: number;
}

export interface AIMessagePreprocessor {
  process(message: PluginAIMessage): Promise<PluginAIMessage>;
}

export interface SlashCommand {
  name: string;
  description: string;
  execute(args: string, context: SlashCommandContext): Promise<void>;
}

export interface SlashCommandContext {
  sessionId: string;
  hostId: string;
}

export interface PreExecuteHook {
  onBeforeExecute(command: string, sessionId: string): Promise<boolean>;
}

// ==================== Monitor API ====================

export interface PluginSystemMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { rx: number; tx: number };
}

export interface MetricsCollector {
  name: string;
  interval: number;
  collect(exec: (cmd: string) => Promise<string>): Promise<CustomMetric[]>;
}

export interface CustomMetric {
  name: string;
  value: number;
  unit: string;
  label?: string;
}

export interface AlertRule {
  name: string;
  severity: 'info' | 'warning' | 'critical';
  condition(metrics: PluginSystemMetrics): boolean;
  onAlert(metrics: PluginSystemMetrics): Promise<void>;
}

// ==================== UI API ====================

export interface InputBoxOptions {
  title?: string;
  placeholder?: string;
  value?: string;
  password?: boolean;
}

export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  value?: unknown;
}

export interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
}

export interface WebviewPanelOptions {
  id: string;
  title: string;
  location: 'sidebar' | 'panel' | 'tab';
  enableScripts?: boolean;
}

export interface WebviewPanel extends Disposable {
  id: string;
  title: string;
  setHtml(html: string): void;
  postMessage(message: unknown): void;
  onMessage(callback: (message: unknown) => void): Disposable;
}

export interface SidebarViewProvider {
  provideView(): Promise<string>;
  onMessage?(message: unknown): Promise<unknown>;
}

export interface StatusBarItem {
  id: string;
  text: string;
  tooltip?: string;
  icon?: string;
  position: 'left' | 'right';
  priority?: number;
  onClick?(): void;
}

export interface ToolbarButton {
  id: string;
  title: string;
  icon: string;
  area: 'terminal' | 'aiops' | 'filebrowser';
  onClick(): void;
}

// ==================== Host API ====================

export interface PluginHost {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  group?: string;
}

export interface HostDecorator {
  provideDecoration(host: PluginHost): Promise<HostDecoration | null>;
}

export interface HostDecoration {
  badge?: string;
  badgeColor?: string;
  tooltip?: string;
}

// ==================== IPC 通信类型 ====================

/** 插件系统 IPC 频道 */
export const PLUGIN_IPC_CHANNELS = {
  // 插件管理
  LIST_PLUGINS: 'plugin:list',
  ENABLE_PLUGIN: 'plugin:enable',
  DISABLE_PLUGIN: 'plugin:disable',
  GET_PLUGIN_INFO: 'plugin:info',
  INSTALL_PLUGIN: 'plugin:install',
  UNINSTALL_PLUGIN: 'plugin:uninstall',

  // 插件 UI 数据
  GET_STATUS_BAR_ITEMS: 'plugin:statusbar:items',
  GET_TOOLBAR_BUTTONS: 'plugin:toolbar:buttons',
  GET_SIDEBAR_VIEWS: 'plugin:sidebar:views',
  GET_FILE_CONTEXT_MENUS: 'plugin:file:contextmenus',
  GET_SLASH_COMMANDS: 'plugin:ai:slashcommands',

  // 插件命令
  EXECUTE_COMMAND: 'plugin:command:execute',

  // 插件事件（Main → Renderer）
  PLUGIN_STATE_CHANGED: 'plugin:state:changed',
  STATUSBAR_UPDATED: 'plugin:statusbar:updated',
  NOTIFICATION: 'plugin:notification',
} as const;

/** 插件通知 */
export interface PluginNotification {
  pluginId: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}
