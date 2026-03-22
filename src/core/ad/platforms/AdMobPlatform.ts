/**
 * Google AdMob 广告平台（script 模式）
 *
 * AdMob 是纯移动端 SDK，无 S2S 广告内容 API。
 * 采用 Google Ad Manager 广告标签方案，通过 iframe sandbox 渲染。
 *
 * 数据流：
 * 客户端 → POST /api/v1/ads/script/admob → termcat_server 返回 HTML 片段
 * （含 googletag.defineSlot + googletag.display + 暗色主题 CSS + 高度上报脚本）
 * → AdContent { renderMode: 'script', scriptHtml: '...' }
 * → AdMessageBubble 创建 iframe sandbox 渲染
 *
 * 文档: https://developers.google.com/ad-manager
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class AdMobPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'admob';
  readonly platformName = 'Google AdMob';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.info('ad.platform.init', 'AdMob platform initialized (script mode)', { slotId: config.slotId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // 通过 TermCat Server 获取 Ad Manager 广告标签 HTML 片段
      const response = await apiService.fetchScriptAds('admob', {
        ad_unit_id: this.config.slotId,
        theme: 'dark',
        language: context.language,
      });

      if (!response?.html) return [];

      return [{
        adId: `admob_${Date.now()}`,
        platform: 'admob' as AdPlatformType,
        type: 'text' as const,
        message: '',
        renderMode: 'script' as const,
        scriptHtml: response.html,
        scriptPageUrl: response.pageUrl
          ? apiService.getAdPageFullUrl(response.pageUrl)
          : undefined,
        scriptSize: response.width && response.height
          ? { width: response.width, height: response.height }
          : undefined,
      }];
    } catch (err) {
      log.debug('ad.admob.fetch.failed', 'Failed to fetch AdMob script ads', { error: (err as Error).message });
      return [];
    }
  }

  async reportImpression(adId: string): Promise<void> {
    try {
      await apiService.reportAdImpression(adId, this.platformId);
    } catch {
      // fire-and-forget: Google 脚本自带展示追踪
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
}
