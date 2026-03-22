/**
 * 操作计划卡片
 */

import React from 'react';
import { Activity } from 'lucide-react';
import { getStepStatusIcon } from '../utils/stepIcons';
import { getStepStatusBgColor } from '../utils/riskColors';
import type { OperationPlanBlock, PlanStep } from '../types';
import { getMsgViewerLocale } from '../locales';

const StepListItem: React.FC<{ step: PlanStep; index: number; language: 'zh' | 'en' }> = ({ step, index, language }) => (
  <div
    className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
    style={{ backgroundColor: getStepStatusBgColor(step.status) }}
  >
    <div className="flex-shrink-0">{getStepStatusIcon(step.status)}</div>
    <span className="text-xs flex-1 select-text" style={{ color: 'var(--text-main)' }}>
      {language === 'en' ? 'Step' : '步骤'} {index + 1}: {step.description}
    </span>
  </div>
);

interface Props {
  block: OperationPlanBlock;
  language: 'zh' | 'en';
}

export const OperationPlanCard: React.FC<Props> = React.memo(({ block, language }) => {
  const { description, steps, status, tokenUsage } = block;
  const isCompleted = status === 'completed';

  return (
    <div className="w-full mt-2 border border-indigo-500/30 bg-indigo-500/5 rounded-2xl overflow-hidden p-4 space-y-4 shadow-xl shadow-indigo-500/10">
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
          {language === 'en' ? 'Execution Plan' : '执行计划'}
        </span>
        {tokenUsage && !isCompleted && tokenUsage.showGems !== false && (
          <span className="ml-auto text-[9px]" style={{ color: 'var(--text-dim)' }}>
            (-{tokenUsage.costGems} 💎)
          </span>
        )}
      </div>

      <p className="text-xs whitespace-pre-wrap select-text" style={{ color: 'var(--text-dim)' }}>
        {description}
      </p>

      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((step, index) => (
            <StepListItem key={index} step={step} index={index} language={language} />
          ))}
        </div>
      )}

      {isCompleted && tokenUsage && (tokenUsage.showTokens !== false || tokenUsage.showGems !== false) && (() => {
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
