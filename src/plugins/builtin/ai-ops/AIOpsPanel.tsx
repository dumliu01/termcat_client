/**
 * AI 运维面板（插件版）
 *
 * 基于 msg-viewer 通用控件 + toMsgBlocks 适配器。
 * 业务逻辑复用 useAIAgent hook，UI 使用 MsgViewer 展示。
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { User, AIOperationStep } from '@/utils/types';
import type { AIOpsMessage } from '@/features/terminal/types';
import type { ConversationMeta } from '@/core/chat/types';
import type { MsgViewerActions, PasswordState, MsgBlock } from '@/shared-components/msg-viewer/types';
import { MsgViewer } from '@/shared-components/msg-viewer';
import { useAIAgent } from '@/features/terminal/hooks/useAIAgent';
import { chatHistoryClientService } from '@/core/chat/chatHistoryService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useI18n } from '@/base/i18n/I18nContext';
import { useT } from './i18n';
import type { AIModelInfo } from '@/utils/types';

import { toMsgBlocks, findPermissionId, resolveTaskInfo } from './adapter/toMsgBlocks';
import { useAdManager } from './hooks/useAdManager';
import { AIOpsHeader } from './components/AIOpsHeader';
import { AIOpsInput } from './components/AIOpsInput';
import { AgentSuggestion } from './components/AgentSuggestion';
import { InteractionDialog } from './components/InteractionDialog';
import { InsufficientGemsModal } from './components/InsufficientGemsModal';
import { ConversationList } from './components/ConversationList';
import { builtinPluginManager } from '../builtin-plugin-manager';
import { AI_OPS_EVENTS } from '../events';

export interface AIOpsPluginPanelProps {
  user: User | null;
  sessionId?: string;
  hostId?: string;
  hostName?: string;
  isVisible: boolean;
  onClose: () => void;
  onExecute: (cmd: string) => void;
  availableModels?: AIModelInfo[];
  availableModes?: string[];
  onGemsUpdated?: (newBalance: number) => void;
  connectionType?: 'ssh' | 'local';
  terminalId?: string;
}

export const AIOpsPluginPanel: React.FC<AIOpsPluginPanelProps> = ({
  user,
  sessionId,
  hostId,
  hostName,
  isVisible,
  onClose,
  onExecute,
  availableModels: externalModels,
  availableModes: externalModes,
  onGemsUpdated,
  connectionType,
  terminalId,
}) => {
  const t = useT();
  const { language } = useI18n();

  // ── 本地 UI 状态 ──
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // ── 会话记录 ──
  const [showHistoryList, setShowHistoryList] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── 广告管理 ──
  const adManager = useAdManager({
    user,
    messages: [],
    isPanelVisible: isVisible,
    sessionId,
  });

  // ── 核心 AI hook ──
  const ai = useAIAgent({
    token: user?.token,
    userId: user?.id,
    sessionId,
    hostId,
    hostName,
    language,
    initialModels: externalModels,
    onGemsUpdated,
    connectionType,
    terminalId,
  });

  // ── MsgViewer 适配 ──

  const blocks = useMemo<MsgBlock[]>(
    () => toMsgBlocks(ai.messages, adManager.adMessages, adManager.shouldShowAd, language),
    [ai.messages, adManager.adMessages, adManager.shouldShowAd, language],
  );

  const passwordState = useMemo<PasswordState>(() => ({
    value: ai.passwordInput || '',
    skipPrompt: ai.skipPasswordPrompt || false,
    showInput: ai.showPasswordInput || false,
  }), [ai.passwordInput, ai.skipPasswordPrompt, ai.showPasswordInput]);

  /** 映射 AI status → MsgViewer loadingStatus */
  const loadingStatus = useMemo<'thinking' | 'generating' | 'waiting_user'>(() => {
    if (ai.aiStatus === 'generating') return 'generating';
    if (ai.aiStatus === 'waiting_user') return 'waiting_user';
    return 'thinking';
  }, [ai.aiStatus]);

  // ── MsgViewerActions ──

  const actions = useMemo<MsgViewerActions>(() => ({
    onExecuteCommand: onExecute,

    onStepConfirm: (blockId, stepIndex, command, risk, needsConfirmation) => {
      // 检查是否是 tool_use bash 命令（需要批准权限）
      const permissionId = findPermissionId(ai.messages, blockId);
      if (permissionId) {
        ai.approveToolPermission(permissionId);
        return;
      }
      // 常规 step confirm
      const info = resolveTaskInfo(ai.messages, blockId);
      if (info) {
        const step: AIOperationStep & { needsConfirmation?: boolean } = {
          index: stepIndex,
          description: '',
          command,
          risk,
          needsConfirmation,
        };
        ai.confirmExecute(step);
      }
    },

    onStepCancel: (blockId, stepIndex) => {
      // 查找该步骤对应的消息，判断当前状态
      const targetMsg = ai.messages.find(
        msg => msg.id === blockId.replace(/_step$/, '') || msg.id === blockId.replace(/_tool$/, '')
      );
      const isExecuting = targetMsg?.taskState?.status === 'executing';

      if (isExecuting) {
        // 命令正在执行中 → 发送 Ctrl+C 中断（和终端 Ctrl+C 效果一致）
        const info = resolveTaskInfo(ai.messages, blockId);
        if (info) {
          ai.cancelExecute(info.taskId, info.stepIndex);
        }
        return;
      }

      // 未执行（等待确认阶段）→ deny permission 或 cancel
      const permissionId = findPermissionId(ai.messages, blockId);
      if (permissionId) {
        ai.denyToolPermission(permissionId, t.userDenied);
        return;
      }
      const info = resolveTaskInfo(ai.messages, blockId);
      if (info) {
        ai.cancelExecute(info.taskId, info.stepIndex);
      }
    },

    onPasswordSubmit: () => ai.submitPassword(),
    onPasswordChange: (value) => ai.setPassword(value),
    onPasswordSkipChange: (skip) => ai.setSkipPasswordPrompt(skip),

    onToolApprove: (permissionId) => ai.approveToolPermission(permissionId),
    onToolDeny: (permissionId, reason) => ai.denyToolPermission(permissionId, reason),

    onChoiceSubmit: (blockId, choice, customInput) => {
      const info = resolveTaskInfo(ai.messages, blockId);
      if (info) {
        ai.submitUserChoice(info.taskId, info.stepIndex, choice, customInput);
      }
    },

    onChoiceCancel: (blockId) => {
      const info = resolveTaskInfo(ai.messages, blockId);
      if (info) {
        ai.cancelUserChoice(info.taskId, info.stepIndex);
      }
    },

    onFeedbackAccept: () => ai.acceptFeedback(),
    onFeedbackContinue: (message) => ai.continueFeedback(message),

    onAdAction: (blockId) => {
      // 查找对应的 adMessage
      const adMsg = adManager.adMessages.find(a => a.id === blockId);
      if (adMsg) {
        import('@/core/ad/adService').then(({ adService }) => {
          adService.reportClick(adMsg.content.adId, adMsg.platform);
        });
        if (adMsg.content.actionType === 'url' && adMsg.content.actionUrl) {
          window.open(adMsg.content.actionUrl, '_blank');
        }
      }
    },

    onCopyReply: (startIndex, endIndex) => {
      const slice = blocks.slice(startIndex, endIndex + 1);
      let content = '';
      for (const block of slice) {
        if (block.type === 'assistant_text') content += block.content + '\n\n';
        if (block.type === 'command_suggestion') {
          content += `**${t.commandSuggestionLabel}**\n\`\`\`bash\n` + block.command + '\n```\n\n';
          if (block.explanation) content += `**${t.explanationLabel}** ` + block.explanation + '\n\n';
        }
        if (block.type === 'step_detail' && block.output) {
          content += t.executionOutputLabel + '\n' + block.output + '\n\n';
        }
      }
      navigator.clipboard.writeText(content.trim());
    },
  }), [ai, blocks, language, onExecute, adManager.adMessages]);

  const handleAutoScrollChange = useCallback((atBottom: boolean) => {
    ai.setAutoScroll(atBottom);
  }, [ai]);

  // Loading 结束时兜底滚动：最后一条消息高度变化（"复制回复"按钮、积分统计等出现），
  // followOutput 不追踪已有 item 的高度变化，需要延迟再滚一次。
  // Loading 开始时的滚动已由 MsgViewer 内部处理。
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    if (prevIsLoadingRef.current && !ai.isLoading && ai.autoScroll) {
      // 兜底：markdown 渲染可能需要额外时间，150ms 后再滚一次
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: 'smooth' });
      }, 150);
      prevIsLoadingRef.current = ai.isLoading;
      return () => clearTimeout(timer);
    }
    prevIsLoadingRef.current = ai.isLoading;
  }, [ai.isLoading, ai.autoScroll]);

  // ── 会话记录 ──

  const handleShowHistory = useCallback(async () => {
    if (!user?.id) return;
    setShowHistoryList(true);
    setHistoryLoading(true);
    try {
      const list = await chatHistoryClientService.list(user.id);
      setConversations(list);
    } catch {
      setConversations([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id]);

  const handleSelectConversation = useCallback(async (meta: ConversationMeta) => {
    if (!user?.id) return;
    try {
      const data = await chatHistoryClientService.load(user.id, meta.fileName);
      if (data) {
        ai.loadConversation(data);
        setShowHistoryList(false);
      }
    } catch (err) {
      logger.error(LOG_MODULE.AI, 'chat_history.load_failed', 'Failed to load conversation', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [user?.id, ai]);

  const handleDeleteConversation = useCallback(async (meta: ConversationMeta) => {
    if (!user?.id) return;
    await chatHistoryClientService.delete(user.id, meta.fileName);
    setConversations(prev => prev.filter(c => c.convId !== meta.convId));
  }, [user?.id]);

  const handleNewConversation = useCallback(() => {
    ai.newConversation();
  }, [ai]);

  // ── 事件处理 ──

  const handleSend = useCallback(() => {
    if (!input.trim() || ai.isLoading) return;

    if (!user) {
      setShowGuestWarning(true);
      setTimeout(() => setShowGuestWarning(false), 3000);
      return;
    }

    const userBalance = user?.gems ?? 0;
    const requiredGems = ai.mode === 'agent' ? 2 : 1;
    if (userBalance < requiredGems) {
      ai.setShowInsufficientGems(true);
      return;
    }

    ai.sendMessage(input);
    setInput('');
  }, [input, ai, user]);

  const handleStopTask = useCallback(() => {
    ai.stopTask();
  }, [ai]);

  // ── 渲染 ──

  if (!isVisible) return null;

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {/* 头部 */}
      <AIOpsHeader
        isConnected={ai.isConnected}
        connectionStatus={ai.connectionStatus}
        user={user}
        onClose={onClose}
        canDisableAd={adManager.canDisableAd}
        adEnabled={adManager.adEnabled}
        onToggleAd={adManager.toggleAd}
        guestCannotClose={adManager.guestCannotClose}
        onShowHistory={handleShowHistory}
        onNewConversation={handleNewConversation}
      />

      {/* 消息列表 — 使用 MsgViewer */}
      <MsgViewer
        blocks={blocks}
        actions={actions}
        language={language as 'zh' | 'en'}
        isLoading={ai.isLoading}
        loadingStatus={loadingStatus}
        passwordState={passwordState}
        autoScroll={ai.autoScroll}
        onAutoScrollChange={handleAutoScrollChange}
        virtuosoRef={virtuosoRef}
      />

      {/* Agent 模式建议 */}
      {ai.showAgentSuggestion && ai.mode === 'ask' && !ai.isLoading && (
        <AgentSuggestion
          onSwitchToAgent={() => {
            ai.setMode('agent');
            ai.setShowAgentSuggestion(false);
          }}
        />
      )}

      {/* 交互式确认对话框 */}
      {ai.waitingForInteraction && ai.interactionPrompt && (
        <InteractionDialog
          prompt={ai.interactionPrompt}
          onConfirm={() => ai.sendInteractiveResponse('y')}
          onCancel={() => ai.sendInteractiveResponse('n')}
        />
      )}

      {/* 游客提示 */}
      {showGuestWarning && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-in fade-in duration-200">
          {t.guestAiDisabled}
        </div>
      )}

      {/* 输入区域 */}
      <AIOpsInput
        input={input}
        isLoading={ai.isLoading}
        mode={ai.mode}
        selectedModel={ai.selectedModel}
        availableModels={ai.availableModels}
        attachedFiles={ai.attachedFiles}
        isComposing={isComposing}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={handleStopTask}
        onFileChange={ai.handleFileChange}
        onRemoveAttachment={ai.removeAttachment}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onModeChange={ai.setMode}
        onModelChange={ai.setSelectedModel}
        sshMode={ai.sshMode}
        onSshModeChange={ai.setSshMode}
        availableModes={externalModes}
        guestDisabled={adManager.guestCannotUseAI}
      />

      {/* 积分不足弹窗 */}
      {ai.showInsufficientGems && (
        <InsufficientGemsModal
          isOpen={ai.showInsufficientGems}
          onClose={() => ai.setShowInsufficientGems(false)}
          onRecharge={() => builtinPluginManager.emit(AI_OPS_EVENTS.OPEN_MEMBERSHIP, null)}
          mode={ai.mode === 'code' ? 'agent' : ai.mode}
        />
      )}

      {/* 会话记录列表 */}
      {showHistoryList && (
        <ConversationList
          conversations={conversations}
          currentConvId={ai.convId}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onBack={() => setShowHistoryList(false)}
          onNewConversation={handleNewConversation}
          loading={historyLoading}
        />
      )}
    </div>
  );
};
