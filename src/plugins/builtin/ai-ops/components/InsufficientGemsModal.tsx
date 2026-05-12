import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useT } from '../i18n';
import { commerceService } from '@/core/commerce/commerceService';

interface InsufficientGemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Triggered when the user picks the gems-recharge CTA (server-AI strategy) */
  onRecharge: () => void;
  /** Triggered when the user picks the local-plugin CTA (free strategy) */
  onDownloadLocalAgent: () => void;
  mode: 'ask' | 'agent';
}

/**
 * Insufficient Gems Modal — dual strategy.
 *
 * When commerce.gems_purchase_enabled is true (default), the CTA is "去充值".
 * When the server turns the gems panel off (v3 freemium), the CTA switches
 * to "下载本地 AI 插件" so the user is never stuck on a dead path.
 */
export const InsufficientGemsModal: React.FC<InsufficientGemsModalProps> = ({
  isOpen,
  onClose,
  onRecharge,
  onDownloadLocalAgent,
  mode,
}) => {
  const t = useT();

  if (!isOpen) return null;

  const gemsPurchaseEnabled = commerceService.isGemsPurchaseEnabled();

  const bodyText = !gemsPurchaseEnabled
    ? t.insufficientGemsLocalHint
    : mode === 'agent'
      ? t.insufficientGemsAgentMode
      : t.insufficientGemsMessage;

  const primaryLabel = gemsPurchaseEnabled ? t.recharge : t.downloadLocalAgent;
  const primaryHandler = () => {
    onClose();
    if (gemsPurchaseEnabled) {
      onRecharge();
    } else {
      onDownloadLocalAgent();
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] p-8 text-center shadow-2xl space-y-6 panel-elevation"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {/* Icon */}
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h4 className="text-sm font-black" style={{ color: 'var(--text-main)' }}>
            {t.insufficientGems}
          </h4>
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-dim)', opacity: 0.6 }}>
            {bodyText}
          </p>
        </div>

        {/* Button Group */}
        <div className="flex flex-col gap-2">
          <button
            onClick={primaryHandler}
            className="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition-all"
          >
            {primaryLabel}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-colors"
            style={{ color: 'var(--text-dim)' }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
