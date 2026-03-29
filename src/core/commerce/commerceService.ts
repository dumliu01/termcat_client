/**
 * Commerce Configuration Service
 *
 * Responsibilities:
 * - Fetch commerce config from server (subscription tiers, prices, benefits, gem packages)
 * - Local cache config (localStorage)
 * - Benefits query (feature checks, host limits, ad switches, etc.)
 * - Version compatibility handling (Feature registry)
 */

import { CommerceConfig, TierConfig, SyncSeqs } from './types';
import { authService } from '@/core/auth/authService';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.APP });

// ============ Version Compatibility: Feature Registry ============

/** All feature IDs supported by current client version */
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

// ============ Constants ============

const STORAGE_KEY_CONFIG = 'termcat_commerce_config';
const STORAGE_KEY_SEQS = 'termcat_seqs';

// ============ Service ============

class CommerceService {
  private config: CommerceConfig | null = null;
  private changeListeners: Array<() => void> = [];

  constructor() {
    this.loadFromCache();
  }

  // ---- Config Loading ----

  /** Load cached config from localStorage */
  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (cached) {
        this.config = JSON.parse(cached);
        log.debug('commerce.cache.loaded', 'Loaded from cache');
      } else {
        log.debug('commerce.cache.empty', 'No cache found');
      }
    } catch {
      // Parse failed, ignore
    }
  }

  /** Fetch latest config from server */
  async fetchConfig(): Promise<CommerceConfig | null> {
    try {
      const data = await apiService.getCommerceConfig() as CommerceConfig;
      if (data && data.tiers) {
        this.config = data;
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data));
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

  /** Get current config (may be cached value) */
  getConfig(): CommerceConfig | null {
    return this.config;
  }

  // ---- Seq Sync ----

  /** Get locally cached seqs */
  getCachedSeqs(): SyncSeqs | null {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_SEQS);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /** Save seqs to local */
  saveCachedSeqs(seqs: SyncSeqs): void {
    localStorage.setItem(STORAGE_KEY_SEQS, JSON.stringify(seqs));
  }

  /** Handle seq sync after login */
  async handleLoginSeqs(serverSeqs: SyncSeqs): Promise<void> {
    const localSeqs = this.getCachedSeqs();

    // Commerce config seq changed → fetch update
    if (!localSeqs || serverSeqs.commerce !== localSeqs.commerce) {
      await this.fetchConfig();
    }

    // Save latest seqs
    this.saveCachedSeqs(serverSeqs);
  }

  // ---- Tier Query ----

  /** Get config for specified tier */
  getTierConfig(tierId: string): TierConfig | undefined {
    return this.config?.tiers.find(t => t.id === tierId);
  }

  /** Get current user's tier config */
  getCurrentTierConfig(): TierConfig | undefined {
    const user = authService.getUser();
    return this.getTierConfig(user?.tier || 'Standard');
  }

  // ---- Benefits Query ----

  /** Check if current user has feature permission */
  hasFeature(feature: string): boolean {
    // Unknown features return false by default, no exception thrown
    if (!SUPPORTED_FEATURES.has(feature)) return false;

    const tierConfig = this.getCurrentTierConfig();
    return tierConfig?.features.includes(feature) ?? false;
  }

  /** Get current tier's host limit — v2: no host limit for all users */
  getMaxHosts(): number {
    return 999;
  }

  /** Check if ad-free — v2: ad-free for all users */
  isAdFree(): boolean {
    return true;
  }

  /** Get daily agent request limit, 0 = unlimited — v2: unlimited for all */
  getAgentDailyLimit(): number {
    return 0;
  }

  /** Get available models list — v2: all models available for all users */
  getAvailableModels(): string[] {
    const tierConfig = this.getCurrentTierConfig();
    const allModels = this.config?.tiers.flatMap(t => t.available_models) ?? [];
    const unique = [...new Set([...allModels, ...(tierConfig?.available_models ?? ['open_source'])])];
    return unique.length > 0 ? unique : ['open_source', 'advanced', 'premium'];
  }

  // ---- Version Compatibility ----

  /** Parse tier's features, divide into supported and unsupported groups */
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

  /** Get list of unavailable benefits for current user in current version */
  getUnsupportedFeatures(): string[] {
    const tierConfig = this.getCurrentTierConfig();
    if (!tierConfig) return [];
    return tierConfig.features.filter(f => !SUPPORTED_FEATURES.has(f));
  }

  /** Get feature display name (read from feature_meta) */
  getFeatureDisplayName(featureId: string, language: string = 'zh'): string {
    const meta = this.config?.feature_meta;
    if (meta && meta[featureId]) {
      return meta[featureId][language] || meta[featureId]['en'] || featureId;
    }
    return featureId;
  }

  // ---- Change Notification ----

  /** Register config change listener */
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

  // ---- Cleanup ----

  /** Clear cache (called on logout) */
  clear(): void {
    this.config = null;
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    localStorage.removeItem(STORAGE_KEY_SEQS);
  }
}

export const commerceService = new CommerceService();
