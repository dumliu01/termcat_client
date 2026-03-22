import React, { useState, useEffect, useRef } from 'react';
import {
  Check, ChevronRight, Zap, Cat, HelpCircle, Mail, ArrowUpRight
} from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { apiService } from '@/base/http/api';
import { VERSION_STRING, VERSION_NUMBER, versionToNumber } from '@/utils/version';

interface FAQItem {
  id: number;
  question_zh: string;
  answer_zh: string;
  question_en: string;
  answer_en: string;
  sort: number;
}

const FAQ_CACHE_KEY = 'termcat_faq_cache';
const FAQ_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export const SettingSupport: React.FC = () => {
  const { t, language } = useI18n();

  const [feedbackText, setFeedbackText] = useState('');
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const [faqList, setFaqList] = useState<FAQItem[]>([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const faqInitiated = useRef(false);

  const [versionStatus, setVersionStatus] = useState<'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error'>('idle');
  const [latestVersion, setLatestVersion] = useState<{ version: string; download_url: string; release_notes: string } | null>(null);
  const versionChecked = useRef(false);

  const fallbackFAQs: FAQItem[] = [
    { id: 1, question_zh: t.settings.faqHowGetBones, answer_zh: t.settings.faqBoneAnswer, question_en: t.settings.faqHowGetBones, answer_en: t.settings.faqBoneAnswer, sort: 1 },
    { id: 2, question_zh: t.settings.faqCloudSync, answer_zh: t.settings.faqCloudSyncAnswer, question_en: t.settings.faqCloudSync, answer_en: t.settings.faqCloudSyncAnswer, sort: 2 },
    { id: 3, question_zh: t.settings.faqProxy, answer_zh: t.settings.faqProxyAnswer, question_en: t.settings.faqProxy, answer_en: t.settings.faqProxyAnswer, sort: 3 },
  ];

  const checkVersion = async () => {
    setVersionStatus('checking');
    try {
      const data = await apiService.getLatestVersion();
      if (!data || !data.version) {
        setVersionStatus('upToDate');
        return;
      }
      setLatestVersion(data);
      if (versionToNumber(data.version) > VERSION_NUMBER) {
        setVersionStatus('updateAvailable');
      } else {
        setVersionStatus('upToDate');
      }
    } catch {
      setVersionStatus('error');
    }
  };

  useEffect(() => {
    if (!faqInitiated.current) {
      faqInitiated.current = true;
      try {
        const raw = localStorage.getItem(FAQ_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; data: FAQItem[] };
          if (Date.now() - cached.ts < FAQ_CACHE_TTL && cached.data?.length > 0) {
            setFaqList(cached.data);
            return;
          }
        }
      } catch { /* ignore */ }

      setFaqLoading(true);
      apiService.getFAQs()
        .then((data: FAQItem[]) => {
          if (data && data.length > 0) {
            setFaqList(data);
            localStorage.setItem(FAQ_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
          } else {
            setFaqList(fallbackFAQs);
          }
        })
        .catch(() => {
          setFaqList(fallbackFAQs);
        })
        .finally(() => setFaqLoading(false));
    }
  }, []);

  useEffect(() => {
    if (!versionChecked.current) {
      versionChecked.current = true;
      checkVersion();
    }
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 版本信息 */}
      <section className="bg-[var(--bg-card)] p-10 rounded-[2.5rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md relative overflow-hidden group">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] group-hover:bg-indigo-500/10 transition-all duration-1000" />
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_20px_50px_rgba(99,102,241,0.4)] mb-8 transition-transform group-hover:rotate-6">
            <Cat className="w-12 h-12 text-white" />
          </div>
          <h3 className="text-3xl font-black tracking-tight mb-2 text-[var(--text-main)]">TermCat AITerm</h3>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-10">{t.settings.productionStable} {VERSION_STRING}</p>
          <div className="flex gap-4">
            <button onClick={checkVersion} disabled={versionStatus === 'checking'} className={`px-8 py-3 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 ${versionStatus === 'upToDate' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : versionStatus === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' : 'bg-[var(--bg-tab)] border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-tab)]/80'}`}>
              {versionStatus === 'checking' ? t.settings.checkingVersion : versionStatus === 'upToDate' ? t.settings.currentIsLatest : versionStatus === 'error' ? t.settings.versionCheckFailed : t.settings.checkUpdates}
            </button>
            <button className="px-8 py-3 bg-[var(--bg-tab)] border border-[var(--border-color)] text-[var(--text-main)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-tab)]/80 transition-all active:scale-95">
              {t.settings.documentation}
            </button>
          </div>
          {versionStatus === 'updateAvailable' && latestVersion && (
            <div className="mt-6 w-full max-w-md">
              <div className="px-5 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-500">{t.settings.newVersionAvailable.replace('{version}', latestVersion.version)}</span>
                </div>
                <button onClick={() => { if (latestVersion.download_url) (window as any).electron?.openExternal?.(latestVersion.download_url); }} className="px-4 py-1.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-95 shrink-0 flex items-center gap-1">
                  {t.settings.downloadUpdate}<ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-8 opacity-40 flex items-center gap-3 text-[var(--text-dim)]">
          <HelpCircle className="w-4 h-4" />{t.settings.technicalSupport}
        </h3>
        {faqLoading ? (
          <div className="flex items-center justify-center py-4">
            <span className="text-xs text-[var(--text-dim)] opacity-50">{t.settings.faqLoading}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {faqList.map((faq) => (
              <details key={faq.id} className="group border border-[var(--border-color)] rounded-2xl bg-[var(--bg-tab)]/30 overflow-hidden transition-all hover:bg-[var(--bg-tab)]/50">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
                  <span className="text-xs font-black tracking-tight opacity-80 text-[var(--text-main)]">
                    {language === 'zh' ? faq.question_zh : faq.question_en}
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-black/5 flex items-center justify-center group-open:rotate-180 transition-transform text-[var(--text-main)] shrink-0 ml-3">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform rotate-90" />
                  </div>
                </summary>
                <div className="px-4 pb-3 text-xs opacity-50 leading-relaxed font-medium text-[var(--text-dim)]">
                  <div className="pt-3 border-t border-[var(--border-color)]">
                    {language === 'zh' ? faq.answer_zh : faq.answer_en}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* 反馈 */}
      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-8 opacity-40 flex items-center gap-3 text-[var(--text-dim)]">
          <Mail className="w-4 h-4" />
          {t.settings.feedbackTitle}
        </h3>
        {isFeedbackSubmitted ? (
          <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 text-emerald-500">
              <Check className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-black text-[var(--text-main)] mb-2">
              {t.settings.feedbackSuccessTitle}
            </h4>
            <p className="text-xs text-[var(--text-dim)] font-medium">
              {t.settings.feedbackSuccessMessage}
            </p>
            <button
              onClick={() => {
                setIsFeedbackSubmitted(false);
                setFeedbackText('');
                setFeedbackError('');
              }}
              className="mt-6 px-6 py-2 bg-[var(--bg-tab)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-tab)]/80 transition-all active:scale-95"
            >
              {t.settings.feedbackSubmitAnother}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl p-5 text-sm text-[var(--text-main)] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none h-32 placeholder:text-[var(--text-dim)]/50"
              placeholder={t.settings.feedbackPlaceholder}
            />
            {feedbackError && (
              <p className="text-xs text-rose-500 font-medium px-1">{feedbackError}</p>
            )}
            <div className="flex justify-end">
              <button
                disabled={!feedbackText.trim() || isFeedbackSubmitting}
                onClick={async () => {
                  if (!feedbackText.trim()) return;
                  setIsFeedbackSubmitting(true);
                  setFeedbackError('');
                  try {
                    await apiService.submitFeedback(feedbackText.trim());
                    setIsFeedbackSubmitted(true);
                  } catch {
                    setFeedbackError(t.settings.feedbackError);
                  } finally {
                    setIsFeedbackSubmitting(false);
                  }
                }}
                className="px-8 py-3.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFeedbackSubmitting ? t.settings.feedbackSubmitting : t.settings.feedbackSubmit}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
