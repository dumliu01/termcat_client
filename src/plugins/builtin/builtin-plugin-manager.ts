/**
 * 内置插件管理器（Renderer 进程）
 *
 * 管理所有内置插件的注册、激活和生命周期。
 * 内置插件运行在 Renderer 进程，可以直接注册 React 组件。
 */

import type { Disposable, PluginInfo, PluginManifest } from '../types';
import type {
  BuiltinPlugin,
  BuiltinPluginContext,
  SidebarPanelRegistration,
  BottomPanelRegistration,
  ToolbarToggleRegistration,
  ConnectionInfo,
  ConnectionChangeHandler,
} from './types';
import type { PanelRegistration, SectionDescriptor, TemplateData } from '../ui-contribution/types';
import { panelDataStore } from '../ui-contribution/panel-data-store';

class BuiltinPluginManager {
  private plugins = new Map<string, BuiltinPluginInstance>();
  private sidebarPanels = new Map<string, SidebarPanelRegistration>();
  private bottomPanels = new Map<string, BottomPanelRegistration>();
  private toolbarToggles = new Map<string, ToolbarToggleRegistration>();
  private updateCallbacks: Array<() => void> = [];
  private connectionHandlers = new Set<ConnectionChangeHandler>();
  private currentConnectionInfo: ConnectionInfo | null = null;
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  /** 不可禁用的内置插件 ID */
  private static NON_DISABLEABLE = new Set(['builtin-ai-ops']);
  /** 被用户禁用的内置插件 ID 集合（localStorage 持久化） */
  private disabledIds: Set<string>;

  private static STORAGE_KEY = 'termcat:builtin-plugins:disabled';

  constructor() {
    try {
      const saved = localStorage.getItem(BuiltinPluginManager.STORAGE_KEY);
      this.disabledIds = saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      this.disabledIds = new Set();
    }
  }

  private persistDisabled(): void {
    localStorage.setItem(BuiltinPluginManager.STORAGE_KEY, JSON.stringify(Array.from(this.disabledIds)));
  }

