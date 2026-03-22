# Host Storage Simplification Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-mode sync system with two clear storage modes: `local` (pure localStorage) and `cloud` (server-authoritative with local cache), ensuring complete data isolation between modes.

**Architecture:** `StorageMode` has two values: `local` and `cloud`. In local mode, all CRUD goes to localStorage only. In cloud mode, CRUD goes to server API first, then the result is cached locally. The two modes use separate localStorage key namespaces (`_local` / `_cloud`) and never share data. The `autoSyncEnabled` flag, `syncToServer()`, `syncFromServer()`, and the complex merge logic are all removed.

**Tech Stack:** React 18, TypeScript 5, localStorage, Axios (existing `apiService`)

---

### Task 1: Rewrite `hostStorageService.ts` — Remove Migration Code

**Files:**
- Modify: `src/services/hostStorageService.ts`

The migration code in `migrateUnscopedData` copies local data into the server key — this is the root cause of data bleeding between modes. Remove all migration logic and simplify key computation.

- [ ] **Step 1: Rewrite hostStorageService.ts**

Replace the entire file content. Key changes:
- Remove `migrateUnscopedData()` and `migrateToModeScopedKeys()`
- Rename `storageMode` values from `'local' | 'server'` to `'local' | 'cloud'`
- `updateKeys()` uses `termcat_hosts_{scope}_{mode}` (now `_local` or `_cloud`)
- `setStorageMode()` just updates the mode and keys, no migration

