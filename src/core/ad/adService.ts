/**
 * 广告服务 - 多平台聚合器
 *
 * 职责：
 * - 管理多个广告平台实例（自建 / 穿山甲 / 优量汇 / Carbon Ads）
 * - 拉取广告规则（从 TermCat Server）
 * - 按优先级从各平台获取广告内容
 * - 统一上报展示和点击
 * - 规则缓存和频率控制
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

// 平台实现（延迟导入避免循环依赖）
import { SelfHostedPlatform } from './platforms/SelfHostedPlatform';
import { CSJPlatform } from './platforms/CSJPlatform';
import { GDTPlatform } from './platforms/GDTPlatform';
import { CarbonAdsPlatform } from './platforms/CarbonAdsPlatform';
import { AdMobPlatform } from './platforms/AdMobPlatform';
import { AdsterraPlatform } from './platforms/AdsterraPlatform';

const log = logger.withFields({ module: LOG_MODULE.UI });

class AdService {
  /** 已注册的平台实例 */
  private platforms: Map<AdPlatformType, IAdPlatform> = new Map();

  /** 缓存的广告规则 */
  private rules: AdRule[] = [];
  private rulesEnabled = false;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟

  /** 展示频率控制状态 */
  private displayStates: Map<string, AdDisplayState> = new Map();

  /** 初始化所有平台 */
  async initPlatforms(configs?: Record<AdPlatformType, AdPlatformConfig>): Promise<void> {
    // 注册所有平台
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

    log.info('ad.service.init', 'Ad service initialized', { platformCount: this.platforms.size });
  }

  /** 拉取广告规则（带缓存） */
  async fetchRules(): Promise<AdRulesResponse> {
    if (Date.now() < this.cacheExpiry && this.rules.length > 0) {
      return { enabled: this.rulesEnabled, rules: this.rules };
    }

    try {
      const response = await apiService.getAdRules();
      this.rules = response.rules || [];
      this.rulesEnabled = response.enabled ?? true;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      // 用平台配置重新初始化
      if (response.platformConfigs) {
        await this.initPlatforms(response.platformConfigs);
      }

      log.info('ad.rules.fetched', 'Ad rules fetched', { count: this.rules.length, enabled: this.rulesEnabled });
      return response;
    } catch (err) {
      log.debug('ad.rules.fetch.failed', 'Failed to fetch ad rules', { error: (err as Error).message });
      return { enabled: false, rules: [] };
    }
  }

  /** 获取匹配的广告规则 */
  getMatchingRules(triggerType: AdTriggerType, tier: TierType | 'guest'): AdRule[] {
    const now = new Date();

    return this.rules
      .filter((rule) => {
        // 触发类型匹配
        if (rule.trigger.type !== triggerType) return false;

        // 定向匹配
        if (tier === 'guest') {
          if (!rule.targeting.includeGuest) return false;
        } else {
          if (!rule.targeting.tiers.includes(tier)) return false;
        }

        // 时间范围
        if (rule.startTime && now < new Date(rule.startTime)) return false;
        if (rule.endTime && now > new Date(rule.endTime)) return false;

        // 频率控制
        if (!this.canShow(rule)) return false;

        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  /** 从指定平台获取广告内容 */
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

  /** 上报广告展示 */
  async reportImpression(adId: string, platformId: AdPlatformType, ruleId: string): Promise<void> {
    // 更新频率状态
    this.recordShow(ruleId);

    // 上报到对应平台
    const platform = this.platforms.get(platformId);
    if (platform) {
      platform.reportImpression(adId).catch(() => {});
    }
  }

  /** 上报广告点击 */
  async reportClick(adId: string, platformId: AdPlatformType): Promise<void> {
    const platform = this.platforms.get(platformId);
    if (platform) {
      platform.reportClick(adId).catch(() => {});
    }
  }

  /** 检查是否可以展示（频率控制） */
  canShow(rule: AdRule): boolean {
    const state = this.displayStates.get(rule.id);
    if (!state) return true;

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // 日期切换时重置每日计数
    const dailyCount = state.lastDate === today ? state.dailyCount : 0;

    if (state.sessionCount >= rule.frequency.maxPerSession) return false;
    if (dailyCount >= rule.frequency.maxPerDay) return false;
    if (now - state.lastShownAt < rule.frequency.cooldownSeconds * 1000) return false;

    return true;
  }

  /** 记录一次展示 */
  private recordShow(ruleId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.displayStates.get(ruleId);

    if (existing) {
      // 日期切换时重置
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

  /** 重置会话级计数（新终端会话时调用） */
  resetSessionCounts(): void {
    for (const state of this.displayStates.values()) {
      state.sessionCount = 0;
    }
  }

  /** 广告全局开关 */
  get isEnabled(): boolean {
    return this.rulesEnabled;
  }

  /** 获取已注册平台列表 */
  get registeredPlatforms(): AdPlatformType[] {
    return Array.from(this.platforms.keys());
  }

  /** 销毁所有平台 */
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
