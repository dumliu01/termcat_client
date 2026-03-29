/**
 * Google AdMob Ad Platform (script mode)
 *
 * AdMob is a mobile-only SDK without S2S ad content API.
 * Uses Google Ad Manager ad tag solution, rendered via iframe sandbox.
 *
 * Data flow:
 * Client → POST /api/v1/ads/script/admob → termcat_server returns HTML snippet
 * (includes googletag.defineSlot + googletag.display + dark theme CSS + height reporting script)
 * → AdContent { renderMode: 'script', scriptHtml: '...' }
 * → AdMessageBubble creates iframe sandbox for rendering
 *
 * Docs: https://developers.google.com/ad-manager
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
      // Get Ad Manager ad tag HTML snippet via TermCat Server
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
      // fire-and-forget: Google scripts have built-in impression tracking
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
