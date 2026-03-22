/**
 * usePlugins - 插件系统 React Hook
 *
 * 提供插件列表、状态栏、工具栏等数据的响应式访问。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { pluginService } from '@/core/plugin/pluginService';
import { builtinPluginManager } from '@/plugins/builtin';
import type {
  PluginInfo,
  StatusBarItem,
  ToolbarButton,
  PluginNotification,
  SlashCommand,
  FileContextMenuItem,
} from '@/plugins/types';

/** 插件列表管理 Hook */
export function usePluginList(language?: string) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // 合并内置插件（Renderer）和外部插件（Main IPC）
      const builtinList = builtinPluginManager.getPluginList(language);
      const externalList = await pluginService.getPlugins() || [];
      setPlugins([...builtinList, ...externalList]);
    } catch (err) {
      console.error('[usePluginList] Failed to load plugins:', err);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    pluginService.initialize();
    refresh();

    const unsubStateChanged = pluginService.on('stateChanged', () => {
      refresh();
    });
    const unsubBuiltin = builtinPluginManager.onUpdate(() => {
      refresh();
    });

    return () => {
      unsubStateChanged();
      unsubBuiltin.dispose();
    };
  }, [refresh]);

  const enablePlugin = useCallback(async (pluginId: string) => {
    if (pluginId.startsWith('builtin-')) {
      await builtinPluginManager.enableBuiltinPlugin(pluginId);
    } else {
      await pluginService.enablePlugin(pluginId);
    }
    await refresh();
  }, [refresh]);

  const disablePlugin = useCallback(async (pluginId: string) => {
    if (pluginId.startsWith('builtin-')) {
      await builtinPluginManager.disableBuiltinPlugin(pluginId);
    } else {
      await pluginService.disablePlugin(pluginId);
    }
    await refresh();
  }, [refresh]);

  return { plugins, loading, refresh, enablePlugin, disablePlugin };
}

/** 插件状态栏 Hook */
export function usePluginStatusBar() {
  const [items, setItems] = useState<StatusBarItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const statusItems = await pluginService.getStatusBarItems();
      setItems(statusItems || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    pluginService.initialize();
    refresh();

    const unsubscribe = pluginService.on('statusBarUpdated', () => {
      refresh();
    });

    return unsubscribe;
  }, [refresh]);

  const handleClick = useCallback(async (item: StatusBarItem) => {
    // 状态栏点击触发关联的命令
    if (item.onClick) {
      // onClick 在 Main 进程，通过命令系统触发
      await pluginService.executeCommand(`statusbar:click:${item.id}`);
    }
  }, []);

  return { items, handleClick, refresh };
}

/** 插件工具栏按钮 Hook */
export function usePluginToolbar(area: 'terminal' | 'aiops' | 'filebrowser') {
  const [buttons, setButtons] = useState<Array<Omit<ToolbarButton, 'onClick'>>>([]);

  const refresh = useCallback(async () => {
    try {
      const btns = await pluginService.getToolbarButtons(area);
      setButtons(btns || []);
    } catch {
      // ignore
    }
  }, [area]);

  useEffect(() => {
    pluginService.initialize();
    refresh();

    const unsubscribe = pluginService.on('stateChanged', () => {
      refresh();
    });

    return unsubscribe;
  }, [refresh]);

  const handleClick = useCallback(async (buttonId: string) => {
    await pluginService.executeCommand(`toolbar:click:${buttonId}`);
  }, []);

  return { buttons, handleClick, refresh };
}

/** 插件通知 Hook */
export function usePluginNotifications() {
  const [notifications, setNotifications] = useState<PluginNotification[]>([]);

  useEffect(() => {
    pluginService.initialize();

    const unsubscribe = pluginService.on('notification', (data) => {
      const notification = data as PluginNotification;
      setNotifications(prev => [...prev, notification]);

      // 5 秒后自动移除
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n !== notification));
      }, 5000);
    });

    return unsubscribe;
  }, []);

  const dismiss = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index));
  }, []);

  return { notifications, dismiss };
}

/** AI 斜杠命令 Hook */
export function usePluginSlashCommands() {
  const [commands, setCommands] = useState<Array<Omit<SlashCommand, 'execute'>>>([]);

  const refresh = useCallback(async () => {
    try {
      const cmds = await pluginService.getSlashCommands();
      setCommands(cmds || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    pluginService.initialize();
    refresh();

    const unsubscribe = pluginService.on('stateChanged', () => {
      refresh();
    });

    return unsubscribe;
  }, [refresh]);

  const executeSlashCommand = useCallback(async (name: string, args: string) => {
    await pluginService.executeCommand(`slashcmd:${name}`, args);
  }, []);

  return { commands, executeSlashCommand, refresh };
}

/** 文件右键菜单 Hook */
export function usePluginFileContextMenus() {
  const [menuItems, setMenuItems] = useState<Array<Omit<FileContextMenuItem, 'onClick'>>>([]);

  const refresh = useCallback(async () => {
    try {
      const items = await pluginService.getFileContextMenus();
      setMenuItems(items || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    pluginService.initialize();
    refresh();

    const unsubscribe = pluginService.on('stateChanged', () => {
      refresh();
    });

    return unsubscribe;
  }, [refresh]);

  const handleMenuClick = useCallback(async (menuItemId: string, file: unknown) => {
    await pluginService.executeCommand(`filemenu:click:${menuItemId}`, file);
  }, []);

  return { menuItems, handleMenuClick, refresh };
}
