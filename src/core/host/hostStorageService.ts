import { Host, HostGroup, Proxy } from '@/utils/types';
import { SyncSeqs } from '@/core/commerce/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * Local Storage Service
 * Responsible for saving Host / Group / Proxy info to localStorage
 *
 * local mode and cloud mode use completely independent localStorage keys, no interference.
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
   * Set user scope, switch storage key prefix
   * When userId is null, use guest scope
   */
  setUserScope(userId: string | null): void {
    this.userScope = userId ? String(userId) : 'guest';
    this.updateKeys();
  }

  /**
   * Set storage mode, local and server use completely independent localStorage keys
   * (suffix _local / _server, two sets of keys do not interfere)
   */
  setStorageMode(mode: 'local' | 'server'): void {
    this.storageMode = mode;
    this.updateKeys();
  }

  /**
   * Calculate localStorage key based on current userScope + storageMode
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

  // ==================== Host Operations ====================

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
      throw new Error('Failed to save locally');
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

  // ==================== Group Operations ====================

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
      throw new Error('Failed to save locally');
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

  // ==================== Proxy Operations ====================

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

  // ==================== Seq Incremental Sync ====================

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

  // ==================== Clear Server Cache ====================

  /**
   * Only clear cache data in server mode (hosts_server / groups_server / proxies_server / seqs)
   * Does not affect data in local mode (hosts_local / groups_local)
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

  // ==================== Utilities ====================

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
