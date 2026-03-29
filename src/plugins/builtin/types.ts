/**
 * Builtin Plugin Type Definitions
 *
 * Differences between builtin and external plugins:
 * - Runs in Renderer process (direct access to React and DOM)
 * - Can register React components (instead of Webview HTML)
 * - Shares the application's style system (CSS variables, Tailwind)
 * - Does not require permission declarations (already part of the application itself)
 */

import type { Disposable } from '../types';
import type { AIModeInfo, AIModelInfo } from '@/utils/types';
import type { PanelRegistration, SectionDescriptor, TemplateData } from '../ui-contribution/types';

/** Builtin plugin definition */
export interface BuiltinPlugin {
  /** Plugin ID */
  id: string;
  /** Display name (fallback) */
  displayName: string;
  /** Description (fallback) */
  description: string;
  /** Version */
  version: string;
  /** Localized display name */
  getLocalizedName?: (language: string) => string;
  /** Localized description */
  getLocalizedDescription?: (language: string) => string;
  /** Activate function */
  activate(context: BuiltinPluginContext): void | Promise<void>;
  /** Cleanup function */
  deactivate?(): void | Promise<void>;
}

/** Connection info (pushed to plugin by TerminalView) */
export interface ConnectionInfo {
  connectionId: string;
  hostname: string;
  connectionType: 'ssh' | 'local';  // Connection type
  isVisible: boolean;
  isActive: boolean;
  language: string;
}

/** Connection change callback */
export type ConnectionChangeHandler = (info: ConnectionInfo | null) => void;

/** Visibility change callback (lightweight, no connection rebuild) */
export type VisibilityChangeHandler = (isVisible: boolean, isActive: boolean) => void;

/** Builtin plugin context */
export interface BuiltinPluginContext {
  /** Plugin ID */
  pluginId: string;
  /** Subscription list */
  subscriptions: Disposable[];
  /** Register sidebar panel (React component) */
  registerSidebarPanel(panel: SidebarPanelRegistration): Disposable;
  /** Register bottom panel (React component) */
  registerBottomPanel(panel: BottomPanelRegistration): Disposable;
  /** Register toolbar toggle button */
  registerToolbarToggle(toggle: ToolbarToggleRegistration): Disposable;
  /** Register template-driven panel */
  registerPanel(options: PanelRegistration): Disposable;
  /** Push full panel data */
  setPanelData(panelId: string, sections: SectionDescriptor[]): void;
  /** Partially update section data */
  updateSection(panelId: string, sectionId: string, data: TemplateData): void;
  /** Listen for connection info changes */
  onConnectionChange(handler: ConnectionChangeHandler): Disposable;
  /** Listen for visibility/activity changes (lightweight, monitor start/stop only) */
  onVisibilityChange(handler: VisibilityChangeHandler): Disposable;
  /** Send event to host (cross-plugin communication) */
  emitEvent(eventType: string, payload: unknown): void;
  /** Register additional agent modes (plugin extension point) */
  registerModes(modes: AIModeInfo[]): Disposable;
  /** Register additional AI models (plugin extension point) */
  registerModels(models: AIModelInfo[]): Disposable;
}

/** Sidebar panel registration */
export interface SidebarPanelRegistration {
  /** Unique ID */
  id: string;
  /** Panel position */
  position: 'left' | 'right';
  /** React component */
  component: React.ComponentType<SidebarPanelProps>;
  /** Default width */
  defaultWidth?: number;
  /** Visible by default */
  defaultVisible?: boolean;
  /** localStorage key prefix (for persisting width/visibility) */
  storageKeyPrefix?: string;
}

/** Props received by sidebar panel component */
export interface SidebarPanelProps {
  /** Current terminal session ID */
  sessionId: string;
  /** SSH connection ID */
  connectionId: string;
  /** Connection type */
  connectionType?: 'ssh' | 'local';
  /** Terminal backend ID (ptyId for local, connectionId for SSH) */
  terminalId?: string;
  /** Host info */
  host: unknown;
  /** Panel width */
  width: number;
  /** Is visible */
  isVisible: boolean;
  /** Is current tab active */
  isActive: boolean;
  /** Theme */
  theme: string;
  /** Current language */
  language: string;
  /** Close callback */
  onClose: () => void;
}

/** Toolbar toggle button registration */
export interface ToolbarToggleRegistration {
  /** Associated panel ID */
  panelId: string;
  /** Button icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Button tooltip text */
  tooltip: string;
  /** Sort priority in toolbar (smaller = more left) */
  priority?: number;
}

/** Bottom panel registration */
export interface BottomPanelRegistration {
  /** Unique ID */
  id: string;
  /** Tab title (fallback, used when getLocalizedTitle is not provided) */
  title: string;
  /** Localization title function (plugin handles localization itself) */
  getLocalizedTitle?: (language: string) => string;
  /** Tab icon component */
  icon?: React.ComponentType<{ className?: string }>;
  /** Sort priority (smaller = more left) */
  priority?: number;
  /** React component */
  component: React.ComponentType<BottomPanelProps>;
}

/** Props received by bottom panel component */
export interface BottomPanelProps {
  /** SSH connection ID */
  connectionId: string | null;
  /** File system operation capability (from IHostConnection) */
  fsHandler?: import('@/core/terminal/IFsHandler').IFsHandler;
  /** Theme */
  theme: string;
  /** Is current tab visible */
  isVisible: boolean;
}
