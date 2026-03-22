/**
 * Carbon Ads 广告平台
 *
 * 面向开发者和技术人群的广告平台，
 * 广告质量高、无侵入性，常见于技术文档站和开发者工具。
 *
 * 文档: https://www.carbonads.net/
 * API: Carbon Ads 提供 JSON endpoint 供服务端调用。
 *
 * 本实现采用服务端代理模式：
 * 客户端 → TermCat Server → Carbon Ads JSON API → 返回广告
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class CarbonAdsPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'carbon';
  readonly platformName = 'Carbon Ads';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.info('ad.platform.init', 'Carbon Ads platform initialized', { slotId: config.slotId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // 通过 TermCat Server 代理请求 Carbon Ads
      const response = await apiService.fetchPlatformAds('carbon', {
        serve_id: this.config.slotId,
        placement: this.config.extra?.placement || 'termcat',
        language: context.language,
        trigger: context.triggerType,
      });

      return (response || []).map((item: any) => ({
        adId: item.ad_id || `carbon_${Date.now()}`,
        platform: 'carbon' as AdPlatformType,
        type: 'markdown' as const,
        message: this.formatAdMessage(item, context.language),
        actionText: item.action_text || 'Sponsored',
        actionUrl: item.click_url || item.statlink,
        actionType: 'url' as const,
        renderMode: 'api' as const,
      }));
    } catch (err) {
      log.debug('ad.carbon.fetch.failed', 'Failed to fetch Carbon ads', { error: (err as Error).message });
      return [];
    }
  }

  async reportImpression(adId: string): Promise<void> {
    try {
      await apiService.reportAdImpression(adId, this.platformId);
    } catch {
      // fire-and-forget
    }
  }

  async reportClick(adId: string): Promise<void> {
    try {
      await apiService.reportAdClick(adId, this.platformId);
    } catch {
      // fire-and-forget
    }
  }

  destroy(): void {
    this.initialized = false;
  }

  /** 将 Carbon Ads 数据格式化为 AI 助手口吻的 Markdown */
  private formatAdMessage(item: any, language: string): string {
    const company = item.company || '';
    const description = item.description || '';
    const imageUrl = item.image;
    const prefix = language === 'zh' ? '推荐' : 'Recommended';
    const parts: string[] = [];
    if (imageUrl) {
      parts.push(`![ad](${imageUrl})`);
    }
    parts.push(`**${prefix}**: ${company}`);
    if (description) parts.push(description);
    return parts.join('\n\n');
  }
}
