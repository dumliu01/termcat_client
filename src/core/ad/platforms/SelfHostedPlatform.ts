/**
 * 自建广告平台
 *
 * 从 TermCat Server 拉取广告规则和内容，完全自主可控。
 * 适合运营自有广告位、推广升级会员等场景。
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class SelfHostedPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'self_hosted';
  readonly platformName = 'TermCat Self-Hosted';

  private config: AdPlatformConfig = {};

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    log.info('ad.platform.init', 'SelfHosted platform initialized');
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    try {
      const response = await apiService.getAdContents({
        tier: context.tier,
        language: context.language,
        trigger: context.triggerType,
      });

      return (response || []).map((item: any) => ({
        adId: item.id || `self_${Date.now()}`,
        platform: 'self_hosted' as AdPlatformType,
        type: item.type || 'markdown',
        message: this.formatAdMessage(item),
        actionText: item.action_text,
        actionUrl: item.action_url,
        actionType: item.action_type,
        renderMode: 'api' as const,
      }));
    } catch (err) {
      log.debug('ad.selfhosted.fetch.failed', 'Failed to fetch self-hosted ads', { error: (err as Error).message });
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
    // no-op
  }

  /** 将自建广告数据格式化为 Markdown，支持图片嵌入 */
  private formatAdMessage(item: any): string {
    const message = item.message || '';
    const imageUrl = item.image_url;
    if (imageUrl) {
      return `![ad](${imageUrl})\n\n${message}`;
    }
    return message;
  }
}
