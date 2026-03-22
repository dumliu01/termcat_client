import React, { useState } from 'react';
import { ArrowUpRight, AlertTriangle, Sparkles } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';

export interface UpdateVersionInfo {
  version: string;
  download_url: string;
  release_notes: string;
  update_mode: 'force' | 'optional' | 'silent';
  min_version: string;
  update_method: string;
  created_at: string;
}

interface UpdateModalProps {
  versionInfo: UpdateVersionInfo;
  onClose: () => void;
  onSkipVersion: (v: string) => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  versionInfo, onClose, onSkipVersion,
}) => {
  const { t } = useI18n();
  const [skipChecked, setSkipChecked] = useState(false);
  const isForce = versionInfo.update_mode === 'force';

  const handleDownload = () => {
    (window as any).electron?.openExternal?.(versionInfo.download_url);
  };

  const handleClose = () => {
    if (skipChecked) {
      onSkipVersion(versionInfo.version);
    }
    onClose();
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-[420px] bg-[var(--bg-card)] border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {/* macOS title bar */}
        <div
          className="h-10 px-4 flex items-center justify-between border-b"
          style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex gap-2">
            {isForce ? (
              <div className="w-3 h-3 rounded-full bg-gray-500/50 cursor-not-allowed" />
            ) : (
              <div
                onClick={handleClose}
                className="w-3 h-3 rounded-full bg-[#ff5f56] hover:shadow-[0_0_8px_rgba(255,95,86,0.5)] cursor-pointer"
              />
            )}
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)]">
            {isForce ? t.settings.forceUpdateTitle : t.settings.updateAvailableTitle}
          </span>
          <div className="w-12" />
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Icon + Version */}
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${isForce ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-indigo-500/10 border border-indigo-500/20'}`}>
              {isForce ? (
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              ) : (
                <Sparkles className="w-6 h-6 text-indigo-500" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--text-main)] tracking-tight">
                v{versionInfo.version}
              </h3>
              <p className="text-[10px] font-bold text-[var(--text-dim)]">
                {t.settings.updateTime}: {formatDate(versionInfo.created_at)}
              </p>
            </div>
          </div>

          {/* Force update message */}
          {isForce && (
            <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-xs font-bold text-amber-500">{t.settings.forceUpdateMessage}</p>
            </div>
          )}

          {/* Release notes */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] opacity-60">
              {t.settings.releaseNotes}
            </h4>
            <div className="px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl max-h-32 overflow-y-auto">
              <p className="text-xs text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                {versionInfo.release_notes}
              </p>
            </div>
          </div>

          {/* Update method */}
          {versionInfo.update_method && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] opacity-60">
                {t.settings.updateMethodLabel}
              </h4>
              <p className="text-xs text-[var(--text-main)] px-1">{versionInfo.update_method}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleDownload}
              className={`w-full py-3.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 ${
                isForce
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
              }`}
            >
              {t.settings.downloadNow}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {!isForce && (
              <>
                <button
                  onClick={handleClose}
                  className="w-full py-3 bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-dim)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-tab)] transition-all active:scale-95"
                >
                  {t.settings.remindLater}
                </button>

                <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipChecked}
                    onChange={(e) => setSkipChecked(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-indigo-500"
                  />
                  <span className="text-[10px] font-bold text-[var(--text-dim)]">
                    {t.settings.skipThisVersion}
                  </span>
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
