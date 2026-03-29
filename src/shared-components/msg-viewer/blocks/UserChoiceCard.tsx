/**
 * User choice prompt card
 */

import React, { useState } from 'react';
import { AlertTriangle, Check, X, Sparkles, Circle, CheckCircle2 } from 'lucide-react';
import type { UserChoiceBlock, MsgViewerActions } from '../types';

interface Props {
  block: UserChoiceBlock;
  language: 'zh' | 'en';
  actions: MsgViewerActions;
}

export const UserChoiceCard: React.FC<Props> = React.memo(({ block, language, actions }) => {
  const { id: blockId, issue, question, options, allowCustomInput, customInputPlaceholder } = block;
  const [selectedValue, setSelectedValue] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleOptionClick = (value: string) => {
    if (submitted) return;
    setSelectedValue(value);
    setShowCustomInput(false);
  };

  const handleCustomClick = () => {
    if (submitted) return;
    setSelectedValue('custom');
    setShowCustomInput(true);
  };

  const handleSubmit = () => {
    if (submitted) return;
    setSubmitted(true);
    if (showCustomInput && customInput.trim()) {
      actions.onChoiceSubmit?.(blockId, 'custom', customInput.trim());
    } else if (selectedValue && selectedValue !== 'custom') {
      actions.onChoiceSubmit?.(blockId, selectedValue);
    }
  };

  const isSubmitDisabled = submitted || !selectedValue || (showCustomInput && !customInput.trim());

  return (
    <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-amber-500/10 border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <span className="text-[10px] font-black uppercase text-amber-500">
            {language === 'en' ? 'Need Your Decision' : '需要您的决策'}
          </span>
          <p className="text-xs text-amber-200/90">{issue}</p>
        </div>
      </div>

      <div className="px-1">
        <p className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{question}</p>
      </div>

      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <div
              key={option.value}
              onClick={() => handleOptionClick(option.value)}
              className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-indigo-500/20 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                  : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
              }`}
            >
              {option.recommended && (
                <div className="absolute -top-2 -right-2">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg">
                    <Sparkles className="w-3 h-3 text-white" />
                    <span className="text-[9px] font-black uppercase text-white">
                      {language === 'en' ? 'AI Recommended' : 'AI 推荐'}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {isSelected ? <CheckCircle2 className="w-5 h-5 text-indigo-400" /> : <Circle className="w-5 h-5 text-slate-500" />}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{option.label}</div>
                  {option.description && (
                    <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{option.description}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {allowCustomInput && (
          <div
            onClick={handleCustomClick}
            className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
              showCustomInput
                ? 'bg-indigo-500/20 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                {showCustomInput ? <CheckCircle2 className="w-5 h-5 text-indigo-400" /> : <Circle className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                  {language === 'en' ? 'Custom Input' : '自定义输入'}
                </div>
                {showCustomInput && (
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={customInputPlaceholder || (language === 'en' ? 'Enter your custom value...' : '输入自定义值...')}
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-black/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
                    autoFocus
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-1">
        <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          {language === 'en'
            ? '💡 Tip: Select an option above or provide your own input'
            : '💡 提示：选择上面的选项或提供您自己的输入'}
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`flex-1 text-white text-[10px] font-black uppercase py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            isSubmitDisabled
              ? 'bg-slate-600 cursor-not-allowed opacity-50'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
          }`}
        >
          <Check className="w-4 h-4" />
          {language === 'en' ? 'Confirm Selection' : '确认选择'}
        </button>
        <button
          onClick={() => actions.onChoiceCancel?.(blockId)}
          className="px-4 py-2 text-[10px] font-black uppercase rounded-lg border hover:bg-white/5 transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
        >
          <X className="w-4 h-4 inline mr-1" />
          {language === 'en' ? 'Cancel' : '取消'}
        </button>
      </div>
    </div>
  );
});
