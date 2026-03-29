/**
 * Plugin Service (Renderer Process)
 *
 * Communicates with PluginManager in Main process via IPC,
 * provides plugin list, status, UI data to React components.
 */

import type {
  PluginInfo,
  StatusBarItem,
  ToolbarButton,
  FileContextMenuItem,
  SlashCommand,
  PluginNotification,
} from '@/plugins/types';
import { PLUGIN_IPC_CHANNELS } from '@/plugins/types';

type PluginEventCallback = (data: unknown) => void;

class PluginService {
  private listeners = new Map<string, Set<PluginEventCallback>>();
  private initialized = false;

  /** Initialize Renderer-side plugin service */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const electron = (window as any).electron;
    if (!electron?.plugin) return;

    // Listen for plugin state changes
    electron.plugin.onStateChanged((data: { pluginId: string; info: PluginInfo }) => {
      this.emit('stateChanged', data);
    });

    // Listen for plugin notifications
    electron.plugin.onNotification((notification: PluginNotification) => {
      this.emit('notification', notification);
    });

    // Listen for status bar updates
    electron.plugin.onStatusBarUpdated(() => {
      this.emit('statusBarUpdated', null);
    });
  }

  // ==================== Plugin Management ====================

  async getPlugins(): Promise<PluginInfo[]> {
    return this.invoke(PLUGIN_IPC_CHANNELS.LIST_PLUGINS);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    return this.invoke(PLUGIN_IPC_CHANNELS.ENABLE_PLUGIN, pluginId);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    return this.invoke(PLUGIN_IPC_CHANNELS.DISABLE_PLUGIN, pluginId);
  }

  async getPluginInfo(pluginId: string): Promise<PluginInfo | null> {
    return this.invoke(PLUGIN_IPC_CHANNELS.GET_PLUGIN_INFO, pluginId);
  }

  // ==================== UI Data ====================

  async getStatusBarItems(): Promise<StatusBarItem[]> {
    return this.invoke(PLUGIN_IPC_CHANNELS.GET_STATUS_BAR_ITEMS);
  }

  async getToolbarButtons(area?: string): Promise<Array<Omit<ToolbarButton, 'onClick'>>> {
    return this.invoke(PLUGIN_IPC_CHANNELS.GET_TOOLBAR_BUTTONS, area);
  }

  async getFileContextMenus(): Promise<Array<Omit<FileContextMenuItem, 'onClick'>>> {
    return this.invoke(PLUGIN_IPC_CHANNELS.GET_FILE_CONTEXT_MENUS);
  }

  async getSlashCommands(): Promise<Array<Omit<SlashCommand, 'execute'>>> {
    return this.invoke(PLUGIN_IPC_CHANNELS.GET_SLASH_COMMANDS);
  }

  // ==================== Plugin Settings ====================

  async getPluginSettings(pluginId: string): Promise<{
    success: boolean;
    settings?: Record<string, any>;
    values?: Record<string, unknown>;
    error?: string;
  }> {
    return (window as any).electron.plugin.getSettings(pluginId);
  }

  async setPluginSetting(pluginId: string, key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
    return (window as any).electron.plugin.setSetting(pluginId, key, value);
  }

  // ==================== Command Execution ====================

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    return this.invoke(PLUGIN_IPC_CHANNELS.EXECUTE_COMMAND, commandId, ...args);
  }

  // ==================== Event System ====================

  on(event: string, callback: PluginEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try { cb(data); } catch (err) { console.error('[PluginService] Event callback error:', err); }
    }
  }

  // ==================== IPC Invocation ====================

  private async invoke(channel: string, ...args: unknown[]): Promise<any> {
    const electron = (window as any).electron;
    if (!electron?.plugin?.invoke) {
      console.warn('[PluginService] Plugin IPC not available');
      return null;
    }
    return electron.plugin.invoke(channel, ...args);
  }
}

export const pluginService = new PluginService();
