/**
 * 用户消息气泡
 */

import React from 'react';
import { User as UserIcon, File } from 'lucide-react';
import type { UserTextBlock } from '../types';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface Props {
  block: UserTextBlock;
  language: 'zh' | 'en';
}

export const UserTextBubble: React.FC<Props> = React.memo(({ block, language }) => (
  <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 items-end">
    {/* 头部 */}
    <div className="flex items-center gap-2 px-2 flex-row-reverse">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-indigo-600/20 text-indigo-400">
        <UserIcon className="w-3.5 h-3.5" />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
        {language === 'en' ? 'Me' : '我'}
      </span>
    </div>

    {/* 消息内容 */}
    <div className="max-w-[90%] space-y-2">
      <div className="p-4 rounded-2xl text-xs leading-relaxed font-medium bg-indigo-600/10 border border-indigo-500/20 text-[var(--text-main)] rounded-tr-none select-text">
        {block.content}
      </div>
      {block.files && block.files.length > 0 && (
        <div className="space-y-1">
          {block.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
            >
              <File className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="text-[10px] text-indigo-300 truncate flex-1">{file.name}</span>
              <span className="text-[9px] text-indigo-400/60">{formatFileSize(file.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
));
