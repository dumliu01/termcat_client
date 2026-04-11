/**
 * Ad Service - Multi-platform Aggregator
 *
 * Responsibilities:
 * - Manage multiple ad platform instances (self-hosted / CSJ / GDT / Carbon Ads)
 * - Fetch ad rules from TermCat Server
 * - Fetch ad content from each platform by priority
 * - Unified reporting of impressions and clicks
 * - Rule caching and frequency control
 */

import {
  IAdPlatform,
  AdPlatformType,
  AdPlatformConfig,
  AdRequestContext,
  AdContent,
  AdRule,
  AdRulesResponse,
  AdDisplayState,
  AdTriggerType,
} from './types';
import { TierType } from '@/utils/types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

// Platform implementations (lazy import to avoid circular dependencies)
import { SelfHostedPlatform } from './platforms/SelfHostedPlatform';
import { CSJPlatform } from './platforms/CSJPlatform';
import { GDTPlatform } from './platforms/GDTPlatform';
import { CarbonAdsPlatform } from './platforms/CarbonAdsPlatform';
import { AdMobPlatform } from './platforms/AdMobPlatform';
import { AdsterraPlatform } from './platforms/AdsterraPlatform';

const log = logger.withFields({ module: LOG_MODULE.UI });

class AdService {
  /** Registered platform instances */
  private platforms: Map<AdPlatformType, IAdPlatform> = new Map();

  /** Cached ad rules */
  private rules: AdRule[] = [];
  private rulesEnabled = false;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /** Display frequency control state */
  private displayStates: Map<string, AdDisplayState> = new Map();

  /** Initialize all platforms */
  async initPlatforms(configs?: Record<AdPlatformType, AdPlatformConfig>): Promise<void> {
    // Register all platforms
    const platformInstances: IAdPlatform[] = [
      new SelfHostedPlatform(),
      new CSJPlatform(),
      new GDTPlatform(),
      new CarbonAdsPlatform(),
      new AdMobPlatform(),
      new AdsterraPlatform(),
    ];

    for (const platform of platformInstances) {
      const config = configs?.[platform.platformId] || {};
      try {
        await platform.init(config);
        this.platforms.set(platform.platformId, platform);
      } catch (err) {
        log.error('ad.platform.init.failed', `Failed to init platform: ${platform.platformName}`, {
          error: 1,
          msg: (err as Error).message,
          platform: platform.platformId,
        });
      }
    }

    log.debug('ad.service.init', 'Ad service initialized', { platformCount: this.platforms.size });
  }

  /** Fetch ad rules (with caching) */
  async fetchRules(): Promise<AdRulesResponse> {
    if (Date.now() < this.cacheExpiry && this.rules.length > 0) {
      return { enabled: this.rulesEnabled, rules: this.rules };
    }

    try {
      const response = await apiService.getAdRules();
      this.rules = response.rules || [];
      this.rulesEnabled = response.enabled ?? true;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      // Re-initialize with platform configs
      if (response.platformConfigs) {
        await this.initPlatforms(response.platformConfigs);
      }

      log.debug('ad.rules.fetched', 'Ad rules fetched', { count: this.rules.length, enabled: this.rulesEnabled });
      return response;
    } catch (err) {
      log.debug('ad.rules.fetch.failed', 'Failed to fetch ad rules', { error: (err as Error).message });
      return { enabled: false, rules: [] };
    }
  }

  /** Get matching ad rules */
  getMatchingRules(triggerType: AdTriggerType, tier: TierType | 'guest'): AdRule[] {
    const now = new Date();

    return this.rules
      .filter((rule) => {
        // Trigger type match
        if (rule.trigger.type !== triggerType) return false;

        // Targeting match
        if (tier === 'guest') {
          if (!rule.targeting.includeGuest) return false;
        } else {
          if (!rule.targeting.tiers.includes(tier)) return false;
        }

        // Time range
        if (rule.startTime && now < new Date(rule.startTime)) return false;
        if (rule.endTime && now > new Date(rule.endTime)) return false;

        // Frequency control
        if (!this.canShow(rule)) return false;

        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  /** Fetch ad content from specified platform */
  async fetchAdContent(platformId: AdPlatformType, context: AdRequestContext): Promise<AdContent[]> {
    const platform = this.platforms.get(platformId);
    if (!platform) return [];

    try {
      return await platform.fetchAds(context);
    } catch (err) {
      log.debug('ad.content.fetch.failed', `Failed to fetch from ${platformId}`, { error: (err as Error).message });
      return [];
    }
  }

  /** Report ad impression */
  async reportImpression(adId: string, platformId: AdPlatformType, ruleId: string): Promise<void> {
    // Update frequency state
    this.recordShow(ruleId);

    // Report to the corresponding platform
    const platform = this.platforms.get(platformId);
    if (platform) {
      platform.reportImpression(adId).catch(() => {});
    }
  }

  /** Report ad click */
  async reportClick(adId: string, platformId: AdPlatformType): Promise<void> {
    const platform = this.platforms.get(platformId);
    if (platform) {
      platform.reportClick(adId).catch(() => {});
    }
  }

  /** Check if ad can be shown (frequency control) */
  canShow(rule: AdRule): boolean {
    const state = this.displayStates.get(rule.id);
    if (!state) return true;

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // Reset daily count on date change
    const dailyCount = state.lastDate === today ? state.dailyCount : 0;

    if (state.sessionCount >= rule.frequency.maxPerSession) return false;
    if (dailyCount >= rule.frequency.maxPerDay) return false;
    if (now - state.lastShownAt < rule.frequency.cooldownSeconds * 1000) return false;

    return true;
  }

  /** Record one display */
  private recordShow(ruleId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.displayStates.get(ruleId);

    if (existing) {
      // Reset on date change
      if (existing.lastDate !== today) {
        existing.dailyCount = 0;
        existing.lastDate = today;
      }
      existing.sessionCount += 1;
      existing.dailyCount += 1;
      existing.lastShownAt = Date.now();
    } else {
      this.displayStates.set(ruleId, {
        ruleId,
        sessionCount: 1,
        dailyCount: 1,
        lastShownAt: Date.now(),
        lastDate: today,
      });
    }
  }

  /** Reset session-level counts (called on new terminal session) */
  resetSessionCounts(): void {
    for (const state of this.displayStates.values()) {
      state.sessionCount = 0;
    }
  }

  /** Global ad switch */
  get isEnabled(): boolean {
    return this.rulesEnabled;
  }

  /** Get registered platform list */
  get registeredPlatforms(): AdPlatformType[] {
    return Array.from(this.platforms.keys());
  }

  /** Destroy all platforms */
  destroy(): void {
    for (const platform of this.platforms.values()) {
      platform.destroy();
    }
    this.platforms.clear();
    this.rules = [];
    this.displayStates.clear();
  }
}

export const adService = new AdService();
