import React, { useState, useEffect } from 'react';
import { User as UserType } from '@/utils/types';
import { UserCircle, Save, Loader2, Check, Mail, LogOut } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { apiService } from '@/base/http/api';
import { logger, LOG_MODULE } from '@/base/logger/logger';

interface PersonalCenterProps {
  user: UserType;
  updateUserState: (updates: Partial<UserType>) => void;
  handleLogout: (clearServerCache?: boolean) => void;
}

export const PersonalCenter: React.FC<PersonalCenterProps> = ({
  user, updateUserState, handleLogout
}) => {
  const { t } = useI18n();

  // 本地编辑态
  const [draft, setDraft] = useState({
    nickname: user.nickname || '',
    gender: user.gender || 'other',
    birthday: user.birthday || '',
  });

  // 当外部 user 变更时同步（如切换账户）
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

  const labelCls = 'text-[10px] font-black uppercase tracking-widest px-1 text-[var(--text-dim)] opacity-50';
  const inputCls = 'w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl px-5 py-3.5 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 transition-colors';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 头像 + 基本信息概览 */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl">
        <div className="flex items-center gap-5 mb-2">
          <div className="w-16 h-16 rounded-[1.25rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10 shrink-0">
            <UserCircle className="w-8 h-8" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-[var(--text-main)] truncate">{user.nickname || user.email || 'User'}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-[var(--text-dim)]">
              <Mail className="w-3 h-3 opacity-50" />
              <span className="text-xs opacity-60">{user.email || '-'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 编辑表单 */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl">
        <div className="flex items-center gap-3 mb-8 text-indigo-400">
          <UserCircle className="w-4.5 h-4.5" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">{t.settings.personalProfile}</h3>
        </div>

        <div className="space-y-6">
          {/* 昵称 - 全宽 */}
          <div className="space-y-2">
            <label className={labelCls}>{t.settings.nickname}</label>
            <input
              type="text"
              value={draft.nickname}
              onChange={(e) => setDraft(d => ({ ...d, nickname: e.target.value }))}
              className={inputCls}
              placeholder="CyberCat"
            />
          </div>

          {/* 性别 + 生日 并排 */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className={labelCls}>{t.settings.gender}</label>
              <select
                value={draft.gender}
                onChange={(e) => setDraft(d => ({ ...d, gender: e.target.value }))}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                <option value="male">{t.settings.male}</option>
                <option value="female">{t.settings.female}</option>
                <option value="other">{t.settings.private}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>{t.settings.birthday}</label>
              <input
                type="date"
                value={draft.birthday}
                onChange={(e) => setDraft(d => ({ ...d, birthday: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="mt-8 pt-6 border-t border-[var(--border-color)] flex items-center justify-between">
          <div className="h-5">
            {saveStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold animate-in fade-in duration-200">
                <Check className="w-3.5 h-3.5" />
                {t.settings.saved}
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-rose-400 text-[10px] font-bold animate-in fade-in duration-200">
                {t.settings.saveFailed?.replace('{error}', '') || '保存失败'}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
              isDirty
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_10px_30px_rgba(99,102,241,0.3)]'
                : 'bg-[var(--bg-main)] text-[var(--text-dim)] border border-[var(--border-color)] cursor-not-allowed opacity-50'
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t.common.save}
          </button>
        </div>
      </section>

      {/* 清除缓存 + 退出登录 */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] cursor-pointer hover:border-rose-500/30 transition-colors select-none">
          <input
            type="checkbox"
            checked={clearCache}
            onChange={(e) => setClearCache(e.target.checked)}
            className="w-4 h-4 rounded accent-rose-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--text-dim)]">{t.settings.clearServerCache}</span>
        </label>
        <button
          onClick={() => handleLogout(clearCache)}
          className="w-full py-4 rounded-[2rem] border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition-all font-black uppercase tracking-[0.3em] text-[10px] shadow-sm flex items-center justify-center gap-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t.settings.secureLogout}
        </button>
      </div>
    </div>
  );
};