  /** 注册一个内置插件 */
  register(plugin: BuiltinPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[BuiltinPluginManager] Plugin already registered: ${plugin.id}`);
      return;
    }
    this.plugins.set(plugin.id, {
      plugin,
      activated: false,
      subscriptions: [],
    });
  }

  /** 激活所有已注册的内置插件（跳过被用户禁用的） */
  async activateAll(): Promise<void> {
    for (const [id, instance] of this.plugins) {
      if (instance.activated) continue;
      if (this.disabledIds.has(id)) continue;
      await this.activatePlugin(id);
    }
  }

  /** 激活单个插件 */
  private async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || instance.activated) return;

    const context = this.createContext(pluginId, instance);
    try {
      await instance.plugin.activate(context);
      instance.activated = true;
      console.log(`[BuiltinPluginManager] Activated: ${pluginId}`);
    } catch (err) {
      console.error(`[BuiltinPluginManager] Failed to activate ${pluginId}:`, err);
    }
  }

  /** 停用所有插件 */
  async deactivateAll(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.deactivatePlugin(id);
    }
    this.sidebarPanels.clear();
    this.bottomPanels.clear();
    this.toolbarToggles.clear();
    this.eventHandlers.clear();
  }

  // ==================== 插件列表（供 ExtensionsView 显示） ====================

  /** 以 PluginInfo 格式返回所有内置插件信息 */
  getPluginList(language?: string): PluginInfo[] {
    return Array.from(this.plugins.values()).map(instance => {
      const disabled = this.disabledIds.has(instance.plugin.id);
      const lang = language || 'zh';
      const manifest: PluginManifest = {
        id: instance.plugin.id,
        displayName: instance.plugin.getLocalizedName?.(lang) ?? instance.plugin.displayName,
        description: instance.plugin.getLocalizedDescription?.(lang) ?? instance.plugin.description,
        version: instance.plugin.version,
        entry: '',
        activationEvents: ['onStartup'],
        permissions: [],
        contributes: {},
      };
      const disableable = !BuiltinPluginManager.NON_DISABLEABLE.has(instance.plugin.id);
      return {
        manifest,
        state: disabled ? 'deactivated' : (instance.activated ? 'activated' : 'installed'),
        enabled: !disabled,
        builtin: true,
        disableable,
      } as PluginInfo;
    });
  }

  /** 启用内置插件 */
  async enableBuiltinPlugin(pluginId: string): Promise<void> {
    this.disabledIds.delete(pluginId);
    this.persistDisabled();
    const instance = this.plugins.get(pluginId);
    if (instance && !instance.activated) {
      await this.activatePlugin(pluginId);
    }
    this.notifyUpdate();
  }

  /** 禁用内置插件 */
  async disableBuiltinPlugin(pluginId: string): Promise<void> {
    this.disabledIds.add(pluginId);
    this.persistDisabled();
    const instance = this.plugins.get(pluginId);
    if (instance && instance.activated) {
      await this.deactivatePlugin(pluginId);
    }
    this.notifyUpdate();
  }

  /** 停用单个插件 */
  private async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance || !instance.activated) return;
    try {
      if (instance.plugin.deactivate) {
        await instance.plugin.deactivate();
      }
      for (const sub of instance.subscriptions) {
        try { sub.dispose(); } catch { /* ignore */ }
      }
      instance.subscriptions = [];
      instance.activated = false;
      console.log(`[BuiltinPluginManager] Deactivated: ${pluginId}`);
    } catch (err) {
      console.error(`[BuiltinPluginManager] Failed to deactivate ${pluginId}:`, err);
    }
  }

  // ==================== 查询 API ====================

  /** 获取指定位置的侧栏面板列表 */
  getSidebarPanels(position: 'left' | 'right'): SidebarPanelRegistration[] {
    return Array.from(this.sidebarPanels.values()).filter(p => p.position === position);
  }

  /** 获取底部面板列表 */
  getBottomPanels(): BottomPanelRegistration[] {
    return Array.from(this.bottomPanels.values())
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** 获取某个面板 */
  getSidebarPanel(id: string): SidebarPanelRegistration | undefined {
    return this.sidebarPanels.get(id);
  }

  /** 获取工具栏切换按钮 */
  getToolbarToggles(): ToolbarToggleRegistration[] {
    return Array.from(this.toolbarToggles.values())
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** 获取某个面板关联的工具栏按钮 */
  getToolbarToggle(panelId: string): ToolbarToggleRegistration | undefined {
    return this.toolbarToggles.get(panelId);
  }

  /** 注册 UI 更新回调 */
  onUpdate(callback: () => void): Disposable {
    this.updateCallbacks.push(callback);
    return {
      dispose: () => {
        this.updateCallbacks = this.updateCallbacks.filter(c => c !== callback);
      },
    };
  }

  // ==================== 连接信息推送 ====================

  /** 由 TerminalView 调用，推送当前连接信息给所有插件 */
  setConnectionInfo(info: ConnectionInfo | null): void {
    this.currentConnectionInfo = info;
    for (const handler of this.connectionHandlers) {
      try { handler(info); } catch { /* ignore */ }
    }
  }

  // ==================== 事件系统 ====================

  /** 监听插件事件 */
  on(eventType: string, handler: (payload: unknown) => void): Disposable {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
    return {
      dispose: () => { this.eventHandlers.get(eventType)?.delete(handler); },
    };
  }

  /** 触发插件事件 */
  emit(eventType: string, payload: unknown): void {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(payload); } catch { /* ignore */ }
    }
  }

  // ==================== 内部方法 ====================

  private createContext(pluginId: string, instance: BuiltinPluginInstance): BuiltinPluginContext {
    const manager = this;
    return {
      pluginId,
      subscriptions: instance.subscriptions,

      registerSidebarPanel(panel: SidebarPanelRegistration): Disposable {
        manager.sidebarPanels.set(panel.id, panel);
        manager.notifyUpdate();
        const disposable = {
          dispose: () => {
            manager.sidebarPanels.delete(panel.id);
            manager.notifyUpdate();
          },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      registerBottomPanel(panel: BottomPanelRegistration): Disposable {
        manager.bottomPanels.set(panel.id, panel);
        manager.notifyUpdate();
        const disposable = {
          dispose: () => {
            manager.bottomPanels.delete(panel.id);
            manager.notifyUpdate();
          },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      registerToolbarToggle(toggle: ToolbarToggleRegistration): Disposable {
        manager.toolbarToggles.set(toggle.panelId, toggle);
        manager.notifyUpdate();
        const disposable = {
          dispose: () => {
            manager.toolbarToggles.delete(toggle.panelId);
            manager.notifyUpdate();
          },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      registerPanel(options: PanelRegistration): Disposable {
        const disposable = panelDataStore.registerPanel(pluginId, options);
        instance.subscriptions.push(disposable);
        return disposable;
      },

      setPanelData(panelId: string, sections: SectionDescriptor[]): void {
        panelDataStore.setPanelData(panelId, sections);
      },

      updateSection(panelId: string, sectionId: string, data: TemplateData): void {
        panelDataStore.updateSection(panelId, sectionId, data);
      },

      emitEvent(eventType: string, payload: unknown): void {
        manager.emit(eventType, payload);
      },

      onConnectionChange(handler: ConnectionChangeHandler): Disposable {
        manager.connectionHandlers.add(handler);
        // 如果已有连接信息，立即通知
        if (manager.currentConnectionInfo) {
          try { handler(manager.currentConnectionInfo); } catch { /* ignore */ }
        }
        const disposable = {
          dispose: () => { manager.connectionHandlers.delete(handler); },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },
    };
  }

  private notifyUpdate(): void {
    for (const cb of this.updateCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }
}

interface BuiltinPluginInstance {
  plugin: BuiltinPlugin;
  activated: boolean;
  subscriptions: Disposable[];
}

// 单例
export const builtinPluginManager = new BuiltinPluginManager();
