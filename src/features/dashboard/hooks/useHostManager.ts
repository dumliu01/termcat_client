/**
 * 主机 / 分组 / 代理 CRUD Hook
 */

import { useState, useCallback } from 'react';
import { Host, HostGroup, Proxy } from '@/utils/types';
import { hostService, StorageMode } from '@/core/host/hostService';
import { apiService } from '@/base/http/api';
import { authService } from '@/core/auth/authService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

export function useHostManager() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [storageMode, setStorageMode] = useState<'local' | 'server'>('server');

  // Load proxies from server
  const loadProxies = useCallback(async () => {
    try {
      const loadedProxies = await apiService.getProxies();
      setProxies(loadedProxies);
    } catch (error) {
      logger.warn(LOG_MODULE.APP, 'app.data.load_failed', 'Failed to load proxies', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // Proxy management
  const addProxy = useCallback(async (proxy: Proxy) => {
    const created = await apiService.createProxy(proxy);
    setProxies(prev => [...prev, created]);
    return created;
  }, []);

  const updateProxy = useCallback(async (proxy: Proxy) => {
    const updated = await apiService.updateProxy(proxy.id, proxy);
    setProxies(prev => prev.map(p => p.id === proxy.id ? updated : p));
    return updated;
  }, []);

  const deleteProxy = useCallback(async (id: string) => {
    await apiService.deleteProxy(id);
    setProxies(prev => prev.filter(p => p.id !== id));
  }, []);

  const addHost = useCallback(async (host: Host) => {
    const currentUser = authService.getUser();
    if (!currentUser && hosts.length >= 2) {
      setSyncStatus('游客最多添加 2 台主机，请登录解锁更多');
      setTimeout(() => setSyncStatus(''), 3000);
      return;
    }
    try {
      await hostService.addHost(host);
      const updatedHosts = await hostService.getHosts();
      setHosts(updatedHosts);
      setSyncStatus('Host 已保存');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.host.add_failed', 'Failed to add host', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      setSyncStatus('保存失败：' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [hosts]);

  const updateHost = useCallback(async (updatedHost: Host) => {
    try {
      await hostService.updateHost(updatedHost.id, updatedHost);
      const updatedHosts = await hostService.getHosts();
      setHosts(updatedHosts);
      setSyncStatus('Host 已更新');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.host.update_failed', 'Failed to update host', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      setSyncStatus('更新失败：' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, []);

  const deleteHost = useCallback(async (id: string) => {
    try {
      await hostService.deleteHost(id);
      const updatedHosts = await hostService.getHosts();
      setHosts(updatedHosts);
      setSyncStatus('Host 已删除');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.host.delete_failed', 'Failed to delete host', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      setSyncStatus('删除失败：' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, []);

  const addGroup = useCallback(async (group: HostGroup) => {
    try {
      await hostService.addGroup(group);
      const updatedGroups = await hostService.getGroups();
      setGroups(updatedGroups);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.group.add_failed', 'Failed to add group', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const updateGroup = useCallback(async (updatedGroup: HostGroup) => {
    try {
      await hostService.updateGroup(updatedGroup.id, updatedGroup);
      const updatedGroups = await hostService.getGroups();
      setGroups(updatedGroups);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.group.update_failed', 'Failed to update group', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    try {
      await hostService.deleteGroup(id);
      const updatedGroups = await hostService.getGroups();
      setGroups(updatedGroups);
    } catch (error) {
      logger.error(LOG_MODULE.APP, 'app.group.delete_failed', 'Failed to delete group', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const handleExportConfig = useCallback(() => {
    try {
      const config = hostService.exportConfig();
      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `termcat-hosts-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncStatus('配置已导出');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (error) {
      setSyncStatus('导出失败：' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, []);

  const handleImportConfig = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = await hostService.importConfig(text);
        if (result.success) {
          const updatedHosts = await hostService.getHosts();
          const updatedGroups = await hostService.getGroups();
          setHosts(updatedHosts);
          setGroups(updatedGroups);
          setSyncStatus('配置已导入');
        } else {
          setSyncStatus('导入失败：' + (result.error || '未知错误'));
        }
      } catch (error) {
        setSyncStatus('导入失败：' + (error instanceof Error ? error.message : '未知错误'));
      }
      setTimeout(() => setSyncStatus(''), 3000);
    };
    input.click();
  }, []);

  /**
   * 切换存储模式：切换后从新数据源加载数据，不做任何跨模式数据迁移
   */
  const handleStorageModeChange = useCallback(async (mode: 'local' | 'server') => {
    if (mode === storageMode) return;

    setStorageMode(mode);
    hostService.setMode(mode === 'server' ? StorageMode.CLOUD : StorageMode.LOCAL);

    // 从新的数据源加载
    const loadedHosts = await hostService.getHosts();
    setHosts(loadedHosts);
    const loadedGroups = await hostService.getGroups();
    setGroups(loadedGroups);

    logger.info(LOG_MODULE.APP, 'app.storage_mode.changed', 'Storage mode changed', { mode });
  }, [storageMode]);

  return {
    hosts,
    setHosts,
    groups,
    setGroups,
    proxies,
    setProxies,
    syncStatus,
    storageMode,
    setStorageMode,
    loadProxies,
    addHost,
    updateHost,
    deleteHost,
    addGroup,
    updateGroup,
    deleteGroup,
    addProxy,
    updateProxy,
    deleteProxy,
    handleExportConfig,
    handleImportConfig,
    handleStorageModeChange,
  };
}