```typescript
import { Host, HostGroup } from '../types';
import { logger, LOG_MODULE } from '../utils/logger';

/**
 * 本地存储服务
 * 负责将 Host 信息保存到 localStorage
 *
 * local 模式和 cloud 模式使用完全独立的 localStorage key，互不干扰。
 */
class HostStorageService {
  private HOSTS_KEY = 'termcat_hosts';
  private GROUPS_KEY = 'termcat_host_groups';
  private LAST_SYNC_KEY = 'termcat_last_sync';

  private userScope: string = 'guest';
  private storageMode: 'local' | 'cloud' = 'local';

  /**
   * 设置用户作用域，切换存储 key 前缀
   * userId 为 null 时使用游客作用域 (guest)
   */
  setUserScope(userId: string | null): void {
    this.userScope = userId ? String(userId) : 'guest';
    this.updateKeys();
  }

  /**
   * 设置存储模式，local 和 cloud 使用完全独立的 localStorage key
   */
  setStorageMode(mode: 'local' | 'cloud'): void {
    this.storageMode = mode;
    this.updateKeys();
  }

  /**
   * 根据当前 userScope + storageMode 计算 localStorage key
   */
  private updateKeys(): void {
    const scope = this.userScope;
    const mode = this.storageMode;
    this.HOSTS_KEY = `termcat_hosts_${scope}_${mode}`;
    this.GROUPS_KEY = `termcat_host_groups_${scope}_${mode}`;
    this.LAST_SYNC_KEY = `termcat_last_sync_${scope}_${mode}`;
  }

  // ==================== Host 操作 ====================

  getHosts(): Host[] {
    try {
      const hostsJson = localStorage.getItem(this.HOSTS_KEY);
      if (!hostsJson) return [];
      return JSON.parse(hostsJson);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'storage.hosts.load_failed', 'Failed to load hosts from localStorage', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  saveHosts(hosts: Host[]): void {
    try {
      localStorage.setItem(this.HOSTS_KEY, JSON.stringify(hosts));
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'storage.hosts.save_failed', 'Failed to save hosts to localStorage', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('本地保存失败');
    }
  }

  addHost(host: Host): Host[] {
    const hosts = this.getHosts();
    hosts.push(host);
    this.saveHosts(hosts);
    return hosts;
  }

  updateHost(id: string, updatedHost: Host): Host[] {
    const hosts = this.getHosts();
    const index = hosts.findIndex(h => h.id === id);
    if (index === -1) {
      throw new Error('Host not found');
    }
    hosts[index] = { ...hosts[index], ...updatedHost };
    this.saveHosts(hosts);
    return hosts;
  }

  deleteHost(id: string): Host[] {
    const hosts = this.getHosts();
    const filteredHosts = hosts.filter(h => h.id !== id);
    this.saveHosts(filteredHosts);
    return filteredHosts;
  }

  getHostById(id: string): Host | null {
    const hosts = this.getHosts();
    return hosts.find(h => h.id === id) || null;
  }

  // ==================== Group 操作 ====================

  getGroups(): HostGroup[] {
    try {
      const groupsJson = localStorage.getItem(this.GROUPS_KEY);
      if (!groupsJson) return [];
      return JSON.parse(groupsJson);
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'storage.groups.load_failed', 'Failed to load groups from localStorage', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  saveGroups(groups: HostGroup[]): void {
    try {
      localStorage.setItem(this.GROUPS_KEY, JSON.stringify(groups));
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'storage.groups.save_failed', 'Failed to save groups to localStorage', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('本地保存失败');
    }
  }

  addGroup(group: HostGroup): HostGroup[] {
    const groups = this.getGroups();
    const existingIndex = groups.findIndex(g => g.id === group.id);
    if (existingIndex !== -1) {
      groups[existingIndex] = group;
    } else {
      groups.push(group);
    }
    this.saveGroups(groups);
    return groups;
  }

  updateGroup(id: string, updatedGroup: HostGroup): HostGroup[] {
    const groups = this.getGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) {
      throw new Error('Group not found');
    }
    groups[index] = { ...groups[index], ...updatedGroup };
    this.saveGroups(groups);
    return groups;
  }

  deleteGroup(id: string): HostGroup[] {
    const groups = this.getGroups();
    const filteredGroups = groups.filter(g => g.id !== id);
    this.saveGroups(filteredGroups);

    // 同时更新所有属于该 group 的 hosts，将它们的 groupId 设为 undefined
    const hosts = this.getHosts();
    const updatedHosts = hosts.map(h =>
      h.groupId === id ? { ...h, groupId: undefined } : h
    );
    this.saveHosts(updatedHosts);

    return filteredGroups;
  }

  // ==================== 工具 ====================

  clear(): void {
    localStorage.removeItem(this.HOSTS_KEY);
    localStorage.removeItem(this.GROUPS_KEY);
    localStorage.removeItem(this.LAST_SYNC_KEY);
  }

  exportData(): { hosts: Host[]; groups: HostGroup[]; exportTime: string } {
    return {
      hosts: this.getHosts(),
      groups: this.getGroups(),
      exportTime: new Date().toISOString(),
    };
  }

  importData(data: { hosts: Host[]; groups: HostGroup[] }): void {
    this.saveHosts(data.hosts);
    this.saveGroups(data.groups);
  }
}

export const hostStorageService = new HostStorageService();
```

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit 2>&1 | grep hostStorageService`
Expected: No new errors from this file (existing errors in other files are OK).

- [ ] **Step 3: Commit**

```bash
git add src/services/hostStorageService.ts
git commit -m "refactor(hostStorage): remove migration code, rename server→cloud mode"
```

---

### Task 2: Rewrite `hostService.ts` — Two-Mode Architecture

**Files:**
- Modify: `src/services/hostService.ts`

Replace the entire file. Core changes:
- `StorageMode` enum: only `LOCAL` and `CLOUD`
- Remove: `autoSyncEnabled`, `syncToServer()`, `syncFromServer()`, `getSyncStatus()`, `mergeHostsWithLocalAuth()`, `seedLocalStorage()`, `getLocalSnapshot()`
- `local` mode: all ops hit localStorage only
- `cloud` mode: all ops hit server API, cache result to localStorage; `getHosts` uses server-first with local cache fallback
- Credentials (password/sshKey) are preserved in local cache since server doesn't return plaintext credentials

- [ ] **Step 1: Rewrite hostService.ts**

```typescript
import { Host, HostGroup } from '../types';
import { apiService } from './api';
import { hostStorageService } from './hostStorageService';
import { logger, LOG_MODULE } from '../utils/logger';

/**
 * 存储模式
 * - LOCAL: 纯本地 localStorage，不与服务器交互
 * - CLOUD: 服务器为数据源，本地仅缓存（含密码/私钥等服务器不返回的敏感字段）
 */
export enum StorageMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
}

// 兼容旧值：localStorage 中可能存有旧的 SyncMode 值
const LEGACY_CLOUD_VALUES = new Set(['server_only', 'server_first', 'dual_sync']);

/**
 * Host 管理服务
 *
 * local 模式：读写 localStorage（key 后缀 _local）
 * cloud 模式：CRUD 走 API → 成功后更新本地缓存（key 后缀 _cloud）
 *            读取时 server-first，失败 fallback 到本地缓存
 */
class HostService {
  private mode: StorageMode = StorageMode.LOCAL;

  // ── 模式管理 ──

  setUserScope(userId: string | null): void {
    hostStorageService.setUserScope(userId);
  }

