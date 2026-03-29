/**
 * Password input row component
 *
 * Embedded in StepDetailCard, supports "don't prompt in this conversation" feature.
 */

import React, { useState } from 'react';
import { ShieldAlert, Check } from 'lucide-react';

export interface PasswordInputRowProps {
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSkipChange: (skip: boolean) => void;
  skipPasswordPrompt: boolean;
  language: 'zh' | 'en';
  prompt?: string;
}

export const PasswordInputRow: React.FC<PasswordInputRowProps> = ({
  password,
  onPasswordChange,
  onSubmit,
  onCancel,
  onSkipChange,
  skipPasswordPrompt,
  language,
  prompt,
}) => {
  const [showSkipIndicator, setShowSkipIndicator] = useState(false);

  const handleSkipChange = (checked: boolean) => {
    onSkipChange(checked);
    if (checked) {
      setShowSkipIndicator(true);
      setTimeout(() => setShowSkipIndicator(false), 2000);
    }
  };

  const handleSubmit = () => {
    if (skipPasswordPrompt) {
      setShowSkipIndicator(true);
      setTimeout(() => setShowSkipIndicator(false), 2000);
    }
    onSubmit();
  };

  return (
    <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-2 text-amber-500">
        <ShieldAlert className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase">
          {language === 'en' ? 'Password Required' : '需要密码'}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {prompt || (language === 'en' ? 'This command requires sudo password' : '此命令需要 sudo 密码')}
      </p>

      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder={language === 'en' ? 'Enter password' : '输入密码'}
          className="flex-1 px-3 py-2 rounded-lg text-xs border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-main)',
          }}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!password?.trim()}
          className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-colors ${
            password?.trim()
              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
              : 'bg-white/5 text-slate-600 cursor-not-allowed'
          }`}
        >
          {language === 'en' ? 'Submit' : '提交'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
        >
          {language === 'en' ? 'Cancel' : '取消'}
        </button>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={skipPasswordPrompt}
            onChange={(e) => handleSkipChange(e.target.checked)}
            className="w-4 h-4 rounded border-indigo-500 text-indigo-600 focus:ring-indigo-500/50"
          />
          <span className="text-[10px] group-hover:text-indigo-400 transition-colors" style={{ color: 'var(--text-dim)' }}>
            {language === 'en' ? "Don't prompt in this conversation" : '本轮对话不再提示'}
          </span>
        </label>
        {showSkipIndicator && (
          <span className="flex items-center gap-1 text-[9px] text-emerald-500">
            <Check className="w-3 h-3" />
            {language === 'en' ? 'Applied!' : '已应用!'}
          </span>
        )}
      </div>

      {skipPasswordPrompt && (
        <p className="text-[9px]" style={{ color: 'var(--text-dim)', opacity: 0.6 }}>
          {language === 'en'
            ? '✓ Password will be remembered for this conversation only'
            : '✓ 本轮对话中已输入的密码将被复用'}
        </p>
      )}
    </div>
  );
};
