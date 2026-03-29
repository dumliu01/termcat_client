/**
 * Task completion feedback prompt
 */

import React, { useState } from 'react';
import { CheckCircle, MessageSquarePlus, Send } from 'lucide-react';
import type { FeedbackBlock, MsgViewerActions } from '../types';

interface Props {
  block: FeedbackBlock;
  language: 'zh' | 'en';
  actions: MsgViewerActions;
}

export const FeedbackPrompt: React.FC<Props> = ({ block, language, actions }) => {
  const [showInput, setShowInput] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleContinue = () => {
    if (feedbackMsg.trim()) {
      actions.onFeedbackContinue?.(feedbackMsg.trim());
      setFeedbackMsg('');
      setShowInput(false);
    }
  };

  return (
    <div className="w-full mt-3 border-l-4 border-emerald-500 bg-slate-500/5 rounded-r-2xl overflow-hidden p-4 space-y-3">
      <div className="text-[11px] font-bold" style={{ color: 'var(--text-main)' }}>
        {language === 'en' ? 'Task completed. What would you like to do?' : '任务已完成，请选择下一步操作：'}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => actions.onFeedbackAccept?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all shadow-sm hover:shadow-emerald-500/10"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {language === 'en' ? 'Accept' : '完成'}
        </button>
        <button
          onClick={() => setShowInput(!showInput)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          {language === 'en' ? 'Continue' : '继续对话'}
        </button>
      </div>
      {showInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={feedbackMsg}
            onChange={(e) => setFeedbackMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleContinue(); } }}
            placeholder={language === 'en' ? 'Enter follow-up instructions...' : '输入后续指令...'}
            className="flex-1 px-3 py-1.5 text-[11px] rounded-lg bg-black/30 border border-slate-500/20 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            autoFocus
          />
          <button
            onClick={handleContinue}
            disabled={!feedbackMsg.trim()}
            className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
