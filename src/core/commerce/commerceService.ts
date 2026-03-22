/**
 * 商业化配置服务
 *
 * 职责：
 * - 从服务器拉取商业化配置（订阅版本、价格、权益、积分包）
 * - 本地缓存配置（localStorage）
 * - 权益查询（feature 检查、主机上限、广告开关等）
 * - 版本兼容性处理（Feature 注册表）
 */

import { CommerceConfig, TierConfig, SyncSeqs } from './types';
import { authService } from '@/core/auth/authService';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.APP });

// ============ 版本兼容性：Feature 注册表 ============

/** 当前客户端版本支持的所有 feature ID */
const SUPPORTED_FEATURES: Set<string> = new Set([
  'smart_completion',
  'cloud_sync',
  'system_monitor',
  'file_manager',
  'vim_editor',
  'community_support',
  'advanced_models',
  'premium_models',
  'priority_support',
  'dedicated_support',
]);

// ============ 常量 ============

const STORAGE_KEY_CONFIG = 'termcat_commerce_config';
const STORAGE_KEY_SEQS = 'termcat_seqs';

// ============ Service ============

class CommerceService {
  private config: CommerceConfig | null = null;
  private changeListeners: Array<() => void> = [];

  constructor() {
    this.loadFromCache();
  }

  // ---- 配置加载 ----

  /** 从 localStorage 加载缓存的配置 */
  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (cached) {
        this.config = JSON.parse(cached);
        // DEBUG: 追踪 localStorage 缓存内容
        console.log('[CommerceService] loaded from localStorage, tiers:', this.config?.tiers?.map(t => ({ id: t.id, features: t.features })));
      } else {
        console.log('[CommerceService] no localStorage cache');
      }
    } catch {
      // 解析失败，忽略
    }
  }

  /** 从服务器拉取最新配置 */
  async fetchConfig(): Promise<CommerceConfig | null> {
    try {
      const data = await apiService.getCommerceConfig() as CommerceConfig;
      if (data && data.tiers) {
        this.config = data;
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data));
        // DEBUG: 追踪服务端返回内容
        console.log('[CommerceService] fetched from server, tiers:', data.tiers.map(t => ({ id: t.id, features: t.features })));
        log.info('commerce.config.fetched', 'Commerce config fetched', { seq: data.seq });
        this.notifyChange();
        return data;
      }
    } catch (error) {
      log.error('commerce.config.fetch_failed', 'Failed to fetch commerce config', {
        error: 1,
        msg: (error as Error).message,
      });
    }
    return this.config;
  }

  /** 获取当前配置（可能为缓存值） */
  getConfig(): CommerceConfig | null {
    return this.config;
  }

  // ---- Seq 同步 ----

  /** 获取本地缓存的 seqs */
  getCachedSeqs(): SyncSeqs | null {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_SEQS);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /** 保存 seqs 到本地 */
  saveCachedSeqs(seqs: SyncSeqs): void {
    localStorage.setItem(STORAGE_KEY_SEQS, JSON.stringify(seqs));
  }

  /** 登录后处理 seq 同步 */
  async handleLoginSeqs(serverSeqs: SyncSeqs): Promise<void> {
    const localSeqs = this.getCachedSeqs();

    // 商业化配置 seq 变化 → 拉取更新
    if (!localSeqs || serverSeqs.commerce !== localSeqs.commerce) {
      await this.fetchConfig();
    }

    // 保存最新 seqs
    this.saveCachedSeqs(serverSeqs);
  }

  // ---- Tier 查询 ----

  /** 获取指定 tier 的配置 */
  getTierConfig(tierId: string): TierConfig | undefined {
    return this.config?.tiers.find(t => t.id === tierId);
  }

  /** 获取当前用户的 tier 配置 */
  getCurrentTierConfig(): TierConfig | undefined {
    const user = authService.getUser();
    return this.getTierConfig(user?.tier || 'Standard');
  }

  // ---- 权益查询 ----

  /** 检查当前用户是否有某功能权限 */
  hasFeature(feature: string): boolean {
    // 未知 feature 一律返回 false，不抛异常
    if (!SUPPORTED_FEATURES.has(feature)) return false;

    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.features.includes(feature) ?? false;
  }

  /** 获取当前 tier 的主机上限 */
  getMaxHosts(): number {
    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.max_hosts ?? 100;
  }

  /** 检查是否免广告 */
  isAdFree(): boolean {
    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.ad_free ?? false;
  }

  /** 获取每日 agent 请求限制，0 = 无限 */
  getAgentDailyLimit(): number {
    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.agent_daily_limit ?? 10;
  }

  /** 获取可用模型列表 */
  getAvailableModels(): string[] {
    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.available_models ?? ['open_source'];
  }

  // ---- 版本兼容性 ----

  /** 解析 tier 的 features，分为已支持和未支持两组 */
  parseTierFeatures(tierConfig: TierConfig): {
    supported: string[];
    unsupported: string[];
  } {
    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const feature of tierConfig.features) {
      if (SUPPORTED_FEATURES.has(feature)) {
        supported.push(feature);
      } else {
        unsupported.push(feature);
      }
    }
    return { supported, unsupported };
  }

  /** 获取当前用户在当前版本下不可用的权益列表 */
  getUnsupportedFeatures(): string[] {
    const tierConfig = this.getCurrentTierConfig();
    if (!tierConfig) return [];
    return tierConfig.features.filter(f => !SUPPORTED_FEATURES.has(f));
  }

  /** 获取 feature 的显示名称（从 feature_meta 中读取） */
  getFeatureDisplayName(featureId: string, language: string = 'zh'): string {
    const meta = this.config?.feature_meta;
    if (meta && meta[featureId]) {
      return meta[featureId][language] || meta[featureId]['en'] || featureId;
    }
    return featureId;
  }

  // ---- 变更通知 ----

  /** 注册配置变更监听器 */
  onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  private notifyChange(): void {
    this.changeListeners.forEach(l => {
      try { l(); } catch { /* ignore */ }
    });
  }

  // ---- 清理 ----

  /** 清理缓存（登出时调用） */
  clear(): void {
    this.config = null;
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    localStorage.removeItem(STORAGE_KEY_SEQS);
  }
}

export const commerceService = new CommerceService();
