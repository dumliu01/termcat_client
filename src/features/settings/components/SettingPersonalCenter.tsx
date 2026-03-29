import React, { useState, useEffect } from 'react';
import { User as UserType } from '@/utils/types';
import { UserCircle, Save, Loader2, Check, Mail, LogOut, Gem } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { commerceService } from '@/core/commerce/commerceService';

interface PersonalCenterProps {
  user: UserType;
  updateUserState: (updates: Partial<UserType>) => void;
  handleLogout: (clearServerCache?: boolean) => void;
  onOpenPayment: (type: 'bones' | 'vip_month' | 'vip_year', amount: number, tierId?: string) => void;
}

export const PersonalCenter: React.FC<PersonalCenterProps> = ({
  user, updateUserState, handleLogout, onOpenPayment
}) => {
  const { t } = useI18n();

  // Local editing state
  const [draft, setDraft] = useState({
    nickname: user.nickname || '',
    gender: user.gender || 'other',
    birthday: user.birthday || '',
  });

  // Sync when external user changes (e.g., account switch)
  useEffect(() => {
    setDraft({
      nickname: user.nickname || '',
      gender: user.gender || 'other',
      birthday: user.birthday || '',
    });
  }, [user.id]);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [clearCache, setClearCache] = useState(false);

  const isDirty = draft.nickname !== (user.nickname || '') ||
    draft.gender !== (user.gender || 'other') ||
    draft.birthday !== (user.birthday || '');

  const handleSave = async () => {
    if (saving || !isDirty) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await apiService.updateUserProfile({
        nickname: draft.nickname,
        gender: draft.gender,
        birthday: draft.birthday,
      });
      updateUserState({
        nickname: draft.nickname,
        gender: draft.gender as 'male' | 'female' | 'other',
        birthday: draft.birthday,
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
      logger.info(LOG_MODULE.UI, 'settings.profile.saved', 'Profile saved');
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      logger.error(LOG_MODULE.UI, 'settings.profile.save_failed', 'Profile save failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const labelCls = 'text-[10px] font-black uppercase tracking-widest px-0.5 text-[var(--text-dim)] opacity-50';
  const inputCls = 'w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-main)] outline-none focus:border-indigo-500 transition-colors';

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Avatar + Basic Info */}
      <section className="bg-[var(--bg-card)] px-5 py-3 rounded-xl border border-[var(--border-color)] shadow-sm" data-testid="account-user-info">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <UserCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-black text-[var(--text-main)] truncate">{user.nickname || user.email || 'User'}</h3>
            <div className="flex items-center gap-1 text-[var(--text-dim)]">
              <Mail className="w-2.5 h-2.5 opacity-50" />
              <span className="text-[11px] opacity-60">{user.email || '-'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Edit Form */}
      <section className="bg-[var(--bg-card)] px-5 py-4 rounded-xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-indigo-400">
          <UserCircle className="w-3.5 h-3.5" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">{t.settings.personalProfile}</h3>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Nickname */}
          <div className="space-y-1">
            <label className={labelCls}>{t.settings.nickname}</label>
            <input
              type="text"
              value={draft.nickname}
              onChange={(e) => setDraft(d => ({ ...d, nickname: e.target.value }))}
              className={inputCls}
              placeholder="CyberCat"
              data-testid="account-nickname"
            />
          </div>

          {/* Gender */}
          <div className="space-y-1">
            <label className={labelCls}>{t.settings.gender}</label>
            <select
              value={draft.gender}
              onChange={(e) => setDraft(d => ({ ...d, gender: e.target.value }))}
              className={`${inputCls} appearance-none cursor-pointer`}
              data-testid="account-gender"
            >
              <option value="male">{t.settings.male}</option>
              <option value="female">{t.settings.female}</option>
              <option value="other">{t.settings.private}</option>
            </select>
          </div>

          {/* Birthday */}
          <div className="space-y-1">
            <label className={labelCls}>{t.settings.birthday}</label>
            <input
              type="date"
              value={draft.birthday}
              onChange={(e) => setDraft(d => ({ ...d, birthday: e.target.value }))}
              className={inputCls}
              data-testid="account-birthday"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <div className="h-4">
            {saveStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold animate-in fade-in duration-200">
                <Check className="w-3 h-3" />
                {t.settings.saved}
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-rose-400 text-[10px] font-bold animate-in fade-in duration-200">
                {t.settings.saveFailed?.replace('{error}', '') || 'Save failed'}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
              isDirty
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm'
                : 'bg-[var(--bg-main)] text-[var(--text-dim)] border border-[var(--border-color)] cursor-not-allowed opacity-50'
            }`}
            data-testid="account-save-btn"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t.common.save}
          </button>
        </div>
      </section>

      {/* Gems Balance + Recharge — highlighted */}
      <section className="relative rounded-xl border border-indigo-500/30 bg-[#1a1a2e] overflow-hidden shadow-lg" data-testid="account-gems-section">
        {/* Decorative glows */}
        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Header: icon + title + balance */}
        <div className="relative px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
              <Gem className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-black text-[11px] text-white/90">{t.settings.gemsBalance}</h3>
              <span className="text-[10px] text-white/30 font-medium">{t.settings.gemsRechargeDesc}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur px-3.5 py-1.5 rounded-full border border-white/10">
            <Gem className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-base font-black text-amber-400" data-testid="account-gems-balance">{user.gems ?? 0}</span>
          </div>
        </div>

        {/* Price cards */}
        <div className="relative px-5 pb-4 flex gap-2">
          {(commerceService.getConfig()?.gem_packages ?? [
            { price: 10, gems: 100 },
            { price: 30, gems: 350 },
            { price: 50, gems: 600 },
          ]).map((pkg, i) => (
            <button
              key={pkg.price}
              onClick={() => onOpenPayment('bones', pkg.price)}
              className={`flex-1 py-3 rounded-xl border transition-all text-center group hover:scale-[1.03] active:scale-95 ${
                i === 1
                  ? 'border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 ring-1 ring-indigo-500/30'
                  : 'border-white/10 bg-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/10'
              }`}
              data-testid={`gems-recharge-${pkg.price}`}
            >
              <div className={`text-lg font-black transition-colors ${
                i === 1 ? 'text-amber-400' : 'text-white/80 group-hover:text-amber-400'
              }`}>¥{pkg.price}</div>
              <div className="text-[10px] font-bold text-amber-500/60 mt-0.5">{pkg.gems} <Gem className="w-2.5 h-2.5 inline -mt-0.5" /></div>
            </button>
          ))}
        </div>
      </section>

      {/* Clear Cache + Logout */}
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
        <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
          <input
            type="checkbox"
            checked={clearCache}
            onChange={(e) => setClearCache(e.target.checked)}
            className="w-3 h-3 rounded accent-rose-500 cursor-pointer"
          />
          <span className="text-[11px] text-[var(--text-dim)]">{t.settings.clearServerCache}</span>
        </label>
        <button
          onClick={() => handleLogout(clearCache)}
          className="px-4 py-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition-all font-black uppercase tracking-widest text-[10px] flex items-center gap-1.5 shrink-0"
          data-testid="account-logout-btn"
        >
          <LogOut className="w-3 h-3" />
          {t.settings.secureLogout}
        </button>
      </div>
    </div>
  );
};
