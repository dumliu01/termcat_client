import { Host, HostGroup, Proxy } from '@/utils/types';
import { SyncSeqs } from '@/core/commerce/types';
import { apiService } from '@/base/http/api';
import { hostStorageService } from './hostStorageService';
import { logger, LOG_MODULE } from '@/base/logger/logger';

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
    hostStorageService.setStorageMode(mode === StorageMode.CLOUD ? 'server' : 'local');
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

  // ── Seq 增量同步 ──

  /**
   * 根据服务端 seqs 与本地缓存 seqs 对比，仅拉取有变化的资源
   * 返回 { hosts, groups, proxies } 最新数据
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

    // 更新本地 seqs
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
    // 先将带凭证的 host 写入缓存，确保 refreshCache 时 applyCachedCredentials 能找到密码
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
    // 先更新缓存中的凭证，确保 refreshCache 时不丢失
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
   * 将单个 host 的凭证写入本地缓存（新增或更新）
   * 确保后续 refreshCache / getHosts 时 applyCachedCredentials 能找到密码
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
