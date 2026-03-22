/**
 * Adsterra 广告平台（script 模式）
 *
 * Adsterra 不提供 S2S 结构化广告数据 API，Publisher API 仅支持统计报表。
 * 采用 Native Banner 广告代码，通过 iframe sandbox 渲染。
 *
 * 数据流：
 * 客户端 → POST /api/v1/ads/script/adsterra → termcat_server 返回 HTML 片段
 * → AdContent { renderMode: 'script', scriptHtml: '...' }
 * → AdMessageBubble 创建 iframe sandbox 渲染
 *
 * 官网: https://www.adsterra.com/
 */

import { IAdPlatform, AdPlatformConfig, AdRequestContext, AdContent, AdPlatformType } from '../types';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

const log = logger.withFields({ module: LOG_MODULE.UI });

export class AdsterraPlatform implements IAdPlatform {
  readonly platformId: AdPlatformType = 'adsterra';
  readonly platformName = 'Adsterra';

  private config: AdPlatformConfig = {};
  private initialized = false;

  async init(config: AdPlatformConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
    log.info('ad.platform.init', 'Adsterra platform initialized (script mode)', { slotId: config.slotId });
  }

  async fetchAds(context: AdRequestContext): Promise<AdContent[]> {
    if (!this.initialized) return [];

    try {
      // 通过 TermCat Server 获取 Adsterra Native Banner HTML 片段
      const response = await apiService.fetchScriptAds('adsterra', {
        slot_id: this.config.slotId,
        theme: 'dark',
        language: context.language,
      });

      if (!response?.html) return [];

      return [{
        adId: `adsterra_${Date.now()}`,
        platform: 'adsterra' as AdPlatformType,
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
      log.debug('ad.adsterra.fetch.failed', 'Failed to fetch Adsterra script ads', { error: (err as Error).message });
      return [];
    }
  }

  async reportImpression(adId: string): Promise<void> {
    try {
      await apiService.reportAdImpression(adId, this.platformId);
    } catch {
      // fire-and-forget: Adsterra 脚本自带展示追踪，TermCat 侧作为补充统计
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
