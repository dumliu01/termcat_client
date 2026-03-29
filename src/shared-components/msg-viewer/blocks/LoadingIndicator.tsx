/**
 * Loading indicator
 */

import React from 'react';
import { Loader2, MessageCircle, Clock } from 'lucide-react';
import type { LoadingBlock } from '../types';

interface Props {
  block?: LoadingBlock;
  /** Direct status (for footer mode) */
  status?: 'thinking' | 'generating' | 'waiting_user';
  message?: string;
  language?: 'zh' | 'en';
}

export const LoadingIndicator: React.FC<Props> = React.memo(({ block, status: directStatus, message: directMessage, language = 'zh' }) => {
  const status = block?.loadingStatus || directStatus || 'thinking';
  const message = block?.message || directMessage;

  const getDisplay = () => {
    switch (status) {
      case 'thinking':
        return {
          text: message || (language === 'en' ? 'AI is thinking...' : 'AI 正在思考...'),
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
          color: 'emerald',
        };
      case 'generating':
        return {
          text: message || (language === 'en' ? 'AI is generating...' : 'AI 正在生成内容...'),
          icon: <MessageCircle className="w-3.5 h-3.5 animate-pulse" />,
          color: 'blue',
        };
      case 'waiting_user':
        return {
          text: message || (language === 'en' ? 'Waiting for user...' : '等待用户确认...'),
          icon: <Clock className="w-3.5 h-3.5 animate-pulse" />,
          color: 'amber',
        };
      default:
        return {
          text: message || (language === 'en' ? 'AI is thinking...' : 'AI 正在思考...'),
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
          color: 'emerald',
        };
    }
  };

  const { text, icon, color } = getDisplay();

  return (
    <div className="flex flex-col gap-3 items-start animate-in fade-in duration-300">
      <div className="flex items-center gap-2 px-2">
        <div className={`w-6 h-6 rounded-lg bg-${color}-500/10 text-${color}-500 flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest animate-pulse" style={{ color: 'var(--text-dim)' }}>
          {text}
        </span>
      </div>
    </div>
  );
});
