/**
 * Ad System Type Definitions
 *
 * Supports multi-ad platform integration, displaying ads as AI assistant messages
 */

import { TierType } from '@/utils/types';

// ==================== Ad Platforms ====================

/** Supported ad platform identifiers */
export type AdPlatformType = 'self_hosted' | 'csj' | 'gdt' | 'carbon' | 'admob' | 'adsterra';

/** Ad platform interface */
export interface IAdPlatform {
  /** Platform identifier */
  readonly platformId: AdPlatformType;
  /** Platform name */
  readonly platformName: string;
  /** Initialize platform (with config) */
  init(config: AdPlatformConfig): Promise<void>;
  /** Fetch ad content */
  fetchAds(context: AdRequestContext): Promise<AdContent[]>;
  /** Report impression */
  reportImpression(adId: string): Promise<void>;
  /** Report click */
  reportClick(adId: string): Promise<void>;
  /** Destroy platform resources */
  destroy(): void;
}

/** Ad platform configuration */
export interface AdPlatformConfig {
  /** Platform App ID / App Key */
  appId?: string;
  /** Platform secret */
  appSecret?: string;
  /** API base URL */
  baseUrl?: string;
  /** Ad slot ID */
  slotId?: string;
  /** Extra parameters */
  extra?: Record<string, string>;
}

/** Ad request context */
export interface AdRequestContext {
  /** User tier */
  tier: TierType | 'guest';
  /** Language */
  language: 'zh' | 'en';
  /** Trigger type */
  triggerType: AdTriggerType;
  /** Current session ID */
  sessionId?: string;
}

// ==================== Ad Rules ====================

/** Ad trigger type */
export type AdTriggerType = 'panel_open' | 'idle' | 'conversation_gap' | 'session_start';

/** Ad rule (fetched from server) */
export interface AdRule {
  id: string;
  priority: number;
  trigger: AdTrigger;
  content: AdContent;
  frequency: AdFrequency;
  targeting: AdTargeting;
  platform: AdPlatformType;
  startTime?: string;
  endTime?: string;
}

/** Ad trigger condition */
export interface AdTrigger {
  type: AdTriggerType;
  params: {
    /** idle type: idle seconds */
    idleSeconds?: number;
    /** conversation_gap type: message interval count */
    messageInterval?: number;
  };
}

/** Ad render mode */
export type AdRenderMode = 'api' | 'script';

/** Ad content */
export interface AdContent {
  /** Ad ID (from platform) */
  adId: string;
  /** Source platform */
  platform: AdPlatformType;
  /** Content type */
  type: 'text' | 'markdown' | 'action';
  /** Ad copy (supports markdown, used in api mode) */
  message: string;
  /** CTA button text */
  actionText?: string;
  /** CTA link */
  actionUrl?: string;
  /** Action type */
  actionType?: 'url' | 'upgrade' | 'custom';
  /** Render mode: api = Markdown text rendering, script = iframe sandbox rendering */
  renderMode: AdRenderMode;
  /** script mode: complete HTML snippet (includes ad script + styles + height reporting script) */
  scriptHtml?: string;
  /** script mode: server-side ad page URL (preferred for desktop, referrer is real domain) */
  scriptPageUrl?: string;
  /** script mode: iframe suggested size */
  scriptSize?: { width: number; height: number };
}

/** Frequency control */
export interface AdFrequency {
  /** Max displays per session */
  maxPerSession: number;
  /** Max displays per day */
  maxPerDay: number;
  /** Minimum interval between displays (seconds) */
  cooldownSeconds: number;
}

/** Targeting conditions */
export interface AdTargeting {
  /** Target user tiers */
  tiers: TierType[];
  /** Include guests */
  includeGuest: boolean;
}

// ==================== Client State ====================

/** Ad message injected into AI message list */
export interface AdMessage {
  id: string;
  ruleId: string;
  platform: AdPlatformType;
  content: AdContent;
  timestamp: number;
}

/** Ad display state (for frequency control) */
export interface AdDisplayState {
  ruleId: string;
  sessionCount: number;
  dailyCount: number;
  lastShownAt: number;
  lastDate: string;
}

/** Server ad rules response */
export interface AdRulesResponse {
  enabled: boolean;
  rules: AdRule[];
  /** Platform configs */
  platformConfigs?: Record<AdPlatformType, AdPlatformConfig>;
}
