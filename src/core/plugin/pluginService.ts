/**
 * 插件服务（Renderer 进程）
 *
 * 通过 IPC 与 Main 进程的 PluginManager 通信，
 * 提供插件列表、状态、UI 数据等信息给 React 组件。
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

  /** 初始化 Renderer 端插件服务 */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const electron = (window as any).electron;
    if (!electron?.plugin) return;

    // 监听插件状态变化
    electron.plugin.onStateChanged((data: { pluginId: string; info: PluginInfo }) => {
      this.emit('stateChanged', data);
    });

    // 监听插件通知
    electron.plugin.onNotification((notification: PluginNotification) => {
      this.emit('notification', notification);
    });

    // 监听状态栏更新
    electron.plugin.onStatusBarUpdated(() => {
      this.emit('statusBarUpdated', null);
    });
  }

  // ==================== 插件管理 ====================

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

  // ==================== UI 数据 ====================

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

  // ==================== 命令执行 ====================

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    return this.invoke(PLUGIN_IPC_CHANNELS.EXECUTE_COMMAND, commandId, ...args);
  }

  // ==================== 事件系统 ====================

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

  // ==================== IPC 调用 ====================

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
