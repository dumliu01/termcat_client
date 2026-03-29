/**
 * Commerce Configuration Type Definitions
 */

/** Subscription tier config */
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
  [key: string]: unknown; // Allow unknown fields for forward compatibility
}

/** Gem package config */
export interface GemPackage {
  id: string;
  gems: number;
  price: number;
  currency: string;
  [key: string]: unknown;
}

/** Complete commerce config */
export interface CommerceConfig {
  seq: number;
  tiers: TierConfig[];
  gem_packages: GemPackage[];
  feature_meta?: Record<string, Record<string, string>>; // feature ID → { zh: "...", en: "..." }
  mock_pay_enabled?: boolean; // Server-side mock payment toggle (test env only)
  [key: string]: unknown; // Allow unknown fields
}

/** Incremental sync seq */
export interface SyncSeqs {
  hosts: number;
  groups: number;
  commerce: number;
  proxies: number;
  tunnels: number;
}

/** Login response (extended) */
export interface LoginResponseWithSeqs {
  token: string;
  user: Record<string, unknown>;
  seqs?: SyncSeqs;
}
