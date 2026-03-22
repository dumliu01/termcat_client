/**
 * 广告系统类型定义
 *
 * 支持多广告平台集成，以 AI 助手消息形式展示广告
 */

import { TierType } from '@/utils/types';

// ==================== 广告平台 ====================

/** 支持的广告平台标识 */
export type AdPlatformType = 'self_hosted' | 'csj' | 'gdt' | 'carbon' | 'admob' | 'adsterra';

/** 广告平台接口 */
export interface IAdPlatform {
  /** 平台标识 */
  readonly platformId: AdPlatformType;
  /** 平台名称 */
  readonly platformName: string;
  /** 初始化平台（传入配置） */
  init(config: AdPlatformConfig): Promise<void>;
  /** 拉取广告内容 */
  fetchAds(context: AdRequestContext): Promise<AdContent[]>;
  /** 上报展示 */
  reportImpression(adId: string): Promise<void>;
  /** 上报点击 */
  reportClick(adId: string): Promise<void>;
  /** 销毁平台资源 */
  destroy(): void;
}

/** 广告平台配置 */
export interface AdPlatformConfig {
  /** 平台应用 ID / App Key */
  appId?: string;
  /** 平台密钥 */
  appSecret?: string;
  /** API 基础地址 */
  baseUrl?: string;
  /** 广告位 ID */
  slotId?: string;
  /** 额外参数 */
  extra?: Record<string, string>;
}

/** 广告请求上下文 */
export interface AdRequestContext {
  /** 用户等级 */
  tier: TierType | 'guest';
  /** 语言 */
  language: 'zh' | 'en';
  /** 触发类型 */
  triggerType: AdTriggerType;
  /** 当前会话 ID */
  sessionId?: string;
}

// ==================== 广告规则 ====================

/** 广告触发类型 */
export type AdTriggerType = 'panel_open' | 'idle' | 'conversation_gap' | 'session_start';

/** 广告规则（从服务端拉取） */
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

/** 广告触发条件 */
export interface AdTrigger {
  type: AdTriggerType;
  params: {
    /** idle 类型：空闲秒数 */
    idleSeconds?: number;
    /** conversation_gap 类型：间隔消息数 */
    messageInterval?: number;
  };
}

/** 广告渲染模式 */
export type AdRenderMode = 'api' | 'script';

/** 广告内容 */
export interface AdContent {
  /** 广告 ID（平台侧） */
  adId: string;
  /** 来源平台 */
  platform: AdPlatformType;
  /** 内容类型 */
  type: 'text' | 'markdown' | 'action';
  /** 广告文案（支持 markdown，api 模式使用） */
  message: string;
  /** CTA 按钮文案 */
  actionText?: string;
  /** CTA 链接 */
  actionUrl?: string;
  /** 动作类型 */
  actionType?: 'url' | 'upgrade' | 'custom';
  /** 渲染模式：api 为 Markdown 文本渲染，script 为 iframe sandbox 渲染 */
  renderMode: AdRenderMode;
  /** script 模式：完整 HTML 片段（含广告脚本 + 样式 + 高度上报脚本） */
  scriptHtml?: string;
  /** script 模式：服务端广告页面 URL（桌面应用优先使用，referrer 为真实域名） */
  scriptPageUrl?: string;
  /** script 模式：iframe 建议尺寸 */
  scriptSize?: { width: number; height: number };
}

/** 频率控制 */
export interface AdFrequency {
  /** 每个会话最多展示次数 */
  maxPerSession: number;
  /** 每天最多展示次数 */
  maxPerDay: number;
  /** 两次展示最小间隔（秒） */
  cooldownSeconds: number;
}

/** 定向条件 */
export interface AdTargeting {
  /** 目标用户等级 */
  tiers: TierType[];
  /** 是否包含游客 */
  includeGuest: boolean;
}

// ==================== 客户端状态 ====================

/** 注入到 AI 消息列表的广告消息 */
export interface AdMessage {
  id: string;
  ruleId: string;
  platform: AdPlatformType;
  content: AdContent;
  timestamp: number;
}

/** 广告展示状态（频率控制用） */
export interface AdDisplayState {
  ruleId: string;
  sessionCount: number;
  dailyCount: number;
  lastShownAt: number;
  lastDate: string;
}

/** 服务端广告规则响应 */
export interface AdRulesResponse {
  enabled: boolean;
  rules: AdRule[];
  /** 各平台配置 */
  platformConfigs?: Record<AdPlatformType, AdPlatformConfig>;
}
