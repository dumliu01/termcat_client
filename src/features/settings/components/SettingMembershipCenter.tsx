import React, { useState, useEffect } from 'react';
import { User as UserType, ModelConfig } from '@/utils/types';
import {
  Plus, Gem, Crown, Trophy, Lock, Cpu,
  CircleCheck, Check, Info as InfoIcon, Cat
} from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { commerceService } from '@/core/commerce/commerceService';
import { TierConfig, CommerceConfig } from '@/core/commerce/types';

interface MembershipCenterProps {
  user: UserType;
  updateUserState: (updates: Partial<UserType>) => void;
  onOpenPayment: (type: 'bones' | 'vip_month' | 'vip_year', amount: number, tierId?: string) => void;
}

/** Maps tier ID to payment type */
const getPaymentType = (tierId: string, period: 'monthly' | 'yearly'): 'vip_month' | 'vip_year' => {
  // Currently backend only supports vip_month / vip_year, can extend for SVIP here
  return period === 'monthly' ? 'vip_month' : 'vip_year';
};

/** Fallback static tier config (used when server config is unavailable) */
const FALLBACK_TIERS: TierConfig[] = [
  {
    id: 'Standard',
    name: { zh: '普通版', en: 'Standard' },
    price_monthly: 0,
    price_yearly: 0,
    monthly_gems: 0,
    max_hosts: 100,
    ad_free: false,
    features: ['smart_completion', 'cloud_sync', 'open_source_models', 'limited_agent', 'system_monitor', 'file_manager', 'vim_editor', 'community_support', 'max_100_hosts'],
    available_models: ['open_source'],
    agent_daily_limit: 10,
  },
  {
    id: 'Pro',
    name: { zh: 'Pro版本', en: 'Pro' },
    price_monthly: 99,
    price_yearly: 999,
    monthly_gems: 1000,
    max_hosts: 500,
    ad_free: true,
    features: ['all_standard', 'enhanced_monetization', 'monthly_1000_gems', 'ad_free', 'max_500_hosts', 'advanced_models'],
    available_models: ['open_source', 'advanced'],
    agent_daily_limit: 50,
  },
  {
    id: 'Adv',
    name: { zh: 'Adv版本', en: 'Adv' },
    price_monthly: 199,
    price_yearly: 1999,
    monthly_gems: 5000,
    max_hosts: 2500,
    ad_free: true,
    features: ['all_pro', 'monthly_5000_gems', 'max_2500_hosts'],
    available_models: ['open_source', 'advanced', 'premium'],
    agent_daily_limit: 0,
  },
];

/** Local fallback feature display names (used when server feature_meta is unavailable) */
const FALLBACK_FEATURE_META: Record<string, Record<string, string>> = {
  smart_completion:      { zh: '智能命令补全', en: 'Smart Command Completion' },
  cloud_sync:            { zh: '云端数据同步', en: 'Cloud Data Sync' },
  open_source_models:    { zh: '开源基础模型', en: 'Open Source Base Models' },
  limited_agent:         { zh: '有限的agent请求次数', en: 'Limited Agent Requests' },
  system_monitor:        { zh: '系统监控', en: 'System Monitoring' },
  file_manager:          { zh: '可视化文件管理', en: 'Visual File Management' },
  vim_editor:            { zh: '可视化vim文件编辑', en: 'Visual Vim Editing' },
  community_support:     { zh: '社区支持', en: 'Community Support' },
  max_100_hosts:         { zh: '最高100个主机限制', en: 'Max 100 Hosts' },
  all_standard:          { zh: '所有普通版功能', en: 'All Standard Features' },
  enhanced_monetization: { zh: '更强的变现模式', en: 'Enhanced Monetization' },
  monthly_1000_gems:     { zh: '每月1000积分', en: '1000 Credits/Month' },
  ad_free:               { zh: '免广告', en: 'Ad-Free' },
  max_500_hosts:         { zh: '最高500个主机限制', en: 'Max 500 Hosts' },
  advanced_models:       { zh: '更多高级模型可选', en: 'More Advanced Models' },
  all_pro:               { zh: '所有专业版功能', en: 'All Pro Features' },
  monthly_5000_gems:     { zh: '每月5000积分', en: '5000 Credits/Month' },
  max_2500_hosts:        { zh: '最高2500个主机限制', en: 'Max 2500 Hosts' },
};

/** Gets feature display name: prioritizes server feature_meta, then local fallback */
const getFeatureName = (featureId: string, language: string): string => {
  // Check server first
  const serverName = commerceService.getFeatureDisplayName(featureId, language);
  if (serverName !== featureId) return serverName;
  // Local fallback
  const local = FALLBACK_FEATURE_META[featureId];
  if (local) return local[language] || local['en'] || featureId;
  return featureId;
};

