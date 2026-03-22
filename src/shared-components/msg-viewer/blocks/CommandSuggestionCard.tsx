/**
 * 命令建议卡片
 */

import React from 'react';
import { Terminal, ShieldCheck, ShieldAlert, Play } from 'lucide-react';
import { CopyButton } from '../shared/CopyButton';
import { getRiskColor } from '../utils/riskColors';
import type { CommandSuggestionBlock } from '../types';
import { getMsgViewerLocale } from '../locales';

interface Props {
  block: CommandSuggestionBlock;
  language: 'zh' | 'en';
  onExecuteCommand?: (command: string) => void;
}

export const CommandSuggestionCard: React.FC<Props> = React.memo(({ block, language, onExecuteCommand }) => {
  const { command, explanation, risk, tokenUsage } = block;

  return (
    <div className="mt-2 border border-indigo-500/30 bg-indigo-500/5 rounded-2xl overflow-hidden p-4 space-y-4 shadow-xl shadow-indigo-500/10" style={{ margin: '8px 10px 0' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
            {language === 'en' ? 'Command Suggestion' : '命令建议'}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${getRiskColor(risk)}`}>
          {risk === 'low' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
          Risk: {risk}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 p-3 bg-black/40 rounded-xl border border-white/5 font-mono text-[11px] text-indigo-300 break-all leading-relaxed">
          {command}
        </div>
        <CopyButton text={command} />
      </div>

      {explanation && (
        <div className="text-xs text-[var(--text-dim)] leading-relaxed">{explanation}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onExecuteCommand?.(command)}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Play className="w-3.5 h-3.5" />
          {language === 'en' ? 'Execute' : '执行'}
        </button>
      </div>

      {tokenUsage && (tokenUsage.showTokens !== false || tokenUsage.showGems !== false) && (() => {
        const loc = getMsgViewerLocale(language);
        return (
          <div className="pt-2 border-t border-white/5 flex items-center gap-3 text-[9px]" style={{ color: 'var(--text-dim)' }}>
            {tokenUsage.showTokens !== false && (<><span>{loc.statsInputTokens}: {tokenUsage.inputTokens.toLocaleString()} {loc.statsTokenUnit}</span>
            <span>{loc.statsOutputTokens}: {tokenUsage.outputTokens.toLocaleString()} {loc.statsTokenUnit}</span></>)}
            {tokenUsage.showGems !== false && (<span className="text-amber-500 font-black ml-auto">{loc.statsCostGems}: {tokenUsage.costGems} {loc.statsGemsUnit}</span>)}
          </div>
        );
      })()}
    </div>
  );
});