  setMode(mode: StorageMode): void {
    this.mode = mode;
    localStorage.setItem('termcat_storage_mode', mode);
    hostStorageService.setStorageMode(mode === StorageMode.CLOUD ? 'cloud' : 'local');
  }

  getMode(): StorageMode {
    const saved = localStorage.getItem('termcat_storage_mode');
    // 兼容旧 key
    if (!saved) {
      const legacy = localStorage.getItem('termcat_sync_mode');
      if (legacy && LEGACY_CLOUD_VALUES.has(legacy)) return StorageMode.CLOUD;
      if (legacy === 'local_only') return StorageMode.LOCAL;
    }
    if (saved === StorageMode.CLOUD) return StorageMode.CLOUD;
    return StorageMode.LOCAL;
  }

  private isCloud(): boolean {
    return this.mode === StorageMode.CLOUD;
  }

  // ── Host CRUD ──

  async getHosts(): Promise<Host[]> {
    if (!this.isCloud()) {
      return hostStorageService.getHosts();
    }

    // Cloud: server-first, fallback to cache
    try {
      const serverHosts = await apiService.getHosts();
      const cached = hostStorageService.getHosts();
      const merged = this.applyCachedCredentials(serverHosts, cached);
      hostStorageService.saveHosts(merged);
      return merged;
    } catch (error) {
      logger.warn(LOG_MODULE.HOST, 'host.cloud.fetch_failed', 'Server fetch failed, using cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return hostStorageService.getHosts();
    }
  }

  async addHost(host: Host): Promise<Host> {
    if (!this.isCloud()) {
      if (!host.id) {
        host.id = `host-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      hostStorageService.addHost(host);
      return host;
    }

    // Cloud: create on server, cache result
    const serverHost = await apiService.createHost(host);
    const result = { ...serverHost, password: host.password, sshKey: host.sshKey } as Host;
    // 刷新整个缓存以保持一致性
    await this.refreshCache();
    return result;
  }

  async updateHost(id: string, updatedHost: Host): Promise<Host> {
    if (!this.isCloud()) {
      hostStorageService.updateHost(id, updatedHost);
      return updatedHost;
    }

    // Cloud: update on server, refresh cache
    const serverHost = await apiService.updateHost(id, updatedHost);
    const cached = hostStorageService.getHostById(id);
    const result = {
      ...serverHost,
      password: updatedHost.password || cached?.password || serverHost.password,
      sshKey: updatedHost.sshKey || cached?.sshKey || serverHost.sshKey,
    } as Host;
    await this.refreshCache();
    return result;
  }

  async deleteHost(id: string): Promise<void> {
    if (!this.isCloud()) {
      hostStorageService.deleteHost(id);
      return;
    }

    // Cloud: delete on server, refresh cache
    await apiService.deleteHost(id);
    await this.refreshCache();
  }

  async getHostById(id: string): Promise<Host | null> {
    const hosts = await this.getHosts();
    return hosts.find(h => h.id === id) || null;
  }

  // ── Group CRUD ──

  async getGroups(): Promise<HostGroup[]> {
    if (!this.isCloud()) {
      return hostStorageService.getGroups();
    }

    try {
      const serverGroups = await apiService.getGroups();
      hostStorageService.saveGroups(serverGroups);
      return serverGroups;
    } catch (error) {
      logger.warn(LOG_MODULE.HOST, 'group.cloud.fetch_failed', 'Server fetch failed, using cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return hostStorageService.getGroups();
    }
  }

  async addGroup(group: HostGroup): Promise<HostGroup> {
    if (!this.isCloud()) {
      if (!group.id) {
        group.id = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      hostStorageService.addGroup(group);
      return group;
    }

    const created = await apiService.createGroup(group);
    hostStorageService.addGroup(created);
    return created;
  }

  async updateGroup(id: string, updatedGroup: HostGroup): Promise<HostGroup> {
    if (!this.isCloud()) {
      hostStorageService.updateGroup(id, updatedGroup);
      return updatedGroup;
    }

    const updated = await apiService.updateGroup(id, updatedGroup);
    hostStorageService.updateGroup(id, updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<void> {
    if (!this.isCloud()) {
      hostStorageService.deleteGroup(id);
      return;
    }

    await apiService.deleteGroup(id);
    hostStorageService.deleteGroup(id);
  }

  // ── 导入导出（仅对当前模式生效） ──

  exportConfig(): string {
    return JSON.stringify(hostStorageService.exportData(), null, 2);
  }

  async importConfig(jsonString: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = JSON.parse(jsonString);
      if (!data.hosts || !Array.isArray(data.hosts)) {
        throw new Error('Invalid format: hosts array not found');
      }
      hostStorageService.importData(data);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '导入失败';
      logger.error(LOG_MODULE.HOST, 'host.import.failed', 'Failed to import config', { error: 1, msg });
      return { success: false, error: msg };
    }
  }

  clearAll(): void {
    hostStorageService.clear();
  }

  // ── 内部工具 ──

  /**
   * 将本地缓存中的密码/私钥补充到服务器返回的 host 列表
   * （服务器不返回明文凭证，需从本地缓存恢复）
   */
  private applyCachedCredentials(serverHosts: Host[], cachedHosts: Host[]): Host[] {
    const cacheById = new Map(cachedHosts.map(h => [h.id, h]));
    return serverHosts.map(sh => {
      const cached = cacheById.get(sh.id);
      if (!cached) return sh;
      return {
        ...sh,
        password: cached.password || sh.password,
        sshKey: cached.sshKey || sh.sshKey,
      };
    });
  }

  /**
   * 从服务器拉取最新数据并更新本地缓存
   */
  private async refreshCache(): Promise<void> {
    try {
      const serverHosts = await apiService.getHosts();
      const cached = hostStorageService.getHosts();
      hostStorageService.saveHosts(this.applyCachedCredentials(serverHosts, cached));
    } catch {
      // 缓存刷新失败不阻塞主流程
    }
  }
}

export const hostService = new HostService();
```

- [ ] **Step 2: Verify no compile errors in hostService**

Run: `npx tsc --noEmit 2>&1 | grep hostService`
Expected: No errors (old errors from removed SyncMode imports in consumers will show — fixed in next tasks).

- [ ] **Step 3: Commit**

```bash
git add src/services/hostService.ts
git commit -m "refactor(hostService): simplify to two-mode local/cloud architecture"
```

---

### Task 3: Update `useHostManager.ts` — Remove Sync Logic

**Files:**
- Modify: `src/services/useHostManager.ts`

Replace `SyncMode` imports with `StorageMode`. Remove `handleSyncFromServer`, `handleSyncToServer`, and the data-seeding logic from `handleStorageModeChange`. The mode switch now simply changes the mode and reloads data from the correct source.

- [ ] **Step 1: Rewrite useHostManager.ts**

Replace the full file. Key changes:
- Import `StorageMode` instead of `SyncMode`
- `handleStorageModeChange`: just set mode + reload data, no sync/seed
- Remove: `handleSyncFromServer`, `handleSyncToServer`, `isSyncing`

```typescript
/**
 * 主机 / 分组 / 代理 CRUD Hook
 */

import { useState, useCallback } from 'react';
import { Host, HostGroup, Proxy, User } from '../types';
import { hostService, StorageMode } from '../services/hostService';
import { apiService } from '../services/api';
import { logger, LOG_MODULE } from '../utils/logger';

export function useHostManager(user: User | null) {
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
    if (!user && hosts.length >= 2) {
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
  }, [user, hosts]);

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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/useHostManager.ts
git commit -m "refactor(useHostManager): simplify to local/cloud mode switch"
```

---

### Task 4: Update `useUserAuth.ts` — Replace SyncMode with StorageMode

**Files:**
- Modify: `src/services/useUserAuth.ts`

Replace all `SyncMode` / `setAutoSync` calls with the new `StorageMode` / `setMode` API.

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { hostService, SyncMode } from '../services/hostService';
```
With:
```typescript
import { hostService, StorageMode } from '../services/hostService';
```

- [ ] **Step 2: Update handleLogin (logged-in user)**

Find the block (around lines 177-188):
```typescript
      const savedMode = hostService.getSyncMode();
      const useLocalOnly = savedMode === SyncMode.LOCAL_ONLY;
      setStorageMode(useLocalOnly ? 'local' : 'server');

      if (useLocalOnly) {
        hostService.setSyncMode(SyncMode.LOCAL_ONLY);
        hostService.setAutoSync(false);
      } else {
        hostService.setSyncMode(SyncMode.DUAL_SYNC);
        hostService.setAutoSync(true);
      }
```

Replace with:
```typescript
      const savedMode = hostService.getMode();
      const useLocal = savedMode === StorageMode.LOCAL;
      setStorageMode(useLocal ? 'local' : 'server');
      hostService.setMode(useLocal ? StorageMode.LOCAL : StorageMode.CLOUD);
```

- [ ] **Step 3: Update handleLogin data fetch**

Find the block (around line 196-197):
```typescript
        useLocalOnly ? hostService.getHosts().then(hosts => ({ success: true as const, hosts, error: undefined })) : hostService.syncFromServer(),
```

Replace with:
```typescript
        hostService.getHosts().then(hosts => ({ success: true as const, hosts, error: undefined })),
```

(In cloud mode, `getHosts()` already fetches from server-first.)

Also replace `useLocalOnly` with `useLocal` in the proxies line:
```typescript
        useLocal ? Promise.resolve([]) : apiService.getProxies(),
```

- [ ] **Step 4: Update guest/logout paths**

Find all remaining references to `setSyncMode` and `setAutoSync`:
- Guest login section: replace `hostService.setSyncMode(SyncMode.LOCAL_ONLY); hostService.setAutoSync(false);` with `hostService.setMode(StorageMode.LOCAL);`
- `handleLogout`: same replacement

- [ ] **Step 5: Commit**

```bash
git add src/services/useUserAuth.ts
git commit -m "refactor(useUserAuth): use StorageMode.LOCAL/CLOUD instead of SyncMode"
```

---

### Task 5: Update `App.tsx` — Replace SyncMode with StorageMode

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { hostService, SyncMode } from '../services/hostService';
```
With:
```typescript
import { hostService, StorageMode } from '../services/hostService';
```

- [ ] **Step 2: Update initializeData**

Find the block (around lines 193-213):
```typescript
        const savedSyncMode = savedUser ? hostService.getSyncMode() : null;
        const isLocalMode = savedSyncMode === SyncMode.LOCAL_ONLY;
        ...
            hostService.setSyncMode(SyncMode.LOCAL_ONLY);
            hostService.setAutoSync(false);
          } else {
            hostService.setSyncMode(SyncMode.DUAL_SYNC);
            hostService.setAutoSync(true);
          ...
          hostService.setSyncMode(SyncMode.LOCAL_ONLY);
          hostService.setAutoSync(false);
```

Replace with:
```typescript
        const savedMode = savedUser ? hostService.getMode() : StorageMode.LOCAL;
        const isLocalMode = savedMode === StorageMode.LOCAL;
        if (savedUser) {
          hostManager.setStorageMode(isLocalMode ? 'local' : 'server');
        }
        hostService.setMode(savedUser ? savedMode : StorageMode.LOCAL);
```

- [ ] **Step 3: Update host fetch in initializeData**

Find:
```typescript
            if (savedUser && !isLocalMode) return hostService.syncFromServer();
            const hosts = await hostService.getHosts();
            return { success: true as const, hosts };
```

Replace with:
```typescript
            const hosts = await hostService.getHosts();
            return { success: true as const, hosts };
```

(`getHosts()` in cloud mode already handles server-first fetch.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "refactor(App): use StorageMode instead of SyncMode"
```

---

### Task 6: Update `Dashboard.tsx` — Remove Sync Buttons (if any)

**Files:**
- Modify: `src/components/Dashboard.tsx` (minor — only the type of `storageMode` prop, no logic change needed)

- [ ] **Step 1: Check Dashboard for sync-related props**

Check if Dashboard.tsx references `handleSyncFromServer`, `handleSyncToServer`, or `isSyncing`. If yes, remove those props. The storage mode toggle (`local` / `server` buttons) stays as-is since those map to the new two modes.

- [ ] **Step 2: Remove `isSyncing` and sync handler props if present**

Remove from props interface and usage if they exist. The `storageMode` and `onStorageModeChange` props stay unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "refactor(Dashboard): remove sync-related props if any"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit 2>&1 | grep -v MonitoringSidebar | grep -v CommandInputArea | head -20`
Expected: No new errors from our changed files.

- [ ] **Step 2: Search for dead references**

Run: `grep -rn 'SyncMode\|autoSync\|syncFromServer\|syncToServer\|setAutoSync\|setSyncMode\|getSyncMode\|DUAL_SYNC\|LOCAL_FIRST\|SERVER_FIRST\|SERVER_ONLY\|LOCAL_ONLY\|getLocalSnapshot\|seedLocalStorage' src/ --include='*.ts' --include='*.tsx'`

Expected: No matches (all old references should be removed). If any remain, update those files.

- [ ] **Step 3: Clean up old localStorage key**

The old `termcat_sync_mode` key is still read by `getMode()` for backward compatibility (the `LEGACY_CLOUD_VALUES` set). This is intentional — existing users' mode preference will be preserved on first load.

- [ ] **Step 4: Commit final cleanup if needed**

```bash
git add -A
git commit -m "refactor: complete host storage simplification — local/cloud two-mode"
```
