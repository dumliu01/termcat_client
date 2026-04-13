/**
 * AI 运维面板头部组件
 *
 * 显示面板头部，包括：
 * - 连接状态指示
 * - 用户余额显示
 * - 广告开关（VIP/SVIP）
 * - 关闭按钮（游客不可关闭）
 */

import React from 'react';
import { X, Zap, BellOff, Bell, History, Plus } from 'lucide-react';
import { User } from '@/utils/types';
import { useT } from '../i18n';
import type { AIConnectionStatus } from '@/features/terminal/hooks/useSharedAIConnection';
import termcatPureIcon from '../../../../../assets/termcat_pure.png';

export interface AIOpsHeaderProps {
  isConnected: boolean;
  connectionStatus?: AIConnectionStatus;
  user: User | null;
  onClose: () => void;
  /** 是否可以关闭广告 */
  canDisableAd?: boolean;
  /** 广告当前是否开启 */
  adEnabled?: boolean;
  /** 切换广告开关 */
  onToggleAd?: () => void;
  /** 游客不能关闭面板 */
  guestCannotClose?: boolean;
  /** 点击会话记录 */
  onShowHistory?: () => void;
  /** 新建会话 */
  onNewConversation?: () => void;
  /** Code 模式：是否有活跃的持久会话 */
  hasCodeSession?: boolean;
  /** Code 模式：断开持久会话 */
  onDisconnectCodeSession?: () => void;
}

export const AIOpsHeader: React.FC<AIOpsHeaderProps> = ({
  isConnected,
  connectionStatus = 'idle',
  user,
  onClose,
  canDisableAd = false,
  adEnabled = true,
  onToggleAd,
  guestCannotClose = false,
  onShowHistory,
  onNewConversation,
  hasCodeSession = false,
  onDisconnectCodeSession,
}) => {
  const t = useT();

  const statusConfig = {
    idle: { color: 'bg-slate-400', label: t.connectionIdle, animate: false },
    connecting: { color: 'bg-amber-500', label: t.connectionConnecting, animate: true },
    connected: { color: 'bg-emerald-500', label: t.connectionConnected, animate: false },
    disconnected: { color: 'bg-rose-500', label: t.connectionDisconnected, animate: false },
  };
  const status = statusConfig[connectionStatus];

  return (
    <div
      className="h-10 flex items-center justify-between px-4 border-b shrink-0 bg-black/10"
      style={{ borderColor: 'var(--border-color)' }}
      data-testid="ai-ops-header"
    >
      {/* 左侧：标题 */}
      <div className="flex items-center gap-0">
        <div className="w-8 h-8 relative" style={{ marginTop: '3px' }}>
          <img src={termcatPureIcon} alt="TermCat" className="w-full h-full" />
          <div className="absolute inset-0 mix-blend-multiply" style={{ backgroundColor: 'var(--text-main)', opacity: 0.15 }} />
        </div>
        <span className="text-xs font-bold text-slate-300">{t.panelTitle}</span>
      </div>

      {/* 右侧：连接状态 + 广告开关 + 用户余额 + 关闭按钮 */}
      <div className="flex items-center gap-3">
        {/* 连接状态 + Code 模式断开按钮 */}
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${status.color} ${status.animate ? 'animate-pulse' : ''}`} />
          <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{status.label}</span>
          {hasCodeSession && onDisconnectCodeSession && (
            <button
              onClick={onDisconnectCodeSession}
              className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20 transition-colors"
            >
              {t.disconnectSession || '断开'}
            </button>
          )}
        </div>

        {/* 新建会话（仅登录用户可见） */}
        {user && onNewConversation && (
          <button
            onClick={onNewConversation}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-slate-300"
            title={t.newConversation}
            data-testid="ai-ops-new-chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 会话记录（仅登录用户可见） */}
        {user && onShowHistory && (
          <button
            onClick={onShowHistory}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-slate-300"
            title={t.chatHistory}
            data-testid="ai-ops-history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 广告开关（仅 VIP/SVIP 可见） */}
        {canDisableAd && onToggleAd && (
          <button
            onClick={onToggleAd}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-slate-300"
            title={adEnabled ? t.hideAd : t.showAd}
          >
            {adEnabled ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* 用户余额 */}
        {user && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[9px] font-black text-amber-500">{user.gems}</span>
          </div>
        )}

        {/* 关闭按钮（游客不可关闭） */}
        {!guestCannotClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-rose-500/10 rounded-lg transition-colors text-slate-500 hover:text-rose-500"
            data-testid="ai-ops-close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
