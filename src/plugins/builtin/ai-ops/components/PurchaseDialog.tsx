/**
 * Purchase Dialog Component
 *
 * Modal dialog for purchasing or activating the local Agent capability pack.
 * Two tabs:
 * - Purchase: Shows pack info, price, and buy button
 * - Activate: One-click device activation (server matches license by user ID)
 */

import React, { useState } from 'react';
import { Lock, X, ShieldCheck, Terminal, Bot, Monitor, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

export interface PurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  onPurchaseClick: () => void;
  onActivateDevice: () => Promise<void>;
  price?: number;
}

type Tab = 'purchase' | 'activate';

export const PurchaseDialog: React.FC<PurchaseDialogProps> = ({
  open,
  onClose,
  onPurchaseClick,
  onActivateDevice,
  price = 69,
}) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<Tab>('purchase');
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [activateError, setActivateError] = useState('');

  if (!open) return null;

  const handleActivate = async () => {
    setActivating(true);
    setActivateResult('idle');
    setActivateError('');
    try {
      await onActivateDevice();
      setActivateResult('success');
    } catch (e: any) {
      setActivateResult('error');
      setActivateError(e?.message || t.activateDefaultError);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-sm relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center">
            <Lock className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-sm font-black text-white">
            {t.purchaseTitle}
          </h3>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('purchase')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'purchase'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.tabPurchase}
          </button>
          <button
            onClick={() => { setActiveTab('activate'); setActivateResult('idle'); }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'activate'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.tabActivate}
          </button>
        </div>

        {/* Purchase tab */}
        {activeTab === 'purchase' && (
          <div className="space-y-4">
            {/* Price highlight */}
            <div className="text-center py-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
              <span className="text-2xl font-black text-amber-400">&yen;{price}</span>
              <p className="text-[10px] text-slate-400 mt-1">{t.priceOneTime}</p>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-300 mb-2">
                {t.unlockFeatures}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <Bot className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-[10px] text-slate-400 leading-relaxed">
                    {t.featureAgentLoop}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Terminal className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-[10px] text-slate-400 leading-relaxed">
                    {t.featureSSH}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-[10px] text-slate-400 leading-relaxed">
                    {t.featurePersistent}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic mt-2">
                {t.featureBYOK}
              </p>
            </div>

            {/* Buy button */}
            <button
              onClick={onPurchaseClick}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
            >
              {t.buyNow(price)}
            </button>
          </div>
        )}

        {/* Activate tab */}
        {activeTab === 'activate' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 p-3 bg-white/5 rounded-xl border border-white/5">
              <Monitor className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] text-slate-300 font-bold mb-1">
                  {t.purchasedOnOther}
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {t.purchasedOnOtherDesc}
                </p>
              </div>
            </div>

            {/* Result feedback */}
            {activateResult === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in fade-in duration-200">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-emerald-400 font-bold">{t.activateSuccess}</span>
              </div>
            )}
            {activateResult === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-[11px] text-rose-400">{activateError}</span>
              </div>
            )}

            {/* Activate button */}
            <button
              onClick={handleActivate}
              disabled={activating || activateResult === 'success'}
              className={`w-full py-3 text-xs font-black rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                activateResult === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
              } disabled:opacity-60`}
            >
              {activating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {activateResult === 'success' ? t.activated : t.activateCurrentDevice}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
