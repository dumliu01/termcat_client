/**
 * ByteDance CSJ Ad Platform (Pangolin / 穿山甲)
 *
 * ByteDance's ad network, one of China's largest ad platforms.
 * Supports various ad formats: feed ads, splash ads, reward videos, etc.
 *
 * Docs: https://www.csjplatform.com/
 * Server API: https://open.oceanengine.com/
 *
 * This implementation uses Server-to-Server (S2S) mode:
 * Client → TermCat Server → CSJ API → Return ad content
 * This protects AppKey and adapts to desktop scenarios.
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class CSJPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'csj';
  readonly platformName = 'CSJ';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.info('ad.platform.init', 'CSJ platform initialized', { appId: config.appId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // Request CSJ ads via TermCat Server proxy
      const response = await apiService.fetchPlatformAds('csj', {
        slot_id: this.config.slotId,
        tier: context.tier,
        language: context.language,
        trigger: context.triggerType,
      });

      return (response || []).map((item: any) => ({
        adId: item.ad_id || `csj_${Date.now()}`,
        platform: 'csj' as AdPlatformType,
        type: 'markdown' as const,
        message: this.formatAdMessage(item),
        actionText: item.action_text || (context.language === 'zh' ? '了解详情' : 'Learn More'),
        actionUrl: item.click_url,
        actionType: 'url' as const,
        renderMode: 'api' as const,
      }));
    } catch (err) {
      log.debug('ad.csj.fetch.failed', 'Failed to fetch CSJ ads', { error: (err as Error).message });
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

  /** Format CSJ ad data as AI assistant-style Markdown */
  private formatAdMessage(item: any): string {
    const title = item.title || '';
    const desc = item.description || '';
    const imageUrl = item.image?.image_url;
    const parts: string[] = [];
    if (imageUrl) {
      parts.push(`![ad](${imageUrl})`);
    }
    if (title) parts.push(title);
    if (desc) parts.push(desc);
    return parts.join('\n\n');
  }
}
