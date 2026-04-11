/**
 * Tencent GDT Ad Platform (Guangdiantong / 优量汇)
 *
 * Tencent's ad network, China's second-largest ad platform.
 * Has social traffic resources from WeChat, QQ, etc.
 *
 * Docs: https://e.qq.com/
 * Marketing API: https://developers.e.qq.com/
 *
 * This implementation uses Server-to-Server (S2S) mode:
 * Client → TermCat Server → GDT API → Return ad content
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class GDTPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'gdt';
  readonly platformName = 'GDT';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.debug('ad.platform.init', 'GDT platform initialized', { appId: config.appId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // Request GDT ads via TermCat Server proxy
      const response = await apiService.fetchPlatformAds('gdt', {
        slot_id: this.config.slotId,
        tier: context.tier,
        language: context.language,
        trigger: context.triggerType,
      });

      return (response || []).map((item: any) => ({
        adId: item.ad_id || `gdt_${Date.now()}`,
        platform: 'gdt' as AdPlatformType,
        type: 'markdown' as const,
        message: this.formatAdMessage(item),
        actionText: item.action_text || (context.language === 'zh' ? '查看详情' : 'View Details'),
        actionUrl: item.click_url,
        actionType: 'url' as const,
        renderMode: 'api' as const,
      }));
    } catch (err) {
      log.debug('ad.gdt.fetch.failed', 'Failed to fetch GDT ads', { error: (err as Error).message });
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

  /** Format GDT ad data as AI assistant-style Markdown */
  private formatAdMessage(item: any): string {
    const title = item.title || '';
    const desc = item.description || '';
    const imageUrl = item.image_url;
    const parts: string[] = [];
    if (imageUrl) {
      parts.push(`![ad](${imageUrl})`);
    }
    if (title) parts.push(title);
    if (desc) parts.push(desc);
    return parts.join('\n\n');
  }
}
