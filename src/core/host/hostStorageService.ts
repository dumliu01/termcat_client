import { Host, HostGroup, Proxy } from '@/utils/types';
import { SyncSeqs } from '@/core/commerce/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * 本地存储服务
 * 负责将 Host / Group / Proxy 信息保存到 localStorage
 *
 * local 模式和 cloud 模式使用完全独立的 localStorage key，互不干扰。
 */
class HostStorageService {
  private HOSTS_KEY = 'termcat_hosts';
  private GROUPS_KEY = 'termcat_host_groups';
  private PROXIES_KEY = 'termcat_proxies';
  private LAST_SYNC_KEY = 'termcat_last_sync';
  private SEQS_KEY = 'termcat_sync_seqs';

  private userScope: string = 'guest';
  private storageMode: 'local' | 'server' = 'local';

  /**
   * 设置用户作用域，切换存储 key 前缀
   * userId 为 null 时使用游客作用域 (guest)
   */
  setUserScope(userId: string | null): void {
    this.userScope = userId ? String(userId) : 'guest';
    this.updateKeys();
  }

  /**
   * 设置存储模式，local 和 server 使用完全独立的 localStorage key
   * （后缀 _local / _server，两套 key 互不干扰）
   */
  setStorageMode(mode: 'local' | 'server'): void {
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
    this.PROXIES_KEY = `termcat_proxies_${scope}_${mode}`;
    this.LAST_SYNC_KEY = `termcat_last_sync_${scope}_${mode}`;
    this.SEQS_KEY = `termcat_sync_seqs_${scope}`;
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

    const hosts = this.getHosts();
    const updatedHosts = hosts.map(h =>
      h.groupId === id ? { ...h, groupId: undefined } : h
    );
    this.saveHosts(updatedHosts);

    return filteredGroups;
  }

  // ==================== Proxy 操作 ====================

  getProxies(): Proxy[] {
    try {
      const json = localStorage.getItem(this.PROXIES_KEY);
      if (!json) return [];
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  saveProxies(proxies: Proxy[]): void {
    try {
      localStorage.setItem(this.PROXIES_KEY, JSON.stringify(proxies));
    } catch (error) {
      logger.error(LOG_MODULE.HTTP, 'storage.proxies.save_failed', 'Failed to save proxies to localStorage', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ==================== Seq 增量同步 ====================

  getSeqs(): SyncSeqs | null {
    try {
      const json = localStorage.getItem(this.SEQS_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }

  saveSeqs(seqs: SyncSeqs): void {
    localStorage.setItem(this.SEQS_KEY, JSON.stringify(seqs));
  }

  // ==================== 清除服务器缓存 ====================

  /**
   * 仅清除服务器模式下的缓存数据（hosts_server / groups_server / proxies_server / seqs）
   * 不影响本地模式的数据（hosts_local / groups_local）
   */
  clearServerCache(userId: string): void {
    const prefix = `termcat_hosts_${userId}_server`;
    const groupsKey = `termcat_host_groups_${userId}_server`;
    const proxiesKey = `termcat_proxies_${userId}_server`;
    const seqsKey = `termcat_sync_seqs_${userId}`;
    const syncKey = `termcat_last_sync_${userId}_server`;

    localStorage.removeItem(prefix);
    localStorage.removeItem(groupsKey);
    localStorage.removeItem(proxiesKey);
    localStorage.removeItem(seqsKey);
    localStorage.removeItem(syncKey);

    logger.info(LOG_MODULE.HTTP, 'storage.server_cache.cleared', 'Server cache cleared', { user_id: userId });
  }

  // ==================== 工具 ====================

  clear(): void {
    localStorage.removeItem(this.HOSTS_KEY);
    localStorage.removeItem(this.GROUPS_KEY);
    localStorage.removeItem(this.PROXIES_KEY);
    localStorage.removeItem(this.LAST_SYNC_KEY);
    localStorage.removeItem(this.SEQS_KEY);
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
