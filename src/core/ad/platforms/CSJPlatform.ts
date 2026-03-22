/**
 * 穿山甲广告平台 (CSJ / Pangolin)
 *
 * 字节跳动旗下广告联盟，国内最大广告平台之一。
 * 支持信息流广告、开屏广告、激励视频等多种形式。
 *
 * 文档: https://www.csjplatform.com/
 * 服务端 API: https://open.oceanengine.com/
 *
 * 本实现采用服务端到服务端 (S2S) 模式：
 * 客户端 → TermCat Server → 穿山甲 API → 返回广告内容
 * 这样可以保护 AppKey，且适配桌面端场景。
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class CSJPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'csj';
  readonly platformName = '穿山甲';

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
      // 通过 TermCat Server 代理请求穿山甲广告
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

  /** 将穿山甲广告数据格式化为 AI 助手口吻的 Markdown */
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
