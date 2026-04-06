/**
 * AI Ops Panel (Plugin version)
 *
 * Based on msg-viewer common controls + toMsgBlocks adapter.
 * Business logic reuses useAIAgent hook, UI uses MsgViewer for display.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { User, AIOperationStep, AIModeInfo } from '@/utils/types';
import type { AIOpsMessage } from '@/features/terminal/types';
import type { ConversationMeta } from '@/core/chat/types';
import type { MsgViewerActions, PasswordState, MsgBlock } from '@/shared-components/msg-viewer/types';
import { MsgViewer } from '@/shared-components/msg-viewer';
import { useAIAgent } from '@/features/terminal/hooks/useAIAgent';
import { useAIService } from '@/features/shared/contexts/AIServiceContext';
import { useExtraModes, useExtraModels } from '@/features/terminal/hooks/useBuiltinPlugins';
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
import { PurchaseDialog } from './components/PurchaseDialog';
import { DeviceActivationDialog } from './components/DeviceActivationDialog';
import { ConversationList } from './components/ConversationList';
import { builtinPluginManager } from '../builtin-plugin-manager';
import { AI_OPS_EVENTS } from '../events';
import { licenseService } from '@/core/license/licenseService';

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
  const { availableModeInfos: serverModes } = useAIService();
  const pluginModes = useExtraModes();
  const pluginModels = useExtraModels();

  // Merge server + plugin modes and models, inject license locked status
  const [licenseVersion, setLicenseVersion] = useState(0);
  const mergedModes = useMemo<AIModeInfo[]>(() => {
    void licenseVersion; // trigger re-compute on license change
    const allModes = [...(serverModes || []), ...pluginModes];
    return allModes.map(mode => {
      const licenseFeature = mode.pluginData?.licenseFeature;
      if (licenseFeature) {
        return {
          ...mode,
          locked: !licenseService.isFeatureUnlocked(licenseFeature),
          price: mode.pluginData?.licensePrice,
        };
      }
      return mode;
    });
  }, [serverModes, pluginModes, licenseVersion]);

  const mergedModels = useMemo(() => {
    const all = [...(externalModels || []), ...pluginModels];
    // Deduplicate by model id (server models take priority)
    const seen = new Set<string>();
    return all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
  }, [externalModels, pluginModels]);

  // ── License Dialog State ──
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [showDeviceActivation, setShowDeviceActivation] = useState(false);
  const [deviceActivationData, setDeviceActivationData] = useState<any>(null);

  // Listen for license changes to refresh merged modes
  useEffect(() => {
    const unsubscribe = licenseService.onChange(() => {
      setLicenseVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  // Listen for new device detection
  useEffect(() => {
    const unsubscribe = licenseService.on('new-device-detected', (cache) => {
      setDeviceActivationData(cache);
      setShowDeviceActivation(true);
    });
    return unsubscribe;
  }, []);

  // Handler for purchase
  const handlePurchaseClick = useCallback(() => {
    setShowPurchaseDialog(false);
    // Read product/price from the first locked mode's pluginData (declared by plugin)
    const lockedMode = mergedModes.find(m => m.locked && m.pluginData?.licenseProduct);
    builtinPluginManager.emit(AI_OPS_EVENTS.OPEN_PAYMENT, {
      type: lockedMode?.pluginData?.licenseProduct || 'agent_pack',
      amount: lockedMode?.pluginData?.licensePrice || 69,
    });
  }, [mergedModes]);

  // Handler for device activation
  const handleActivateDevice = useCallback(async () => {
    try {
      await licenseService.activateDevice();
      setShowDeviceActivation(false);
    } catch (e) {
      console.error('Activation failed:', e);
    }
  }, []);

  // ── Local UI State ──
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // ── 会话记录 ──
  const [showHistoryList, setShowHistoryList] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Ad Management ──
  const adManager = useAdManager({
    user,
    messages: [],
    isPanelVisible: isVisible,
    sessionId,
  });

  // Track current mode to pass modeInfo to useAIAgent
  // Initialize from localStorage to match useAIAgent's initial mode (avoids flash)
  const [currentMode, setCurrentMode] = useState<string>(() => {
    return localStorage.getItem('termcat_ai_mode') || 'ask';
  });
  const currentModeInfo = useMemo(() =>
    mergedModes.find(m => m.id === currentMode),
    [mergedModes, currentMode]
  );

  // ── Core AI Hook ──
  const ai = useAIAgent({
    token: user?.token,
    userId: user?.id,
    sessionId,
    hostId,
    hostName,
    language,
    initialModels: mergedModels,
    onGemsUpdated,
    connectionType,
    terminalId,
    modeInfo: currentModeInfo,
    translateProviderError: useCallback((code: string, paramsJson?: string) => {
      // Read error translations from plugin's pluginData (shipped by external plugin, not hardcoded here)
      const translations = currentModeInfo?.pluginData?.errorTranslations as Record<string, Record<string, string>> | undefined;
      const langMap = translations?.[language] ?? translations?.['zh'];
      const template = langMap?.[code];
      if (!template) return null;
      if (!paramsJson) return template;
      try {
        const params = JSON.parse(paramsJson) as Record<string, string>;
        return template.replace(/\{(\w+)\}/g, (_: string, key: string) => params[key] ?? key);
      } catch { return template; }
    }, [currentModeInfo, language]),
  });

  // Sync mode from ai hook to local state (for modeInfo lookup)
  useEffect(() => {
    setCurrentMode(ai.mode);
  }, [ai.mode]);

  // Filter models by current mode's allowedModels
  const filteredModels = useMemo(() => {
    if (currentModeInfo?.allowedModels && currentModeInfo.allowedModels.length > 0) {
      const allowed = new Set(currentModeInfo.allowedModels);
      const filtered = mergedModels.filter(m => allowed.has(m.id));
      if (filtered.length > 0) return filtered;
    }
    // Fallback: no allowedModels or no matches — show all models from same source
    if (currentModeInfo?.source === 'plugin') {
      return pluginModels.length > 0 ? pluginModels : mergedModels;
    }
    return (externalModels || []).length > 0 ? (externalModels || []) : mergedModels;
  }, [currentModeInfo, mergedModels, pluginModels, externalModels]);

  // Auto-switch model when mode changes and current model is not in filtered list
  useEffect(() => {
    if (filteredModels.length > 0 && !filteredModels.some(m => m.id === ai.selectedModel)) {
      ai.setSelectedModel(filteredModels[0].id);
    }
  }, [ai.mode, filteredModels]);

  // Auto-fallback: if current mode no longer exists in available modes, switch to default.
  // Key: wait for BOTH server modes AND plugin modes to be ready before deciding.
  // pluginModesReady = true once plugin modes have been registered at least once this session.
  const [pluginModesReady, setPluginModesReady] = useState(false);
  useEffect(() => {
    if (pluginModes.length > 0) setPluginModesReady(true);
  }, [pluginModes.length]);

  useEffect(() => {
    // Don't fallback until all mode sources are ready
    if (mergedModes.length === 0) return;
    if (mergedModes.some(m => m.id === ai.mode)) return;
    // If mode looks like a plugin mode but plugins haven't loaded yet, wait
    if (!pluginModesReady) return;
    // Mode is truly gone — fallback
    ai.setMode(mergedModes[0].id);
  }, [mergedModes, ai.mode, pluginModesReady]);

  // ── MsgViewer Adapter ──

  const blocks = useMemo<MsgBlock[]>(
    () => toMsgBlocks(ai.messages, adManager.adMessages, adManager.shouldShowAd, language),
    [ai.messages, adManager.adMessages, adManager.shouldShowAd, language],
  );

  const passwordState = useMemo<PasswordState>(() => ({
    value: ai.passwordInput || '',
    skipPrompt: ai.skipPasswordPrompt || false,
    showInput: ai.showPasswordInput || false,
  }), [ai.passwordInput, ai.skipPasswordPrompt, ai.showPasswordInput]);

  /** Map AI status → MsgViewer loadingStatus */
  const loadingStatus = useMemo<'thinking' | 'generating' | 'waiting_user'>(() => {
    if (ai.aiStatus === 'generating') return 'generating';
    if (ai.aiStatus === 'waiting_user') return 'waiting_user';
    return 'thinking';
  }, [ai.aiStatus]);

  // ── MsgViewerActions ──

  const actions = useMemo<MsgViewerActions>(() => ({
    onExecuteCommand: onExecute,

    onStepConfirm: (blockId, stepIndex, command, risk, needsConfirmation) => {
      // Check if it's a tool_use bash command (needs permission approval)
      const permissionId = findPermissionId(ai.messages, blockId);
      if (permissionId) {
        ai.approveToolPermission(permissionId);
        return;
      }
      // Regular step confirm
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
      // Find the message corresponding to this step, determine current status
      const targetMsg = ai.messages.find(
        msg => msg.id === blockId.replace(/_step$/, '') || msg.id === blockId.replace(/_tool$/, '')
      );
      const isExecuting = targetMsg?.taskState?.status === 'executing';

      if (isExecuting) {
        // Command is executing → send Ctrl+C to interrupt (same effect as terminal Ctrl+C)
        const info = resolveTaskInfo(ai.messages, blockId);
        if (info) {
          ai.cancelExecute(info.taskId, info.stepIndex);
        }
        return;
      }

      // Not executed (waiting for confirmation) → deny permission or cancel
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
    onToolApproveAlways: (permissionId) => ai.approveToolPermission(permissionId, true),
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
      // Find the corresponding adMessage
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

  // Fallback scroll when loading ends: last message height may change ("Copy Reply" button, points count, etc. appear),
  // followOutput doesn't track existing item height changes, need to scroll once more after delay.
  // Scroll when loading starts is handled internally by MsgViewer.
  const prevIsLoadingRef = useRef(false);
  useEffect(() => {
    if (prevIsLoadingRef.current && !ai.isLoading && ai.autoScroll) {
      // Fallback: markdown rendering may need extra time, scroll once more after 150ms
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

  // ── Event Handling ──

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

  // ── Render ──

  if (!isVisible) return null;

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: 'var(--bg-sidebar)' }}>
      {/* Header */}
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
        hasCodeSession={ai.hasCodeSession}
        onDisconnectCodeSession={ai.disconnectCodeSession}
      />

      {/* Message List — Uses MsgViewer */}
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

      {/* Agent Mode Suggestion */}
      {ai.showAgentSuggestion && ai.mode === 'ask' && !ai.isLoading && (
        <AgentSuggestion
          onSwitchToAgent={() => {
            ai.setMode('agent');
            ai.setShowAgentSuggestion(false);
          }}
        />
      )}

      {/* Interactive Confirmation Dialog */}
      {ai.waitingForInteraction && ai.interactionPrompt && (
        <InteractionDialog
          prompt={ai.interactionPrompt}
          onConfirm={() => ai.sendInteractiveResponse('y')}
          onCancel={() => ai.sendInteractiveResponse('n')}
        />
      )}

      {/* Guest Warning */}
      {showGuestWarning && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-in fade-in duration-200">
          {t.guestAiDisabled}
        </div>
      )}

      {/* Input Area */}
      <AIOpsInput
        input={input}
        isLoading={ai.isLoading}
        mode={ai.mode}
        selectedModel={ai.selectedModel}
        availableModels={filteredModels}
        attachedFiles={ai.attachedFiles}
        isComposing={isComposing}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={handleStopTask}
        onFileChange={ai.handleFileChange}
        onRemoveAttachment={ai.removeAttachment}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onModeChange={(m: string) => { setCurrentMode(m); ai.setMode(m as any); }}
        onModelChange={ai.setSelectedModel}
        sshMode={ai.sshMode}
        onSshModeChange={ai.setSshMode}
        availableModeInfos={mergedModes}
        guestDisabled={adManager.guestCannotUseAI}
        onPurchase={() => setShowPurchaseDialog(true)}
      />

      {/* Insufficient Gems Modal */}
      {ai.showInsufficientGems && (
        <InsufficientGemsModal
          isOpen={ai.showInsufficientGems}
          onClose={() => ai.setShowInsufficientGems(false)}
          onRecharge={() => builtinPluginManager.emit(AI_OPS_EVENTS.OPEN_MEMBERSHIP, null)}
          mode={ai.mode === 'code' || ai.mode === 'x-agent' ? 'agent' : ai.mode}
        />
      )}

      {/* Conversation History List */}
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

      {/* Purchase Dialog */}
      <PurchaseDialog
        open={showPurchaseDialog}
        onClose={() => setShowPurchaseDialog(false)}
        onPurchaseClick={handlePurchaseClick}
        onActivateDevice={async () => {
          await licenseService.activateDevice();
          setShowPurchaseDialog(false);
        }}
      />

      {/* Device Activation Dialog */}
      <DeviceActivationDialog
        open={showDeviceActivation}
        onClose={() => setShowDeviceActivation(false)}
        onActivate={handleActivateDevice}
        machinesUsed={deviceActivationData?.machinesUsed || 0}
        machinesMax={deviceActivationData?.machinesMax || 3}
      />
    </div>
  );
};
