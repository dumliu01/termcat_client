/**
 * 内置插件类型定义
 *
 * 内置插件与外部插件的区别：
 * - 运行在 Renderer 进程中（直接访问 React 和 DOM）
 * - 可以注册 React 组件（而非 Webview HTML）
 * - 共享应用的样式体系（CSS 变量、Tailwind）
 * - 不需要权限声明（已是应用自身的一部分）
 */

import type { Disposable } from '../types';
import type { PanelRegistration, SectionDescriptor, TemplateData } from '../ui-contribution/types';

/** 内置插件定义 */
export interface BuiltinPlugin {
  /** 插件 ID */
  id: string;
  /** 显示名称（fallback） */
  displayName: string;
  /** 描述（fallback） */
  description: string;
  /** 版本 */
  version: string;
  /** 多语言显示名称 */
  getLocalizedName?: (language: string) => string;
  /** 多语言描述 */
  getLocalizedDescription?: (language: string) => string;
  /** 激活函数 */
  activate(context: BuiltinPluginContext): void | Promise<void>;
  /** 清理函数 */
  deactivate?(): void | Promise<void>;
}

/** 连接信息（由 TerminalView 推送给插件） */
export interface ConnectionInfo {
  connectionId: string;
  hostname: string;
  connectionType: 'ssh' | 'local';  // 连接类型
  isVisible: boolean;
  isActive: boolean;
  language: string;
}

/** 连接变化回调 */
export type ConnectionChangeHandler = (info: ConnectionInfo | null) => void;

/** 内置插件上下文 */
export interface BuiltinPluginContext {
  /** 插件 ID */
  pluginId: string;
  /** 订阅列表 */
  subscriptions: Disposable[];
  /** 注册侧栏面板（React 组件） */
  registerSidebarPanel(panel: SidebarPanelRegistration): Disposable;
  /** 注册底部面板（React 组件） */
  registerBottomPanel(panel: BottomPanelRegistration): Disposable;
  /** 注册工具栏按钮 */
  registerToolbarToggle(toggle: ToolbarToggleRegistration): Disposable;
  /** 注册模板驱动面板 */
  registerPanel(options: PanelRegistration): Disposable;
  /** 推送面板全量数据 */
  setPanelData(panelId: string, sections: SectionDescriptor[]): void;
  /** 局部更新某个 section 的数据 */
  updateSection(panelId: string, sectionId: string, data: TemplateData): void;
  /** 监听连接信息变化 */
  onConnectionChange(handler: ConnectionChangeHandler): Disposable;
  /** 发送事件给宿主（跨插件通信） */
  emitEvent(eventType: string, payload: unknown): void;
}

/** 侧栏面板注册 */
export interface SidebarPanelRegistration {
  /** 唯一 ID */
  id: string;
  /** 面板位置 */
  position: 'left' | 'right';
  /** React 组件 */
  component: React.ComponentType<SidebarPanelProps>;
  /** 默认宽度 */
  defaultWidth?: number;
  /** 是否默认显示 */
  defaultVisible?: boolean;
  /** localStorage key 前缀（用于持久化宽度/可见性） */
  storageKeyPrefix?: string;
}

/** 侧栏面板组件接收的 Props */
export interface SidebarPanelProps {
  /** 当前终端会话 ID */
  sessionId: string;
  /** SSH 连接 ID */
  connectionId: string;
  /** 连接类型 */
  connectionType?: 'ssh' | 'local';
  /** 终端后端 ID（本地终端为 ptyId，SSH 为 connectionId） */
  terminalId?: string;
  /** 主机信息 */
  host: unknown;
  /** 面板宽度 */
  width: number;
  /** 是否可见 */
  isVisible: boolean;
  /** 当前 tab 是否活跃 */
  isActive: boolean;
  /** 主题 */
  theme: string;
  /** 当前语言 */
  language: string;
  /** 关闭回调 */
  onClose: () => void;
}

/** 工具栏切换按钮注册 */
export interface ToolbarToggleRegistration {
  /** 关联的面板 ID */
  panelId: string;
  /** 按钮图标组件 */
  icon: React.ComponentType<{ className?: string }>;
  /** 按钮提示文字 */
  tooltip: string;
  /** 在工具栏中的排序优先级（越小越靠前） */
  priority?: number;
}

/** 底部面板注册 */
export interface BottomPanelRegistration {
  /** 唯一 ID */
  id: string;
  /** 标签页标题（fallback，当 getLocalizedTitle 未提供时使用） */
  title: string;
  /** 多语言标题函数（插件自行本地化） */
  getLocalizedTitle?: (language: string) => string;
  /** 标签页图标组件 */
  icon?: React.ComponentType<{ className?: string }>;
  /** 排序优先级（越小越靠前） */
  priority?: number;
  /** React 组件 */
  component: React.ComponentType<BottomPanelProps>;
}

/** 底部面板组件接收的 Props */
export interface BottomPanelProps {
  /** SSH 连接 ID */
  connectionId: string | null;
  /** 文件系统操作能力（来自 IHostConnection） */
  fsHandler?: import('@/core/terminal/IFsHandler').IFsHandler;
  /** 主题 */
  theme: string;
  /** 当前 tab 是否可见 */
  isVisible: boolean;
}