export const MembershipCenter: React.FC<MembershipCenterProps> = ({
  user, updateUserState, onOpenPayment
}) => {
  const { t, language } = useI18n();
  const [config, setConfig] = useState<CommerceConfig | null>(commerceService.getConfig());
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    // Fetch latest commerce config every time membership page opens
    commerceService.fetchConfig();
    const unsubscribe = commerceService.onChange(() => {
      setConfig(commerceService.getConfig());
    });
    return unsubscribe;
  }, []);

  const allTiers = (config?.tiers && config.tiers.length > 0) ? config.tiers : FALLBACK_TIERS;
  const currentTierConfig = allTiers.find(t => t.id === user.tier) ?? null;

  // DEBUG: Track data source
  console.log('[MembershipCenter] config source:', config ? 'server/cache' : 'null (using FALLBACK)');
  console.log('[MembershipCenter] config?.tiers count:', config?.tiers?.length);
  console.log('[MembershipCenter] allTiers source:', (config?.tiers && config.tiers.length > 0) ? 'server' : 'FALLBACK_TIERS');
  allTiers.forEach((tier, idx) => {
    console.log(`[MembershipCenter] tier[${idx}] id=${tier.id}, features(${tier.features.length}):`, tier.features);
  });
  if (config?.feature_meta) {
    console.log('[MembershipCenter] feature_meta keys:', Object.keys(config.feature_meta));
  }

  // Separate free and paid tiers
  const freeTier = allTiers.find(t => t.price_monthly === 0);
  const paidTiers = allTiers.filter(t => t.price_monthly > 0);

  // Yearly savings percentage (calculated from first paid tier, displayed on toggle)
  const yearlySavings = paidTiers[0] && paidTiers[0].price_yearly > 0 && paidTiers[0].price_monthly > 0
    ? Math.round((1 - paidTiers[0].price_yearly / (paidTiers[0].price_monthly * 12)) * 100)
    : 0;

  const isAdFree = currentTierConfig?.ad_free ?? false;

  /**
   * Calculates display features for a tier:
   * - If features contain all_standard / all_pro etc. inheritance tags, use directly
   * - If it's a flat list from server (no inheritance tags), auto-fold with previous tier difference
   */
  const getDisplayFeatures = (tier: TierConfig, tierIdx: number): string[] => {
    const hasInheritTag = tier.features.some(f => f.startsWith('all_'));
    if (hasInheritTag || tierIdx === 0) return tier.features;

    // Server flat list -> auto-fold
    const prevTier = allTiers[tierIdx - 1];
    if (!prevTier) return tier.features;

    const prevSet = new Set(prevTier.features);
    const inherited = tier.features.filter(f => prevSet.has(f));
    const unique = tier.features.filter(f => !prevSet.has(f));

    // Only fold when inheriting most features from previous tier
    if (inherited.length >= prevTier.features.length * 0.5) {
      const prevName = prevTier.name[language] || prevTier.name['en'] || prevTier.id;
      const inheritTag = `__inherit_${prevTier.id}`;
      // Register temporary display name
      FALLBACK_FEATURE_META[inheritTag] = {
        zh: `所有${prevName}功能`,
        en: `All ${prevTier.name['en'] || prevTier.id} Features`,
      };
      return [inheritTag, ...unique];
    }

    return tier.features;
  };

  /** Renders tier feature list */
  const renderTierFeatures = (tier: TierConfig, color: string, tierIdx: number) => {
    const features = getDisplayFeatures(tier, tierIdx);
    return (
      <div className="flex-1 space-y-4 mb-10">
        {features.map((f) => (
          <div key={f} className="flex items-start gap-3">
            <CircleCheck className={`w-4 h-4 ${color} mt-0.5 shrink-0`} />
            <span className="text-xs font-bold text-[var(--text-main)]">
              {getFeatureName(f, language)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  /** First paid tier monthly price (for "Unlock VIP" button amount) */
  const firstPaidTier = paidTiers[0];
  const unlockMonthlyPrice = firstPaidTier?.price_monthly ?? 19.8;

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Gems Balance Card */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none transition-transform group-hover:scale-110">
          <Cat className="w-32 h-32 text-indigo-500" />
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center text-indigo-500 shadow-inner border border-indigo-500/20">
              <Gem className="w-10 h-10" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-[var(--text-dim)]">
                {t.settings.fishBoneBalance}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-indigo-500 tracking-tighter tabular-nums">{user.gems}</span>
                <span className="text-[10px] font-black opacity-40 uppercase tracking-widest italic text-[var(--text-dim)]">{t.settings.units}</span>
              </div>
            </div>
          </div>
          <div className="w-full md:w-auto">
            <button onClick={() => onOpenPayment('bones', 0)} className="w-full md:w-auto px-10 py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 active:scale-95 flex items-center justify-center gap-3">
              <Plus className="w-4 h-4" />
              {t.settings.rechargeBones}
            </button>
          </div>
        </div>
      </section>

      {/* Membership Subscription Center */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between px-2 gap-4 relative">
          <div className="flex items-center gap-3 md:w-auto shrink-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-amber-500 whitespace-nowrap">
              {t.settings.membershipSubscription}
            </h3>
            {user.tier !== 'Standard' && user.tierExpiry && (
              <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded ml-2 whitespace-nowrap">
                {t.settings.expires.replace('{expiry}', new Date(user.tierExpiry).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US'))}
              </span>
            )}
          </div>

          {/* Monthly/Yearly Toggle */}
          <div className="flex items-center bg-[var(--bg-main)] p-1 rounded-xl border border-[var(--border-color)] md:absolute md:left-1/2 md:-translate-x-1/2">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${billingCycle === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
            >
              {t.settings.billingMonthly}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-indigo-600 text-white shadow-md' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
            >
              {t.settings.billingYearly}
              {yearlySavings > 0 && (
                <span className="text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-sm">-{yearlySavings}%</span>
              )}
            </button>
          </div>

          <div className="hidden md:block md:w-1/3" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={allTiers.length !== 3 ? { gridTemplateColumns: `repeat(${Math.min(allTiers.length, 3)}, minmax(0, 1fr))` } : undefined}>
          {allTiers.map((tier, idx) => {
            const isCurrent = user.tier === tier.id;
            const isFree = tier.price_monthly === 0;
            const isEnabled = tier.enabled !== false; // Defaults to true if not configured
            const tierName = tier.name[language] || tier.name['en'] || tier.id;
            const isLastPaid = !isFree && idx === allTiers.length - 1;
            const price = isFree ? 0 : (billingCycle === 'monthly' ? tier.price_monthly : tier.price_yearly);
            const priceSuffix = isFree ? t.settings.forever : (billingCycle === 'monthly' ? t.settings.perMonth : t.settings.perYear);

            // Card container styles
            const cardClass = isCurrent
              ? isFree
                ? 'bg-indigo-500/5 border-indigo-500/30 ring-2 ring-indigo-500/50'
                : 'bg-amber-500/5 border-amber-500/40 ring-2 ring-amber-500'
              : !isEnabled
                ? 'bg-[var(--bg-card)] border-[var(--border-color)] opacity-50'
              : isLastPaid
                ? 'bg-gradient-to-br from-[var(--bg-card)] to-amber-500/5 border-amber-500/60 hover:border-amber-500 shadow-2xl'
                : isFree
                  ? 'bg-[var(--bg-card)] border-[var(--border-color)] opacity-60'
                  : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-amber-500/40';

            return (
              <div
                key={tier.id}
                className={`p-8 rounded-[2rem] border transition-all flex flex-col relative overflow-hidden group ${cardClass}`}
              >
                {/* Top right badge */}
                {isCurrent ? (
                  <div className={`absolute top-0 right-0 ${isFree ? 'bg-indigo-500' : 'bg-amber-500'} text-white text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-bl-2xl shadow-lg flex items-center gap-1`}>
                    <Check className="w-3 h-3" /> {t.settings.currentVersion}
                  </div>
                ) : isLastPaid ? (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest px-6 py-2 rounded-bl-3xl shadow-lg">
                    {t.settings.bestValue}
                  </div>
                ) : null}

                {/* Title */}
                <div className="mb-8">
                  <h4 className="text-lg font-black text-[var(--text-main)] mb-1 flex items-center gap-2">
                    {tierName}
                    {!isFree && (isLastPaid ? <Trophy className="w-4 h-4 text-amber-500" /> : <Crown className="w-4 h-4 text-amber-500" />)}
                  </h4>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${isFree ? 'text-[var(--text-dim)] opacity-50' : 'text-amber-500'} ${isLastPaid ? 'animate-pulse' : ''}`}>
                    {isFree ? t.settings.basicTerminal : isLastPaid ? t.settings.advSubtitle : t.settings.proSubtitle}
                  </p>
                </div>

                {/* Feature List */}
                {renderTierFeatures(tier, isFree ? 'text-emerald-500' : 'text-amber-500', idx)}

                {/* Price + Button */}
                <div className="mt-auto">
                  <div className="text-2xl font-black text-[var(--text-main)] mb-6 tracking-tighter">
                    ¥{price} <span className="text-xs font-bold opacity-40">{priceSuffix}</span>
                  </div>
                  {isCurrent ? (
                    <div className={`w-full py-4 ${isFree ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20' : 'bg-amber-500/20 text-amber-500 border-amber-500/20'} text-center rounded-2xl text-[10px] font-black uppercase tracking-widest border`}>
                      {t.settings.subscribing}
                    </div>
                  ) : !isEnabled ? (
                    <div className="w-full py-4 bg-[var(--bg-tab)] text-[var(--text-dim)] text-center rounded-2xl text-[10px] font-black uppercase tracking-widest border border-[var(--border-color)]">
                      {language === 'zh' ? '暂未开放' : 'Coming Soon'}
                    </div>
                  ) : isFree ? (
                    <button className="w-full py-4 bg-[var(--bg-tab)] text-[var(--text-dim)] text-center rounded-2xl text-[10px] font-black uppercase tracking-widest">
                      {t.settings.standardPlan}
                    </button>
                  ) : isLastPaid ? (
                    <button
                      onClick={() => onOpenPayment(getPaymentType(tier.id, billingCycle), price, tier.id)}
                      className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-amber-500/40 transition-all hover:scale-[1.02] active:scale-95 pulse-vip"
                    >
                      {t.settings.claimOffer}
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenPayment(getPaymentType(tier.id, billingCycle), price, tier.id)}
                      className="w-full py-4 bg-amber-500 text-white text-center rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      {t.settings.subscribeNow}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center gap-4">
          <InfoIcon className="w-4 h-4 text-indigo-400 shrink-0" />
          <p className="text-[10px] font-bold text-indigo-400/80 leading-relaxed">{t.settings.vipNote}</p>
        </div>
      </section>

      {/* Private Model Advanced Config */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <h4 className="text-sm font-black flex items-center gap-3 text-[var(--text-main)]">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center"><Cpu className="w-4 h-4 text-indigo-500" /></div>
            {t.settings.privateModelConfig}
          </h4>
          {user.tier === 'Standard' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-black rounded-lg uppercase tracking-widest">
              <Lock className="w-3 h-3" />{t.settings.vipExclusive}
            </div>
          )}
        </div>
        <div className={`space-y-6 transition-all duration-500 ${user.tier === 'Standard' ? 'opacity-20 grayscale pointer-events-none' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest px-1 opacity-50 text-[var(--text-dim)]">{t.settings.baseUrl}</label>
              <input
                type="text"
                placeholder="https://api.openai.com/v1"
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl px-5 py-3.5 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                value={user.modelConfig?.baseUrl || ''}
                onChange={(e) => updateUserState({ modelConfig: { ...user.modelConfig!, baseUrl: e.target.value } as ModelConfig })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest px-1 opacity-50 text-[var(--text-dim)]">{t.settings.modelName}</label>
              <input type="text" placeholder="gpt-4o, gemini-pro..." className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl px-5 py-3.5 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" value={user.modelConfig?.modelName || ''} onChange={(e) => updateUserState({ modelConfig: { ...user.modelConfig!, modelName: e.target.value } as ModelConfig })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest px-1 opacity-50 text-[var(--text-dim)]">{t.settings.apiToken}</label>
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input type="password" placeholder="sk-••••••••••••••••" className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl pl-12 pr-5 py-3.5 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" value={user.modelConfig?.apiKey || ''} onChange={(e) => updateUserState({ modelConfig: { ...user.modelConfig!, apiKey: e.target.value } as ModelConfig })} />
            </div>
          </div>
        </div>
        {user.tier === 'Standard' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-20 backdrop-blur-[2px]">
            <button onClick={() => onOpenPayment('vip_month', unlockMonthlyPrice, firstPaidTier?.id)} className="px-8 py-3 bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-2xl shadow-amber-500/40 animate-bounce">
              {t.settings.unlockWithVip}
            </button>
          </div>
        )}
      </section>

      {/* Ad-Free Experience Toggle */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="text-sm font-black text-[var(--text-main)] mb-1">{t.commerce.adFreeExperience}</h4>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] opacity-50">{t.commerce.adFreeDesc}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!isAdFree && (
              <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-3 py-1 rounded-lg uppercase tracking-widest border border-amber-500/20">
                {t.commerce.vipOnly}
              </span>
            )}
            <button
              onClick={() => {
                if (isAdFree) {
                  updateUserState({ adsDisabled: !user.adsDisabled });
                } else {
                  onOpenPayment('vip_month', unlockMonthlyPrice, firstPaidTier?.id);
                }
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${user.adsDisabled ? 'bg-amber-500' : 'bg-black/20 dark:bg-white/10'} ${!isAdFree ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user.adsDisabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
