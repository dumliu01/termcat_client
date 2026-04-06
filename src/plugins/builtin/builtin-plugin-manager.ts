/**
 * Builtin Plugin Manager (Renderer Process)
 *
 * Manages registration, activation and lifecycle of all builtin plugins.
 * Builtin plugins run in Renderer process, can directly register React components.
 */

import type { Disposable, PluginInfo, PluginManifest } from '../types';
import type { AIModeInfo, AIModelInfo } from '@/utils/types';
import type {
  BuiltinPlugin,
  BuiltinPluginContext,
  SidebarPanelRegistration,
  BottomPanelRegistration,
  ToolbarToggleRegistration,
  ConnectionInfo,
  ConnectionChangeHandler,
  VisibilityChangeHandler,
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
  private visibilityHandlers = new Set<VisibilityChangeHandler>();
  private currentConnectionInfo: ConnectionInfo | null = null;
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private extraModes = new Map<string, AIModeInfo[]>();
  private extraModels = new Map<string, AIModelInfo[]>();
  /** Non-disableable builtin plugin IDs */
  private static NON_DISABLEABLE = new Set(['builtin-ai-ops']);
  /** User-disabled builtin plugin ID set (persisted in localStorage) */
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

  /** Register a builtin plugin */
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

  /** Activate all registered builtin plugins (skip those disabled by user) */
  async activateAll(): Promise<void> {
    for (const [id, instance] of this.plugins) {
      if (instance.activated) continue;
      if (this.disabledIds.has(id)) continue;
      await this.activatePlugin(id);
    }
  }

  /** Activate a single plugin */
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

  /** Deactivate all plugins */
  async deactivateAll(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.deactivatePlugin(id);
    }
    this.sidebarPanels.clear();
    this.bottomPanels.clear();
    this.toolbarToggles.clear();
    this.eventHandlers.clear();
  }

  // ==================== Plugin List (for ExtensionsView display) ====================

  /** Return all builtin plugin info in PluginInfo format */
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

  /** Enable builtin plugin */
  async enableBuiltinPlugin(pluginId: string): Promise<void> {
    this.disabledIds.delete(pluginId);
    this.persistDisabled();
    const instance = this.plugins.get(pluginId);
    if (instance && !instance.activated) {
      await this.activatePlugin(pluginId);
    }
    this.notifyUpdate();
  }

  /** Disable builtin plugin */
  async disableBuiltinPlugin(pluginId: string): Promise<void> {
    this.disabledIds.add(pluginId);
    this.persistDisabled();
    const instance = this.plugins.get(pluginId);
    if (instance && instance.activated) {
      await this.deactivatePlugin(pluginId);
    }
    this.notifyUpdate();
  }

  /** Deactivate a single plugin */
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

  // ==================== Query API ====================

  /** Get sidebar panel list for specified position */
  getSidebarPanels(position: 'left' | 'right'): SidebarPanelRegistration[] {
    return Array.from(this.sidebarPanels.values()).filter(p => p.position === position);
  }

  /** Get bottom panel list */
  getBottomPanels(): BottomPanelRegistration[] {
    return Array.from(this.bottomPanels.values())
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** Get a panel by ID */
  getSidebarPanel(id: string): SidebarPanelRegistration | undefined {
    return this.sidebarPanels.get(id);
  }

  /** Get toolbar toggle buttons */
  getToolbarToggles(): ToolbarToggleRegistration[] {
    return Array.from(this.toolbarToggles.values())
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** Get toolbar toggle button associated with a panel */
  getToolbarToggle(panelId: string): ToolbarToggleRegistration | undefined {
    return this.toolbarToggles.get(panelId);
  }

  /** Get plugin-injected extra modes */
  getExtraModes(): AIModeInfo[] {
    return Array.from(this.extraModes.values()).flat();
  }

  /** Get plugin-injected extra models */
  getExtraModels(): AIModelInfo[] {
    return Array.from(this.extraModels.values()).flat();
  }

  /** Register extra modes from outside plugin context (e.g. App.tsx for external plugins) */
  registerExternalModes(key: string, modes: AIModeInfo[]): Disposable {
    this.extraModes.set(key, modes);
    this.notifyUpdate();
    return { dispose: () => { this.extraModes.delete(key); this.notifyUpdate(); } };
  }

  /** Register extra models from outside plugin context */
  registerExternalModels(key: string, models: AIModelInfo[]): Disposable {
    this.extraModels.set(key, models);
    this.notifyUpdate();
    return { dispose: () => { this.extraModels.delete(key); this.notifyUpdate(); } };
  }

  /** Register UI update callback */
  onUpdate(callback: () => void): Disposable {
    this.updateCallbacks.push(callback);
    return {
      dispose: () => {
        this.updateCallbacks = this.updateCallbacks.filter(c => c !== callback);
      },
    };
  }

  // ==================== Connection Info Push ====================

  /** Called by TerminalView, pushes current connection info to all plugins.
   *  Only notifies handlers when connection identity changes (connectionId/connectionType/hostname).
   *  For visibility/activity changes, use updateVisibility() instead.
   */
  setConnectionInfo(info: ConnectionInfo | null): void {
    const prev = this.currentConnectionInfo;
    this.currentConnectionInfo = info;

    // Only notify handlers when connection identity actually changes
    const connectionChanged = !prev && !info ? false
      : !prev || !info ? true
      : prev.connectionId !== info.connectionId
        || prev.connectionType !== info.connectionType
        || prev.hostname !== info.hostname
        || prev.language !== info.language
        || prev.effectiveHostname !== info.effectiveHostname;

    if (connectionChanged) {
      for (const handler of this.connectionHandlers) {
        try { handler(info); } catch { /* ignore */ }
      }
    }
  }

  /** Update visibility/activity state, notifies visibility handlers (lightweight, no connection rebuild).
   *  @param connectionId - If provided, only apply if this matches the current connection.
   *    Prevents inactive tabs from stopping the active tab's monitor.
   */
  updateVisibility(isVisible: boolean, isActive: boolean, connectionId?: string): void {
    if (this.currentConnectionInfo) {
      // Ignore updates from non-current connections
      if (connectionId && this.currentConnectionInfo.connectionId !== connectionId) {
        return;
      }
      const prevVisible = this.currentConnectionInfo.isVisible;
      const prevActive = this.currentConnectionInfo.isActive;
      this.currentConnectionInfo = {
        ...this.currentConnectionInfo,
        isVisible,
        isActive,
      };
      if (prevVisible !== isVisible || prevActive !== isActive) {
        for (const handler of this.visibilityHandlers) {
          try { handler(isVisible, isActive); } catch { /* ignore */ }
        }
      }
    }
  }

  // ==================== Event System ====================

  /** Listen for plugin events */
  on(eventType: string, handler: (payload: unknown) => void): Disposable {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
    return {
      dispose: () => { this.eventHandlers.get(eventType)?.delete(handler); },
    };
  }

  /** Emit plugin event */
  emit(eventType: string, payload: unknown): void {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(payload); } catch { /* ignore */ }
    }
  }

  // ==================== Internal Methods ====================

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
        // If connection info already exists, notify immediately
        if (manager.currentConnectionInfo) {
          try { handler(manager.currentConnectionInfo); } catch { /* ignore */ }
        }
        const disposable = {
          dispose: () => { manager.connectionHandlers.delete(handler); },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      onVisibilityChange(handler: VisibilityChangeHandler): Disposable {
        manager.visibilityHandlers.add(handler);
        const disposable = {
          dispose: () => { manager.visibilityHandlers.delete(handler); },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      registerModes(modes: AIModeInfo[]): Disposable {
        manager.extraModes.set(pluginId, modes);
        manager.notifyUpdate();
        const disposable = {
          dispose: () => { manager.extraModes.delete(pluginId); manager.notifyUpdate(); },
        };
        instance.subscriptions.push(disposable);
        return disposable;
      },

      registerModels(models: AIModelInfo[]): Disposable {
        manager.extraModels.set(pluginId, models);
        manager.notifyUpdate();
        const disposable = {
          dispose: () => { manager.extraModels.delete(pluginId); manager.notifyUpdate(); },
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

// Singleton
export const builtinPluginManager = new BuiltinPluginManager();
