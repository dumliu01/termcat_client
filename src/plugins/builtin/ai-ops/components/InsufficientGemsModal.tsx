import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

interface InsufficientGemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecharge: () => void;
  mode: 'ask' | 'agent';
}

/**
 * Insufficient Gems Modal Component
 * Shown when user has insufficient gem balance
 */
export const InsufficientGemsModal: React.FC<InsufficientGemsModalProps> = ({
  isOpen,
  onClose,
  onRecharge,
  mode,
}) => {
  const t = useT();

  if (!isOpen) return null;

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
            {mode === 'agent'
              ? t.insufficientGemsAgentMode
              : t.insufficientGemsMessage}
          </p>
        </div>

        {/* Button Group */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { onClose(); onRecharge(); }}
            className="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition-all"
          >
            {t.recharge}
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
