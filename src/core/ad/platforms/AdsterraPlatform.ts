/**
 * Adsterra Ad Platform (script mode)
 *
 * Adsterra does not provide S2S structured ad data API, Publisher API only supports statistics reporting.
 * Uses Native Banner ad code, rendered via iframe sandbox.
 *
 * Data flow:
 * Client → POST /api/v1/ads/script/adsterra → termcat_server returns HTML snippet
 * → AdContent { renderMode: 'script', scriptHtml: '...' }
 * → AdMessageBubble creates iframe sandbox for rendering
 *
 * Website: https://www.adsterra.com/
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
      // Get Adsterra Native Banner HTML snippet via TermCat Server
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
      // fire-and-forget: Adsterra scripts have built-in impression tracking, TermCat side for supplementary stats
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
