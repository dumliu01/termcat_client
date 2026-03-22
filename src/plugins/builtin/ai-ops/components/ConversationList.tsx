/**
 * 会话记录列表组件
 *
 * 以 slide-in overlay 形式显示在 AI 面板内，列出用户的所有历史会话。
 * 点击会话可加载对应的聊天记录。
 */

import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, MessageSquare, Bot, HelpCircle } from 'lucide-react';
import { ConversationMeta } from '@/core/chat/types';
import { useT } from '../i18n';
import type { AIOpsLocale } from '../locales';

interface ConversationListProps {
  conversations: ConversationMeta[];
  currentConvId: string | null;
  onSelect: (meta: ConversationMeta) => void;
  onDelete: (meta: ConversationMeta) => void;
  onBack: () => void;
  onNewConversation: () => void;
  loading?: boolean;
}

/** 格式化相对时间 */
function formatRelativeTime(timestamp: number, t: AIOpsLocale): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutesAgo(minutes);
  if (hours < 24) return t.hoursAgo(hours);
  if (days < 2) return t.yesterday;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentConvId,
  onSelect,
  onDelete,
  onBack,
  onNewConversation,
  loading = false,
}) => {
  const t = useT();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, meta: ConversationMeta) => {
    e.stopPropagation();
    if (deletingId === meta.convId) {
      // 第二次点击确认删除
      onDelete(meta);
      setDeletingId(null);
    } else {
      // 第一次点击，进入确认状态
      setDeletingId(meta.convId);
      // 3秒后自动取消
      setTimeout(() => setDeletingId(prev => prev === meta.convId ? null : prev), 3000);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col animate-in slide-in-from-right duration-200"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      {/* Header */}
      <div
        className="h-10 flex items-center justify-between px-3 border-b shrink-0 bg-black/10"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t.chatHistory}
        </button>

        <button
          onClick={() => { onNewConversation(); onBack(); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
            text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t.newConversation}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <MessageSquare className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 font-medium">{t.noConversations}</p>
            <p className="text-xs text-slate-500 mt-1">{t.noConversationsDesc}</p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => {
              const isActive = conv.convId === currentConvId;
              return (
                <div
                  key={conv.convId}
                  onClick={() => onSelect(conv)}
                  className={`group mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                    ${isActive
                      ? 'bg-indigo-500/15 border border-indigo-500/20'
                      : 'hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Title & Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {conv.mode === 'agent' ? (
                          <Bot className="w-3 h-3 text-violet-400 shrink-0" />
                        ) : (
                          <HelpCircle className="w-3 h-3 text-blue-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {conv.title || t.unnamedConversation}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        {conv.hostName && (
                          <span className="truncate max-w-[100px]">{conv.hostName}</span>
                        )}
                        <span>{formatRelativeTime(conv.updatedAt, t)}</span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, conv)}
                      className={`shrink-0 p-1 rounded transition-all ${
                        deletingId === conv.convId
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'
                      }`}
                      title={deletingId === conv.convId ? t.deleteConversationConfirm : t.deleteConversation}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
