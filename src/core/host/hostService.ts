import { Host, HostGroup, Proxy } from '@/utils/types';
import { SyncSeqs } from '@/core/commerce/types';
import { apiService } from '@/base/http/api';
import { hostStorageService } from './hostStorageService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * Storage mode
 * - LOCAL: Pure local localStorage, no server interaction
 * - CLOUD: Server as data source, local only caches (including sensitive fields like password/privateKey that server doesn't return)
 */
export enum StorageMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
}

// Backward compatible with legacy values: old SyncMode values may exist in localStorage
const LEGACY_CLOUD_VALUES = new Set(['server_only', 'server_first', 'dual_sync']);

/**
 * Host Management Service
 *
 * local mode: read/write localStorage (key suffix _local)
 * cloud mode: CRUD via API → update local cache after success (key suffix _cloud)
 *             Read: server-first, fallback to local cache on failure
 */
class HostService {
  private mode: StorageMode = StorageMode.LOCAL;

  // ── Mode Management ──

  setUserScope(userId: string | null): void {
    hostStorageService.setUserScope(userId);
  }

  setMode(mode: StorageMode): void {
    this.mode = mode;
    localStorage.setItem('termcat_storage_mode', mode);
    hostStorageService.setStorageMode(mode === StorageMode.CLOUD ? 'server' : 'local');
  }

  getMode(): StorageMode {
    const saved = localStorage.getItem('termcat_storage_mode');
    // Backward compatible with legacy key
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

  // ── Seq Incremental Sync ──

  /**
   * Compare server seqs with local cached seqs, only fetch changed resources
   * Returns { hosts, groups, proxies } latest data
   */
  async syncBySeqs(serverSeqs: SyncSeqs): Promise<{
    hosts: Host[];
    groups: HostGroup[];
    proxies: Proxy[];
    changed: { hosts: boolean; groups: boolean; proxies: boolean };
  }> {
    const localSeqs = hostStorageService.getSeqs();
    const needHosts = !localSeqs || serverSeqs.hosts !== localSeqs.hosts;
    const needGroups = !localSeqs || serverSeqs.groups !== localSeqs.groups;
    const needProxies = !localSeqs || serverSeqs.proxies !== localSeqs.proxies;

    logger.info(LOG_MODULE.HOST, 'host.sync.seq_compare', 'Comparing seqs for incremental sync', {
      local_seqs: localSeqs,
      server_seqs: serverSeqs,
      need_hosts: needHosts,
      need_groups: needGroups,
      need_proxies: needProxies,
    });

    const results = await Promise.allSettled([
      needHosts ? this.getHosts() : Promise.resolve(hostStorageService.getHosts()),
      needGroups ? this.getGroups() : Promise.resolve(hostStorageService.getGroups()),
      needProxies ? apiService.getProxies().then((p: Proxy[]) => {
        hostStorageService.saveProxies(p);
        return p;
      }).catch(() => hostStorageService.getProxies()) : Promise.resolve(hostStorageService.getProxies()),
    ]);

    const hosts = results[0].status === 'fulfilled' ? results[0].value : hostStorageService.getHosts();
    const groups = results[1].status === 'fulfilled' ? results[1].value : hostStorageService.getGroups();
    const proxies = results[2].status === 'fulfilled' ? results[2].value : hostStorageService.getProxies();

    // Update local seqs
    hostStorageService.saveSeqs(serverSeqs);

    return {
      hosts,
      groups,
      proxies,
      changed: { hosts: needHosts, groups: needGroups, proxies: needProxies },
    };
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
    logger.info(LOG_MODULE.HOST, 'host.add.start', 'Adding host', {
      host_name: host.name,
      mode: this.mode,
      is_cloud: this.isCloud(),
    });

    if (!this.isCloud()) {
      if (!host.id) {
        host.id = `host-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      hostStorageService.addHost(host);
      logger.info(LOG_MODULE.HOST, 'host.add.local_ok', 'Host saved locally', { host_id: host.id });
      return host;
    }

    // Cloud: create on server, cache credentials, then refresh
    const serverHost = await apiService.createHost(host);
    const result = { ...serverHost, password: host.password, sshKey: host.sshKey } as Host;
    // Write host with credentials to cache first, ensuring applyCachedCredentials can find password during refreshCache
    this.cacheHostCredentials(result);
    await this.refreshCache();
    logger.info(LOG_MODULE.HOST, 'host.add.cloud_ok', 'Host created on server', { host_id: result.id });
    return result;
  }

  async updateHost(id: string, updatedHost: Host): Promise<Host> {
    if (!this.isCloud()) {
      hostStorageService.updateHost(id, updatedHost);
      return updatedHost;
    }

    // Cloud: update on server, cache credentials, then refresh
    const serverHost = await apiService.updateHost(id, updatedHost);
    const cached = hostStorageService.getHostById(id);
    const result = {
      ...serverHost,
      password: updatedHost.password || cached?.password || serverHost.password,
      sshKey: updatedHost.sshKey || cached?.sshKey || serverHost.sshKey,
    } as Host;
    // Update credentials in cache first, ensuring they are not lost during refreshCache
    this.cacheHostCredentials(result);
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
    logger.info(LOG_MODULE.HOST, 'group.add.start', 'Adding group', {
      group_name: group.name,
      mode: this.mode,
      is_cloud: this.isCloud(),
    });

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

  // ── Import/Export (only affects current mode) ──

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
      const msg = error instanceof Error ? error.message : 'Import failed';
      logger.error(LOG_MODULE.HOST, 'host.import.failed', 'Failed to import config', { error: 1, msg });
      return { success: false, error: msg };
    }
  }

  clearAll(): void {
    hostStorageService.clear();
  }

  // ── Internal Utilities ──

  /**
   * Write single host's credentials to local cache (add or update)
   * Ensures applyCachedCredentials can find password during refreshCache / getHosts
   */
  private cacheHostCredentials(host: Host): void {
    const hosts = hostStorageService.getHosts();
    const index = hosts.findIndex(h => h.id === host.id);
    if (index !== -1) {
      hosts[index] = { ...hosts[index], password: host.password, sshKey: host.sshKey };
    } else {
      hosts.push(host);
    }
    hostStorageService.saveHosts(hosts);
  }

  /**
   * Merge passwords/privateKeys from local cache into server-returned host list
   * (Server doesn't return plaintext credentials, need to restore from local cache)
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
   * Fetch latest data from server and update local cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const serverHosts = await apiService.getHosts();
      const cached = hostStorageService.getHosts();
      hostStorageService.saveHosts(this.applyCachedCredentials(serverHosts, cached));
    } catch {
      // Cache refresh failure does not block main flow
    }
  }
}

export const hostService = new HostService();
