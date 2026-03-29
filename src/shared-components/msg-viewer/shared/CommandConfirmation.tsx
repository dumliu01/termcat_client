/**
 * Interactive command confirmation component
 *
 * Displays risk warnings, command preview, and confirm/cancel buttons.
 */

import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { RiskLevel } from '../types';

interface CommandConfirmationProps {
  command: string;
  description: string;
  risk: RiskLevel;
  onConfirm: () => void;
  onCancel: () => void;
  language: 'zh' | 'en';
  prompt?: string;
}

export const CommandConfirmation: React.FC<CommandConfirmationProps> = ({
  command,
  description,
  risk,
  onConfirm,
  onCancel,
  language,
  prompt,
}) => {
  const getRiskColorClass = () => {
    switch (risk) {
      case 'high': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'low': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getRiskText = () => {
    switch (risk) {
      case 'high': return language === 'en' ? 'High Risk Operation' : '高风险操作';
      case 'medium': return language === 'en' ? 'Medium Risk Operation' : '中等风险操作';
      case 'low': return language === 'en' ? 'Low Risk Operation' : '低风险操作';
      default: return language === 'en' ? 'Operation' : '操作';
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getRiskColorClass()}`}>
        <AlertTriangle className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase">{getRiskText()}</span>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {prompt || (language === 'en'
          ? 'This command requires confirmation. Please review the details below and confirm to proceed.'
          : '此命令需要确认。请仔细查看以下详情并确认执行。')}
      </p>

      <div className="space-y-2">
        <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
          {language === 'en' ? 'Operation' : '操作说明'}:
        </span>
        <div className="p-3 rounded-lg bg-black/20 border border-white/5">
          <p className="text-xs" style={{ color: 'var(--text-main)' }}>{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
          {language === 'en' ? 'Command to Execute' : '将执行的命令'}:
        </span>
        <div className="p-3 rounded-lg font-mono text-[11px] bg-black/40 text-indigo-300 break-all select-text cursor-text border border-indigo-500/20">
          {command}
        </div>
      </div>

      {risk === 'high' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-rose-400">
            {language === 'en'
              ? '⚠️ Warning: This operation cannot be undone. Please make sure you understand what this command does before proceeding.'
              : '⚠️ 警告：此操作不可撤销。请确保您理解此命令的作用后再继续。'}
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onConfirm}
          className={`flex-1 text-white text-[10px] font-black uppercase py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            risk === 'high'
              ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20'
              : risk === 'medium'
              ? 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/20'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
          }`}
        >
          <Check className="w-4 h-4" />
          {language === 'en' ? 'Confirm & Execute' : '确认执行'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
        >
          <X className="w-4 h-4 inline mr-1" />
          {language === 'en' ? 'Cancel' : '取消'}
        </button>
      </div>
    </div>
  );
};
