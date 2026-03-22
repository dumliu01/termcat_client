/**
 * 商业化配置类型定义
 */

/** 订阅版本配置 */
export interface TierConfig {
  id: string;
  enabled?: boolean;
  name: Record<string, string>;
  price_monthly: number;
  price_yearly: number;
  monthly_gems: number;
  max_hosts: number;
  ad_free: boolean;
  features: string[];
  available_models: string[];
  agent_daily_limit: number;
  [key: string]: unknown; // 允许未知字段，向前兼容
}

/** 积分包配置 */
export interface GemPackage {
  id: string;
  gems: number;
  price: number;
  currency: string;
  [key: string]: unknown;
}

/** 完整商业化配置 */
export interface CommerceConfig {
  seq: number;
  tiers: TierConfig[];
  gem_packages: GemPackage[];
  feature_meta?: Record<string, Record<string, string>>; // feature ID → { zh: "...", en: "..." }
  [key: string]: unknown; // 允许未知字段
}

/** 增量同步 seq */
export interface SyncSeqs {
  hosts: number;
  groups: number;
  commerce: number;
  proxies: number;
  tunnels: number;
}

/** 登录响应（扩展） */
export interface LoginResponseWithSeqs {
  token: string;
  user: Record<string, unknown>;
  seqs?: SyncSeqs;
}
