/**
 * 优量汇广告平台 (GDT)
 *
 * 腾讯广告联盟，国内第二大广告平台。
 * 拥有微信、QQ 等社交流量资源。
 *
 * 文档: https://e.qq.com/
 * Marketing API: https://developers.e.qq.com/
 *
 * 本实现采用服务端到服务端 (S2S) 模式：
 * 客户端 → TermCat Server → 优量汇 API → 返回广告内容
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class GDTPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'gdt';
  readonly platformName = '优量汇';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.info('ad.platform.init', 'GDT platform initialized', { appId: config.appId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // 通过 TermCat Server 代理请求优量汇广告
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

  /** 将优量汇广告数据格式化为 AI 助手口吻的 Markdown */
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
