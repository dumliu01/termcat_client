/**
 * Step detail card
 *
 * Displays command execution steps, risk level, execute button, password input, confirmation dialog, execution result.
 */

import React from 'react';
import { Loader2, Check, XCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { getRiskColor } from '../utils/riskColors';
import { PasswordInputRow } from '../shared/PasswordInput';
import { CommandConfirmation } from '../shared/CommandConfirmation';
import type { StepDetailBlock, PasswordState, MsgViewerActions } from '../types';
import { getMsgViewerLocale } from '../locales';

interface Props {
  block: StepDetailBlock;
  language: 'zh' | 'en';
  passwordState?: PasswordState;
  actions: MsgViewerActions;
}

export const StepDetailCard: React.FC<Props> = React.memo(({ block, language, passwordState, actions }) => {
  const {
    id: blockId,
    stepIndex,
    stepDescription,
    command,
    risk,
    status,
    output,
    success,
    passwordPrompt,
    tokenUsage,
  } = block;

  const isWaitingConfirm = status === 'waiting_confirm';
  const isWaitingPassword = status === 'waiting_password';
  const isWaitingUserConfirm = status === 'waiting_user_confirm';
  const executingStepId = passwordState?.executingStepId;
  const isExecuting = status === 'executing' || (executingStepId === blockId && status !== 'completed' && status !== 'error' && !output);
  const isCompleted = status === 'completed' || (success === true && !!output);
  const isError = status === 'error' || (success === false && !!output);

  const needsUserConfirmation = risk === 'high' || risk === 'medium';

  const getButtonConfig = () => {
    if (isExecuting) return { icon: <Loader2 className="w-4 h-4 animate-spin" />, text: language === 'en' ? 'Executing...' : '执行中...', className: 'bg-indigo-600/50' };
    if (isCompleted) return { icon: <Check className="w-4 h-4" />, text: language === 'en' ? 'Completed' : '执行完毕', className: 'bg-emerald-600' };
    if (isError) return { icon: <XCircle className="w-4 h-4" />, text: language === 'en' ? 'Failed' : '执行失败', className: 'bg-rose-600' };
    return { icon: <span className="text-base">▶</span>, text: language === 'en' ? 'Execute' : '执行', className: 'bg-indigo-600 hover:bg-indigo-500' };
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="w-full mt-2 border-l-4 border-indigo-500 bg-slate-500/5 rounded-r-2xl overflow-hidden p-4 space-y-3">
      {/* Step title */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <span className="text-xs font-black text-indigo-400">
            {stepIndex !== undefined ? stepIndex + 1 : '?'}
          </span>
        </div>
        <span className="text-sm font-black select-text" style={{ color: 'var(--text-main)' }}>
          {stepDescription}
        </span>
      </div>

      {/* Risk level */}
      {risk && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
            {language === 'en' ? 'Risk Level' : '风险等级'}:
          </span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${getRiskColor(risk)}`}>
            {risk}
          </span>
        </div>
      )}

      {/* Command content */}
      {command && (
        <div className="space-y-2">
          <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
            {language === 'en' ? 'Command' : '命令'}:
          </span>
          <div className="p-3 rounded-lg font-mono text-[11px] bg-black/40 text-indigo-300 break-all select-text cursor-text">
            {command}
          </div>
        </div>
      )}

      {/* Tool permission buttons — Claude Code CLI style (Allow once / Always allow / Deny) */}
      {isWaitingConfirm && command && block.permissionId && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => actions.onStepConfirm?.(blockId, stepIndex, command, risk)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all shadow-sm hover:shadow-emerald-500/10"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {language === 'en' ? 'Allow once' : '本次允许'}
          </button>
          {block.allowPermanent && (
            <button
              onClick={() => actions.onToolApproveAlways?.(block.permissionId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 transition-all shadow-sm hover:shadow-indigo-500/10"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {language === 'en' ? 'Always allow' : '永久允许'}
            </button>
          )}
          <button
            onClick={() => actions.onStepCancel?.(blockId, stepIndex)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
          >
            <ShieldX className="w-3.5 h-3.5" />
            {language === 'en' ? 'Deny' : '拒绝'}
          </button>
        </div>
      )}

      {/* Regular execute button (non-permission steps) */}
      {((isWaitingConfirm || isExecuting || isCompleted || isError) && command && !isWaitingUserConfirm && !block.permissionId) && (
        <div className="flex gap-2 pt-2">
          <button
            disabled={isExecuting || isCompleted || isError}
            onClick={() => {
              actions.onStepConfirm?.(blockId, stepIndex, command, risk, needsUserConfirmation);
            }}
            className={`flex-1 text-white text-[10px] font-black uppercase py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${buttonConfig.className}`}
          >
            {buttonConfig.icon}
            {buttonConfig.text}
          </button>
          {isWaitingConfirm && (
            <button
              onClick={() => actions.onStepCancel?.(blockId, stepIndex)}
              className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
            >
              {language === 'en' ? 'Skip' : '跳过'}
            </button>
          )}
          {isExecuting && (
            <button
              onClick={() => actions.onStepCancel?.(blockId, stepIndex)}
              className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              {language === 'en' ? 'Cancel' : '取消'}
            </button>
          )}
          {isError && (
            <button
              onClick={() => actions.onStepConfirm?.(blockId, stepIndex, command, risk)}
              className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
            >
              {language === 'en' ? 'Retry' : '重试'}
            </button>
          )}
        </div>
      )}

      {/* Executing/completed/error status for permission steps (after approval) */}
      {((isExecuting || isCompleted || isError) && command && block.permissionId) && (
        <div className="flex gap-2 pt-2">
          <div className={`flex-1 text-white text-[10px] font-black uppercase py-2.5 rounded-lg flex items-center justify-center gap-1.5 ${buttonConfig.className}`}>
            {buttonConfig.icon}
            {buttonConfig.text}
          </div>
          {isExecuting && (
            <button
              onClick={() => actions.onStepCancel?.(blockId, stepIndex)}
              className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              {language === 'en' ? 'Cancel' : '取消'}
            </button>
          )}
        </div>
      )}

      {/* Interactive command confirmation */}
      {isWaitingUserConfirm && command && (
        <CommandConfirmation
          command={command}
          description={stepDescription || ''}
          risk={risk || 'low'}
          onConfirm={() => actions.onStepConfirm?.(blockId, stepIndex, command, risk)}
          onCancel={() => actions.onStepCancel?.(blockId, stepIndex)}
          language={language}
        />
      )}

      {/* Password input */}
      {isWaitingPassword && passwordState && (
        <PasswordInputRow
          password={passwordState.value}
          onPasswordChange={actions.onPasswordChange || (() => {})}
          onSubmit={actions.onPasswordSubmit || (() => {})}
          onCancel={() => {
            actions.onPasswordChange?.('');
            actions.onStepCancel?.(blockId, stepIndex);
          }}
          onSkipChange={actions.onPasswordSkipChange || (() => {})}
          skipPasswordPrompt={passwordState.skipPrompt}
          language={language}
          prompt={passwordPrompt || (language === 'en' ? 'This command requires sudo password' : '此命令需要 sudo 密码')}
        />
      )}

      {/* Execution result */}
      {output && (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
              {language === 'en' ? 'Result' : '执行结果'}:
            </span>
            {success !== undefined && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                {success ? '✅ 成功' : '❌ 失败'}
              </span>
            )}
          </div>
          <div className="p-3 rounded-lg font-mono text-[11px] bg-black/40 text-slate-300 break-all whitespace-pre-wrap max-h-40 overflow-y-auto select-text">
            {output}
          </div>
        </div>
      )}

      {/* Statistics */}
      {tokenUsage && status === 'completed' && (tokenUsage.showTokens !== false || tokenUsage.showGems !== false) && (() => {
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
