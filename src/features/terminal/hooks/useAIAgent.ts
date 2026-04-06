/**
 * useAIAgent — AIAgent 模块的 React 适配层
 *
 * 将独立的 AIAgent 事件驱动架构映射为 React state，
 * 替代原有的 8+ 个 hooks（useAIMessageHandler, useShellSession,
 * useCommandExecution, useAIOpsState, useTaskManagement, useInteractivePrompt,
 * usePasswordHandler, useAIOpsMessages）。
 *
 * UI 组件（AIOpsMessages, AIOpsInput 等）保持不变，只改数据来源。
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  AIAgent,
  AIAgentConnection,
  ElectronShellExecutor,
  LocalShellExecutor,
  AIAgentConfig,
  AIAgentStatus,
  AIAgentMode,
  OperationStep,
  ChoiceData,
  TokenUsage,
  StepDetailEvent,
  CommandResult,
  AICmdSuggestion,
  RiskLevel,
  SshMode,
  AttachedFile as AgentAttachedFile,
} from '@/core/ai-agent';
import { AIOpsMessage } from '../types';
import { AIOperationStep, AIModelType, AIModelInfo, AIModeInfo } from '@/utils/types';
import { AttachedFile } from '../types';
import { ConversationData } from '@/core/chat/types';
import { generateMessageId } from '../utils';
import { serializeMsg } from '@/core/chat/utils';
import { chatHistoryClientService } from '@/core/chat/chatHistoryService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
// useAIService no longer needed here - modeInfo is passed via options

// ==================== 配置类型 ====================

export interface UseAIAgentOptions {
  /** Translate provider error code to localized message. Returns translated string or null. */
  translateProviderError?: (code: string, params?: string) => string | null;
  /** 认证 token（用于创建任务级 WebSocket 连接） */
  token?: string;
  /** WebSocket URL（可选，默认从环境变量读取） */
  wsUrl?: string;
  /** 用户 ID（用于会话记录持久化） */
  userId?: string;
  /** SSH 会话 ID */
  sessionId?: string;
  /** 主机 ID */
  hostId?: string;
  /** 主机名称（用于会话记录展示） */
  hostName?: string;
  /** UI 语言 */
  language?: string;
  /** 外部传入的可用模型列表（从 App 层获取，避免每个面板重复请求） */
  initialModels?: AIModelInfo[];
  /** 积分余额更新回调（服务端在 COMPLETE 消息中返回最新余额） */
  onGemsUpdated?: (newBalance: number) => void;
  /** 连接类型：ssh 或 local */
  connectionType?: 'ssh' | 'local';
  /** 本地终端的 PTY ID（关联模式用，用于复用用户终端） */
  terminalId?: string;
  /** 当前模式的元信息（用于判断连接参数，plugin 模式使用 pluginData.wsUrl） */
  modeInfo?: AIModeInfo;
}

// ==================== 返回类型 ====================

export interface UseAIAgentReturn {
  // === 连接状态 ===
  isConnected: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected';

  // === AI 状态 ===
  aiStatus: AIAgentStatus;
  isLoading: boolean;

  // === 消息列表 ===
  messages: AIOpsMessage[];

  // === 模式与配置 ===
  mode: string;
  sshMode: SshMode;
  selectedModel: AIModelType;
  availableModels: AIModelInfo[];
  setMode: (mode: string) => void;
  setSshMode: (mode: SshMode) => void;
  setSelectedModel: (model: AIModelType) => void;

  // === 交互式提示 ===
  waitingForInteraction: boolean;
  interactionPrompt: string;
  sendInteractiveResponse: (response: string) => void;

  // === 密码 ===
  showPasswordInput: boolean;
  passwordInput: string;
  skipPasswordPrompt: boolean;
  currentSessionPassword: string;
  pendingPasswordCommand: { command: string; stepIndex: number; taskId: string } | null;
  setPassword: (value: string) => void;
  setSkipPasswordPrompt: (value: boolean) => void;

  // === 文件附件（透传，不经过 agent） ===
  attachedFiles: AttachedFile[];
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;

  // === UI 状态 ===
  autoScroll: boolean;
  setAutoScroll: (value: boolean) => void;
  showInsufficientGems: boolean;
  setShowInsufficientGems: (value: boolean) => void;
  showAgentSuggestion: boolean;
  setShowAgentSuggestion: (value: boolean) => void;

  // === 会话记录 ===
  convId: string | null;
  convTitle: string;
  newConversation: () => void;
  loadConversation: (data: ConversationData) => void;

  // === 操作 ===
  sendMessage: (input: string) => void;
  stopTask: () => void;
  confirmExecute: (step: AIOperationStep & { needsConfirmation?: boolean }) => void;
  cancelExecute: (taskId: string, stepIndex: number) => void;
  submitPassword: () => void;
  submitUserChoice: (taskId: string, stepIndex: number, choice: string, customInput?: string) => void;
  cancelUserChoice: (taskId: string, stepIndex: number) => void;
  resetSuggestions: () => void;

  // === 工具权限和用户反馈（Code 模式） ===
  approveToolPermission: (permissionId: string, permanent?: boolean) => void;
  denyToolPermission: (permissionId: string, reason?: string) => void;
  acceptFeedback: () => void;
  continueFeedback: (message: string) => void;
  /** Code 模式：是否有活跃的持久会话 */
  hasCodeSession: boolean;
  /** Code 模式：手动断开持久会话 */
  disconnectCodeSession: () => void;

  // === Agent 实例（高级用途） ===
  agent: AIAgent | null;
}

// ==================== Hook 实现 ====================

export function useAIAgent(options: UseAIAgentOptions): UseAIAgentReturn {
  const { token, wsUrl, userId, sessionId, hostId, hostName, language, initialModels, onGemsUpdated, connectionType, terminalId, modeInfo, translateProviderError } = options;
  const onGemsUpdatedRef = useRef(onGemsUpdated);
  onGemsUpdatedRef.current = onGemsUpdated;
  const translateProviderErrorRef = useRef(translateProviderError);
  translateProviderErrorRef.current = translateProviderError;

  // ==================== 核心实例 refs ====================
  const agentRef = useRef<AIAgent | null>(null);
  const executorRef = useRef<ElectronShellExecutor | LocalShellExecutor | null>(null);
  // 任务级 WebSocket 连接
  const taskConnectionRef = useRef<AIAgentConnection | null>(null);
  // 流式 chunk rAF 缓冲（任务级，随连接一起清理）
  const taskChunkBufferRef = useRef<{ text: string; isComplete: boolean; rafId: any }>({ text: '', isComplete: false, rafId: 0 });

  // ==================== AI 状态 ====================
  const [aiStatus, setAIStatus] = useState<AIAgentStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);

  // ==================== 消息列表 ====================
  const [messages, setMessages] = useState<AIOpsMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ==================== 模式与配置 ====================
  const STORAGE_KEY_MODE = 'termcat_ai_mode';
  const STORAGE_KEY_MODEL = 'termcat_ai_model';
  const [mode, _setMode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_MODE) || 'ask';
  });
  const modeRef = useRef(mode);
  const modeInfoRef = useRef(modeInfo);
  modeInfoRef.current = modeInfo;
  const setMode = useCallback((m: string) => {
    const prev = modeRef.current;
    _setMode(m);
    modeRef.current = m;
    localStorage.setItem(STORAGE_KEY_MODE, m);
    // Close existing WS connection on mode switch so next request creates a fresh one
    if (prev !== m) {
      codeFeedbackWaitingRef.current = false;
      setHasCodeSession(false);
      const conn = taskConnectionRef.current;
      if (conn) {
        conn.disconnect();
        taskConnectionRef.current = null;
      }
      agentRef.current?.destroy();
      agentRef.current = null;
      if (executorRef.current) {
        executorRef.current.cleanup().catch(() => {});
        executorRef.current = null;
      }
    }
  }, []);

  const STORAGE_KEY_SSH_MODE = 'termcat_ai_ssh_mode';
  const [sshMode, _setSshMode] = useState<SshMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SSH_MODE) as SshMode | null;
    return saved === 'associated' || saved === 'independent' ? saved : 'associated';
  });
  const setSshMode = useCallback((m: SshMode) => {
    _setSshMode(m);
    localStorage.setItem(STORAGE_KEY_SSH_MODE, m);
  }, []);

  const [selectedModel, _setSelectedModel] = useState<AIModelType>(() => {
    return (localStorage.getItem(STORAGE_KEY_MODEL) as AIModelType) || 'deepseek';
  });
  const setSelectedModel = useCallback((m: AIModelType) => {
    _setSelectedModel(m);
    localStorage.setItem(STORAGE_KEY_MODEL, m);
  }, []);
  const [availableModels, setAvailableModels] = useState<AIModelInfo[]>([]);

  // ==================== 交互式提示 ====================
  const [waitingForInteraction, setWaitingForInteraction] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState('');

  // ==================== 密码 ====================
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [skipPasswordPrompt, setSkipPasswordPrompt] = useState(false);
  const [currentSessionPassword, setCurrentSessionPassword] = useState('');
  const [pendingPasswordCommand, setPendingPasswordCommand] = useState<{
    command: string;
    stepIndex: number;
    taskId: string;
  } | null>(null);
  // Code 模式：等待密码输入后再批准工具权限
  const [pendingPermissionApproval, setPendingPermissionApproval] = useState<{
    permissionId: string;
  } | null>(null);

  // ==================== 文件附件 ====================
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // ==================== UI 状态 ====================
  const [autoScroll, setAutoScroll] = useState(true);
  const [showInsufficientGems, setShowInsufficientGems] = useState(false);
  const [showAgentSuggestion, setShowAgentSuggestion] = useState(false);

  // ==================== Plugin mode detection ====================
  const isPluginMode = modeInfo?.source === 'plugin';

  // ==================== 会话记录 ====================
  const [convId, setConvId] = useState<string | null>(null);
  const [convCreatedAt, setConvCreatedAt] = useState<number>(0);
  const [convTitle, setConvTitle] = useState<string>('');
  const [savedMsgCount, setSavedMsgCount] = useState(0);
  const convIdRef = useRef(convId);
  convIdRef.current = convId;
  const convCreatedAtRef = useRef(convCreatedAt);
  convCreatedAtRef.current = convCreatedAt;
  const savedMsgCountRef = useRef(savedMsgCount);
  savedMsgCountRef.current = savedMsgCount;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // ==================== 远程 OS 信息 ====================
  const osInfoRef = useRef<{ osType: string; osVersion: string; shell: string } | null>(null);

  // ==================== 内部记录 ====================
  // 当前正在执行的步骤索引（用于 UI 显示）
  const executingStepIndexRef = useRef<number | null>(null);
  // 防重复提交用户选择（记录已提交的 taskId_stepIndex）
  const submittedChoicesRef = useRef<Set<string>>(new Set());
  // 暂存 token 使用信息，等 task:complete 时再应用到最终消息
  const pendingTokenUsageRef = useRef<TokenUsage | null>(null);
  /** Code 模式：一轮结束后等待用户在主输入框继续提问（连接保持） */
  const codeFeedbackWaitingRef = useRef(false);
  /** Code 模式：是否有活跃的持久会话（用于 UI 显示"断开"按钮） */
  const [hasCodeSession, setHasCodeSession] = useState(false);
  const confirmExecuteRef = useRef<((step: AIOperationStep & { needsConfirmation?: boolean }) => void) | null>(null);

  // ==================== 获取远程 OS 信息 ====================
  useEffect(() => {
    if (!sessionId || typeof window === 'undefined' || !(window as any).electron) return;
    // 本地终端不需要 SSH OS info 检测
    if (connectionType === 'local') {
      // Renderer 进程中 process 不可用，通过 IPC 获取平台信息
      window.electron.getPlatform().then((platform: string) => {
        osInfoRef.current = {
          osType: platform === 'darwin' ? 'macos' : platform,
          osVersion: '',
          shell: platform === 'win32' ? 'powershell' : '/bin/zsh',
        };
      });
      return;
    }

    (window as any).electron.sshGetOSInfo(sessionId).then((info: any) => {
      if (info) {
        osInfoRef.current = {
          osType: info.osType,
          osVersion: info.osVersion,
          shell: info.shell,
        };
        // 同步到已存在的 Agent
        const agent = agentRef.current;
        if (agent) {
          agent.configure({
            osType: info.osType,
            osVersion: info.osVersion,
            shell: info.shell,
          });
        }
      }
    }).catch(() => {
      // OS 信息获取失败不影响功能
    });
  }, [sessionId]);

  // ==================== 同步外部传入的模型列表 ====================
  useEffect(() => {
    if (initialModels && initialModels.length > 0) {
      setAvailableModels(initialModels);
      _setSelectedModel(prev => {
        const modelIds = initialModels.map(m => m.id);
        const resolved = modelIds.includes(prev) ? prev : initialModels[0].id;
        localStorage.setItem(STORAGE_KEY_MODEL, resolved);
        return resolved;
      });
    }
  }, [initialModels]);

  // ==================== 关闭任务级连接 ====================
  const closeTaskConnection = useCallback(() => {
    const buf = taskChunkBufferRef.current;
    if (buf.rafId) cancelAnimationFrame(buf.rafId);
    buf.text = '';
    buf.isComplete = false;
    buf.rafId = 0;

    const agent = agentRef.current;
    if (agent) {
      agent.destroy();
      agentRef.current = null;
    }
    const conn = taskConnectionRef.current;
    if (conn) {
      conn.disconnect();
      taskConnectionRef.current = null;
    }
    if (executorRef.current) {
      executorRef.current.cleanup().catch(() => {});
      executorRef.current = null;
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      closeTaskConnection();
    };
  }, [closeTaskConnection]);

  // ==================== 为每个任务创建 Agent 并绑定事件 ====================
  const setupAgentForTask = useCallback((conn: AIAgentConnection): AIAgent => {
    const currentMode = modeRef.current;
    // Plugin modes declare agentMode in pluginData (e.g. local-code → 'code')
    const currentModeInfoSnap = modeInfoRef.current;
    const resolvedMode = currentModeInfoSnap?.pluginData?.agentMode || currentMode;
    const agentMode: AIAgentMode = resolvedMode === 'ask' ? 'normal' : resolvedMode as AIAgentMode;
    logger.info(LOG_MODULE.AI, 'ai.mode.resolved', 'Mode resolved for task', {
      ui_mode: currentMode,
      modeInfo_id: currentModeInfoSnap?.id,
      pluginData_agentMode: currentModeInfoSnap?.pluginData?.agentMode,
      resolved_mode: resolvedMode,
      agent_mode: agentMode,
    });
    const actualModel = selectedModel;
    const osInfo = osInfoRef.current;
    const agent = new AIAgent(conn, {
      mode: agentMode,
      model: actualModel,
      sessionId: sessionId || '',
      hostId,
      language,
      sshMode,
      osType: osInfo?.osType,
      osVersion: osInfo?.osVersion,
      shell: osInfo?.shell,
    });
    agentRef.current = agent;

    // 创建 Executor（仅 Electron 环境）
    if (sessionId && typeof window !== 'undefined' && (window as any).electron) {
      const executor = connectionType === 'local'
        ? new LocalShellExecutor({ sessionId, sshMode, existingPtyId: terminalId })
        : new ElectronShellExecutor({ sessionId, sshMode });
      executorRef.current = executor;
      agent.setExecutor(executor);

      // 监听 executor 的交互式提示事件
      executor.on('interactive:prompt', (prompt: string) => {
        setWaitingForInteraction(true);
        setInteractionPrompt(prompt);
        notify('TermCat - 交互确认', prompt || '远程服务器等待确认');
      });

      logger.debug(LOG_MODULE.AI, 'ai.executor.created', 'Executor created', {
        session_id: sessionId,
        executor_type: connectionType || 'ssh',
        ssh_mode: sshMode,
        shell_id: (executor as any).shellId || (executor as any).ptyId || 'unknown',
      });
    }

    // ==================== 桌面通知辅助 ====================
    const notify = (title: string, body: string) => {
      window.electron.showNotification({ title, body });
    };

    // ==================== 绑定 Agent 事件 ====================

    // 状态变更
    agent.on('status:change', (status: AIAgentStatus) => {
      setAIStatus(status);
      if (status === 'idle') {
        setIsLoading(false);
      }
    });

    // 流式回答 — 使用 rAF 缓冲合并高频 chunk，减少 setState 次数
    const chunkBuffer = taskChunkBufferRef.current;

    const flushChunkBuffer = () => {
      chunkBuffer.rafId = 0;
      const buffered = chunkBuffer.text;
      const complete = chunkBuffer.isComplete;
      chunkBuffer.text = '';
      chunkBuffer.isComplete = false;

      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];

        // 如果最后一条是 operation 类型，创建新消息
        if (lastMsg?.taskState?.taskType === 'operation') {
          return [...prev, {
            id: generateMessageId(),
            role: 'assistant' as const,
            content: buffered,
            taskState: {
              taskId: agent.getTaskId() || '',
              taskType: 'answer' as const,
              status: complete ? 'completed' : 'running',
              content: buffered,
            },
            timestamp: Date.now(),
          }];
        }

        // 合并到现有 answer 消息
        if (lastMsg?.role === 'assistant' && lastMsg.taskState?.taskType === 'answer') {
          const updatedContent = (lastMsg.content || '') + buffered;
          return [...prev.slice(0, -1), {
            ...lastMsg,
            content: updatedContent,
            taskState: {
              ...lastMsg.taskState!,
              taskId: agent.getTaskId() || lastMsg.taskState?.taskId || '',
              status: complete ? 'completed' : 'running',
              content: updatedContent,
            },
          }];
        }

        // 创建新 answer 消息
        return [...prev, {
          id: generateMessageId(),
          role: 'assistant' as const,
          content: buffered,
          taskState: {
            taskId: agent.getTaskId() || '',
            taskType: 'answer' as const,
            status: complete ? 'completed' : 'running',
            content: buffered,
          },
          timestamp: Date.now(),
        }];
      });
    };

    agent.on('answer:chunk', (content: string, isComplete: boolean) => {
      chunkBuffer.text += content;
      if (isComplete) chunkBuffer.isComplete = true;

      // isComplete 时立即 flush，否则通过 rAF 批量合并
      if (isComplete) {
        if (chunkBuffer.rafId) cancelAnimationFrame(chunkBuffer.rafId);
        flushChunkBuffer();
      } else if (!chunkBuffer.rafId) {
        chunkBuffer.rafId = requestAnimationFrame(flushChunkBuffer);
      }
    });

    // 命令建议
    agent.on('command:suggestion', (suggestion: AICmdSuggestion) => {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: suggestion.explanation,
        suggestion,
        taskState: {
          taskId: agent.getTaskId() || '',
          taskType: 'command' as const,
          status: 'running',
          content: suggestion.explanation,
        },
        timestamp: Date.now(),
      }]);
      setIsLoading(false);
    });

    // 操作计划
    agent.on('plan', (plan: OperationStep[], description: string, taskId: string) => {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: description,
        taskState: {
          taskId,
          taskType: 'operation' as const,
          status: 'running',
          content: description,
          plan: plan as AIOperationStep[],
          totalSteps: plan.length,
          currentStep: 0,
        },
        timestamp: Date.now(),
      }]);
    });

    // 步骤状态更新
    agent.on('step:update', (stepIndex: number, status: string) => {
      setMessages(prev => {
        // 找到最后一个 operation 消息
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].taskState?.taskType === 'operation') {
            const msg = prev[i];
            if (msg.taskState?.plan) {
              const updatedPlan = [...msg.taskState.plan];
              if (updatedPlan[stepIndex]) {
                updatedPlan[stepIndex] = {
                  ...updatedPlan[stepIndex],
                  status: status as any,
                };
              }
              const updated = [...prev];
              updated[i] = {
                ...msg,
                taskState: { ...msg.taskState, plan: updatedPlan, currentStep: stepIndex },
              };
              return updated;
            }
          }
        }
        return prev;
      });
    });

    // 步骤详情
    agent.on('step:detail', (stepIndex: number, detail: StepDetailEvent) => {
      setMessages(prev => {
        const isRetry = detail.retryAttempt !== undefined && detail.retryAttempt > 0;

        // 查找已有的 step_detail 消息
        const existingIndex = isRetry
          ? -1  // 重试总是创建新消息
          : prev.findIndex(
              msg => msg.taskState?.taskType === 'step_detail' &&
                     msg.taskState?.taskId === detail.taskId &&
                     msg.taskState?.stepIndex === detail.stepIndex &&
                     !msg.taskState?.retryAttempt
            );

        if (existingIndex !== -1) {
          // 更新现有
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            taskState: {
              ...updated[existingIndex].taskState!,
              status: detail.status as any,
              stepDescription: detail.description || updated[existingIndex].taskState!.stepDescription,
              stepCommand: detail.command || updated[existingIndex].taskState!.stepCommand,
              stepRisk: detail.risk || updated[existingIndex].taskState!.stepRisk,
              stepOutput: detail.output,
              stepSuccess: detail.success,
            },
          };
          return updated;
        }

        // 创建新 step_detail 消息
        return [...prev, {
          id: generateMessageId(),
          role: 'assistant' as const,
          content: '',
          taskState: {
            taskId: detail.taskId,
            taskType: 'step_detail' as const,
            status: detail.status as any,
            content: '',
            stepIndex: detail.stepIndex,
            stepDescription: detail.description,
            stepCommand: detail.command,
            stepRisk: detail.risk,
            stepOutput: detail.output,
            stepSuccess: detail.success,
            retryAttempt: detail.retryAttempt,
          },
          timestamp: Date.now(),
        }];
      });

      // 桌面通知：步骤等待确认
      if (detail.status === 'waiting_confirm' && !detail.autoExecute) {
        notify('TermCat - 等待确认', detail.description || detail.command || '操作步骤等待确认执行');
      }

      // 自动执行：服务端标记 auto_execute 时自动确认执行
      if (detail.autoExecute && detail.status === 'waiting_confirm' && detail.command) {
        setTimeout(() => {
          confirmExecuteRef.current?.({
            index: detail.stepIndex,
            command: detail.command!,
            description: detail.description,
            risk: detail.risk as RiskLevel || 'low',
          });
        }, 100);
      }
    });

    // 执行请求
    agent.on('execute:request', (stepIndex: number, command: string, risk: RiskLevel, description: string, taskId: string) => {
      setIsLoading(false);
      notify('TermCat - 等待确认执行', description || command);

      // 更新 operation 消息状态
      setMessages(prev => {
        const updated = [...prev];

        // 更新 operation 消息
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].taskState?.taskType === 'operation' && updated[i].taskState?.taskId === taskId) {
            updated[i] = {
              ...updated[i],
              taskState: { ...updated[i].taskState!, status: 'waiting_confirm', currentStep: stepIndex },
            };
            break;
          }
        }

        // 创建 step_detail 消息
        updated.push({
          id: generateMessageId(),
          role: 'assistant' as const,
          content: '',
          taskState: {
            taskId,
            taskType: 'step_detail' as const,
            status: 'waiting_confirm',
            content: '',
            stepIndex,
            stepDescription: description,
            stepCommand: command,
            stepRisk: risk,
            passwordPrompt: 'Please enter your sudo password',
          },
          timestamp: Date.now(),
        });

        return updated;
      });
    });

    // 用户选择请求
    agent.on('choice:request', (stepIndex: number, data: ChoiceData, taskId: string) => {
      notify('TermCat - 需要选择', data.question || '请做出选择');
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '',
        taskState: {
          taskId,
          taskType: 'user_choice' as const,
          status: 'waiting_user_choice',
          content: '',
          stepIndex,
          choiceData: data,
        },
        timestamp: Date.now(),
      }]);
    });

    // Token 使用 — 暂存到 ref，等 task:complete 时再应用到最终消息
    agent.on('token:usage', (usage: TokenUsage) => {
      const prev = pendingTokenUsageRef.current;
      if (prev) {
        // 累加多次 token:usage
        pendingTokenUsageRef.current = {
          inputTokens: prev.inputTokens + usage.inputTokens,
          outputTokens: prev.outputTokens + usage.outputTokens,
          totalTokens: (prev.totalTokens || 0) + (usage.totalTokens || 0),
          costGems: prev.costGems + usage.costGems,
        } as TokenUsage;
      } else {
        pendingTokenUsageRef.current = { ...usage };
      }
    });

    // 任务完成 — 将暂存的 tokenUsage 应用到最终消息 + 同步积分余额 + 持久化会话
    agent.on('task:complete', (summary: string, gemsRemaining?: number) => {
      const tokenUsage = pendingTokenUsageRef.current;
      pendingTokenUsageRef.current = null;

      setMessages(prev => {
        const updated = [...prev];

        // 从后往前找最后一条有 taskState 的 assistant 消息
        let targetIdx = -1;
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i]?.role === 'assistant' && updated[i]?.taskState) {
            targetIdx = i;
            break;
          }
        }

        if (targetIdx >= 0) {
          updated[targetIdx] = {
            ...updated[targetIdx],
            taskState: {
              ...updated[targetIdx].taskState!,
              status: 'completed',
              ...(tokenUsage ? { tokenUsage } : {}),
            },
          };
        }

        // === 会话记录：追加未保存的 assistant 消息 ===
        const currentUserId = userIdRef.current;
        const currentConvId = convIdRef.current;
        const currentCreatedAt = convCreatedAtRef.current;
        if (currentUserId && currentConvId) {
          const unsaved = updated.slice(savedMsgCountRef.current);
          if (unsaved.length > 0) {
            const serialized = unsaved.map(serializeMsg);
            chatHistoryClientService.appendMessages(currentUserId, currentConvId, currentCreatedAt, serialized)
              .then(() => setSavedMsgCount(updated.length))
              .catch((err) => {
                logger.error(LOG_MODULE.AI, 'chat_history.append_batch_failed', 'Failed to append messages', {
                  error: 1, msg: String(err),
                });
              });
          }
          // 更新 header 的 updatedAt
          chatHistoryClientService.updateHeader(currentUserId, currentConvId, currentCreatedAt, {
            updatedAt: Date.now(),
          }).catch((err) => {
            logger.error(LOG_MODULE.AI, 'chat_history.update_header_failed', 'Failed to update header', {
              error: 1, msg: String(err),
            });
          });
        }

        return updated;
      });
      setIsLoading(false);

      // 同步服务端返回的积分余额
      if (gemsRemaining !== undefined && gemsRemaining >= 0) {
        onGemsUpdatedRef.current?.(gemsRemaining);
      }

      // 持久会话模式（pluginData.persistSession）：不关闭连接，保持上下文
      const persistSession = modeInfoRef.current?.pluginData?.persistSession;
      if (codeFeedbackWaitingRef.current) {
        // 已经在等待续轮的持久会话，不关闭
      } else if (persistSession) {
        // 持久会话模式：标记可继续
        codeFeedbackWaitingRef.current = true;
        setHasCodeSession(true);
      } else {
        // 普通模式：正常关闭连接
        closeTaskConnection();
      }
    });

    // 任务错误
    agent.on('task:error', (error: string, code?: number | string, errorParams?: string) => {
      // Translate provider error code to localized message if available
      if (code && typeof code === 'string' && translateProviderErrorRef.current) {
        const translated = translateProviderErrorRef.current(code, errorParams);
        if (translated) error = translated;
      }
      // 积分不足（code 1301）：同步余额为 0 + 显示充值弹窗
      if (code === 1301) {
        onGemsUpdatedRef.current?.(0);
        setShowInsufficientGems(true);
      }

      // 取出已累积的 tokenUsage（积分不足时仍需展示已消耗的积分）
      const tokenUsage = pendingTokenUsageRef.current;
      pendingTokenUsageRef.current = null;

      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.taskState) {
          return [...prev.slice(0, -1), {
            ...lastMsg,
            taskState: {
              ...lastMsg.taskState,
              status: 'error',
              error,
              ...(tokenUsage ? { tokenUsage } : {}),
            },
          }];
        }
        // No assistant message yet — create one to show the error
        return [...prev, {
          id: generateMessageId(),
          role: 'assistant' as const,
          content: '',
          taskState: {
            taskId: agent.getTaskId() || '',
            taskType: 'answer' as const,
            status: 'error' as const,
            content: '',
            error,
            ...(tokenUsage ? { tokenUsage } : {}),
          },
          timestamp: Date.now(),
        }];
      });
      setIsLoading(false);

      // 任务出错，关闭任务连接
      closeTaskConnection();
    });

    // 运维关键字检测
    agent.on('ops:detected', (keywords: string[]) => {
      if (modeRef.current === 'ask') {
        setShowAgentSuggestion(true);
      }
    });

    // 工具调用（Code 模式）
    agent.on('tool:use', (toolName: string, toolInput: Record<string, any>, toolUseId: string, taskId: string) => {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '',
        taskState: {
          taskId,
          taskType: 'tool_use' as const,
          status: 'executing',
          content: '',
          toolName,
          toolInput,
          toolUseId,
        },
        timestamp: Date.now(),
      }]);
    });

    // 工具结果（Code 模式）
    agent.on('tool:result', (toolUseId: string, output: string, isError: boolean) => {
      setMessages(prev => {
        // 找到最后一个匹配 toolUseId 的 tool_use 消息并更新
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].taskState?.taskType === 'tool_use' && updated[i].taskState?.toolUseId === toolUseId) {
            updated[i] = {
              ...updated[i],
              taskState: {
                ...updated[i].taskState!,
                status: isError ? 'error' : 'completed',
                toolOutput: output,
                toolError: isError,
              },
            };
            break;
          }
        }
        return updated;
      });
    });

    // 工具权限请求（Code 模式）
    // SDK 先发 TOOL_USE 再发 TOOL_PERMISSION_REQUEST（同一 toolUseId），
    // 找到已有的 tool_use 消息并更新其状态，避免创建重复消息
    agent.on('tool:permission_request', (permissionId: string, toolName: string, toolInput: Record<string, any>, taskId: string, toolUseId: string, risk?: string, description?: string, title?: string, allowPermanent?: boolean) => {
      notify('TermCat - 需要授权', title || description || `工具 ${toolName} 请求执行权限`);
      setMessages(prev => {
        // 查找已有的 tool_use 消息（由 TOOL_USE 事件创建，toolUseId 匹配）
        let existingIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].taskState?.taskType === 'tool_use' && prev[i].taskState?.toolUseId === toolUseId) {
            existingIdx = i;
            break;
          }
        }
        if (existingIdx >= 0) {
          // 更新已有消息：添加 permissionId，切换状态为 waiting_tool_permission
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            taskState: {
              ...updated[existingIdx].taskState!,
              status: 'waiting_tool_permission',
              permissionId,
              permissionTitle: title || '',
              allowPermanent: allowPermanent || false,
              stepRisk: (risk as 'low' | 'medium' | 'high') || updated[existingIdx].taskState!.stepRisk,
              stepDescription: description || updated[existingIdx].taskState!.stepDescription || '',
            },
          };
          return updated;
        }
        // 没找到已有消息（理论上不应发生），创建新消息
        return [...prev, {
          id: generateMessageId(),
          role: 'assistant' as const,
          content: '',
          taskState: {
            taskId,
            taskType: 'tool_use' as const,
            status: 'waiting_tool_permission',
            content: '',
            toolName,
            toolInput,
            toolUseId,
            permissionId,
            permissionTitle: title || '',
            allowPermanent: allowPermanent || false,
            stepRisk: (risk as 'low' | 'medium' | 'high') || undefined,
            stepDescription: description || '',
          },
          timestamp: Date.now(),
        }];
      });
    });

    // 持久会话模式一轮结束 — 不弹反馈卡，直接允许在主输入框继续提问（连接保持）
    agent.on('feedback:request', (_taskId: string) => {
      const tokenUsage = pendingTokenUsageRef.current;
      pendingTokenUsageRef.current = null;

      // 持久会话模式（pluginData.persistSession）：保持连接，标记可续轮
      if (modeInfoRef.current?.pluginData?.persistSession) {
        codeFeedbackWaitingRef.current = true;
        setHasCodeSession(true);
      }
      setIsLoading(false);

      // 更新最后一条消息为 completed（附带 tokenUsage），不显示 feedback 卡片
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx]?.taskState) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            taskState: {
              ...updated[lastIdx].taskState!,
              status: 'completed',
              ...(tokenUsage ? { tokenUsage } : {}),
            },
          };
        }
        return updated;
      });
    });

    return agent;
  }, [selectedModel, sessionId, hostId, language, sshMode, connectionType, terminalId, closeTaskConnection]);

  // ==================== 操作回调 ====================

  /** 发送消息（懒建连：首次发消息时按需建立连接） */
  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || isLoading) return;

    // Code 模式续轮：复用现有连接，不创建新连接
    if (codeFeedbackWaitingRef.current && agentRef.current) {
      codeFeedbackWaitingRef.current = false;
      const now = Date.now();
      const userMsg: AIOpsMessage = {
        id: generateMessageId(),
        role: 'user',
        content: input,
        timestamp: now,
      };
      setMessages(prev => [...prev, userMsg]);
      setIsLoading(true);
      setAIStatus('thinking');
      pendingTokenUsageRef.current = null;

      // 持久化用户消息
      const currentUserId = userIdRef.current;
      const currentConvId = convIdRef.current;
      const currentCreatedAt = convCreatedAtRef.current;
      if (currentUserId && currentConvId) {
        chatHistoryClientService.appendMessage(currentUserId, currentConvId, currentCreatedAt, serializeMsg(userMsg))
          .then(() => setSavedMsgCount(prev => prev + 1))
          .catch(() => {});
      }

      agentRef.current.continueFeedback(input);
      return;
    }

    const now = Date.now();

    // 添加用户消息到列表
    const userMsg: AIOpsMessage = {
      id: generateMessageId(),
      role: 'user',
      content: input,
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
      timestamp: now,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setAIStatus('thinking');
    setShowAgentSuggestion(false);
    setCurrentSessionPassword('');
    setSkipPasswordPrompt(false);
    submittedChoicesRef.current.clear();
    pendingTokenUsageRef.current = null;

    // === 会话记录持久化 ===
    const currentUserId = userIdRef.current;
    if (currentUserId) {
      let currentConvId = convIdRef.current;
      const currentCreatedAt = convCreatedAtRef.current;

      if (!currentConvId) {
        // 首次发消息，创建新会话
        currentConvId = crypto.randomUUID();
        const title = input.slice(0, 30);
        setConvId(currentConvId);
        setConvCreatedAt(now);
        setConvTitle(title);
        convIdRef.current = currentConvId;
        convCreatedAtRef.current = now;

        // 写入 header + 用户消息
        chatHistoryClientService.create({
          convId: currentConvId,
          userId: currentUserId,
          hostId: hostId || '',
          hostName: hostName || '',
          title,
          mode,
          model: selectedModel,
          createdAt: now,
          updatedAt: now,
        }).then(() => {
          chatHistoryClientService.appendMessage(currentUserId, currentConvId!, now, serializeMsg(userMsg));
          setSavedMsgCount(prev => prev + 1);
        }).catch((err) => {
          logger.error(LOG_MODULE.AI, 'chat_history.create_failed', 'Failed to create conversation', {
            error: 1, msg: String(err),
          });
        });
      } else {
        // 追加用户消息
        chatHistoryClientService.appendMessage(currentUserId, currentConvId, currentCreatedAt, serializeMsg(userMsg))
          .then(() => setSavedMsgCount(prev => prev + 1))
          .catch((err) => {
            logger.error(LOG_MODULE.AI, 'chat_history.append_failed', 'Failed to append message', {
              error: 1, msg: String(err),
            });
          });
      }
    }

    // 转换附件格式
    const agentFiles: AgentAttachedFile[] | undefined = attachedFiles.length > 0
      ? attachedFiles.map(f => ({ id: f.id || generateMessageId(), name: f.name, size: f.size, type: f.type, content: f.content }))
      : undefined;

    // 关闭上一次的任务连接（如果存在）
    closeTaskConnection();

    // 创建新的任务级 WebSocket 连接
    // Plugin mode (e.g. local-agent): use pluginData.wsUrl; Server mode: use configured wsUrl
    const resolvedWsUrl = isPluginMode && modeInfo?.pluginData?.wsUrl
      ? modeInfo.pluginData.wsUrl
      : (wsUrl
        || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_WS_BASE_URL)
        || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_BASE_URL)
        || 'ws://localhost:5001');

    // Plugin mode: check if API Key is not configured
    if (isPluginMode && modeInfo?.pluginData?.needsConfig) {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '',
        taskState: {
          taskId: '',
          taskType: 'answer' as const,
          status: 'error' as const,
          content: '',
          error: '本地 AI Agent 尚未配置 API Key，请前往 设置 → 插件管理 → 本地 AI 运维 Agent → 设置，填入 API Key 后重试。',
        },
        timestamp: Date.now(),
      }]);
      setIsLoading(false);
      return;
    }

    if (!isPluginMode && !token) {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '',
        taskState: {
          taskId: '',
          taskType: 'answer' as const,
          status: 'error' as const,
          content: '',
          error: '未登录，请先登录',
        },
        timestamp: Date.now(),
      }]);
      setIsLoading(false);
      setAIStatus('idle');
      return;
    }

    try {
      // Plugin mode doesn't require auth token
      const resolvedToken = isPluginMode ? (modeInfo?.pluginData?.token || token || 'local') : token!;
      const conn = new AIAgentConnection({ wsUrl: resolvedWsUrl, token: resolvedToken });
      taskConnectionRef.current = conn;
      await conn.connect();

      const agent = setupAgentForTask(conn);
      agent.ask(input, agentFiles);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '',
        taskState: {
          taskId: '',
          taskType: 'answer' as const,
          status: 'error' as const,
          content: '',
          error: '连接服务器失败，请重试',
        },
        timestamp: Date.now(),
      }]);
      setIsLoading(false);
      setAIStatus('idle');
      closeTaskConnection();
      return;
    }

    // 清空附件
    setAttachedFiles([]);

    logger.info(LOG_MODULE.AI, 'ai.ops.message.user_sent', 'User sent message', {
      mode,
      model: selectedModel,
      host_id: hostId,
      session_id: sessionId,
      content_length: input.length,
    });
  }, [isLoading, attachedFiles, mode, selectedModel, hostId, hostName, sessionId, token, wsUrl, isPluginMode, modeInfo, setupAgentForTask, closeTaskConnection]);

  /** 终止任务 */
  const stopTask = useCallback(() => {
    codeFeedbackWaitingRef.current = false;
    setHasCodeSession(false);
    closeTaskConnection();
    setIsLoading(false);
    setAIStatus('idle');

    // 将所有 executing 状态的卡片标记为 error
    setMessages(prev => {
      const updated = prev.map(msg => {
        if (msg.taskState && (msg.taskState.status === 'executing' || msg.taskState.status === 'waiting_tool_permission' || msg.taskState.status === 'waiting_confirm')) {
          return {
            ...msg,
            taskState: { ...msg.taskState, status: 'error' as const, error: '任务已停止' },
          };
        }
        return msg;
      });
      return [...updated, {
        id: generateMessageId(),
        role: 'assistant' as const,
        content: '✋ 任务已停止',
        timestamp: Date.now(),
      }];
    });
  }, [closeTaskConnection]);

  /** Code 模式：手动断开持久会话 */
  const disconnectCodeSession = useCallback(() => {
    codeFeedbackWaitingRef.current = false;
    setHasCodeSession(false);
    closeTaskConnection();
    setIsLoading(false);
    setAIStatus('idle');
  }, [closeTaskConnection]);

  /** 确认执行命令 */
  const confirmExecute = useCallback((step: AIOperationStep & { needsConfirmation?: boolean }) => {
    const agent = agentRef.current;
    if (!agent) return;

    const command = step.command;
    const stepIndex = step.index;
    if (!command) return;

    // 查找 taskId
    const targetMsg = [...messagesRef.current].reverse().find(
      msg => msg.taskState?.taskType === 'step_detail' &&
             msg.taskState?.stepIndex === stepIndex &&
             msg.taskState?.stepCommand === command
    );
    const taskId = targetMsg?.taskState?.taskId;
    if (!taskId) return;

    setAIStatus('thinking');

    // 需要用户确认的情况
    if (step.needsConfirmation) {
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(
          msg => msg.taskState?.taskId === taskId &&
                 msg.taskState?.stepIndex === stepIndex &&
                 msg.taskState?.stepCommand === command
        );
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            taskState: { ...updated[idx].taskState!, status: 'waiting_user_confirm' },
          };
        }
        return updated;
      });
      return;
    }

    // sudo 命令需要密码
    const isSudo = /\bsudo\s+/.test(command);
    if (isSudo) {
      if (skipPasswordPrompt && currentSessionPassword) {
        // 有缓存密码，直接执行
        executeViaAgent(stepIndex, command, taskId, currentSessionPassword);
        return;
      }
      // 需要输入密码
      setPendingPasswordCommand({ command, stepIndex, taskId });
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(
          msg => msg.taskState?.taskId === taskId &&
                 msg.taskState?.stepIndex === stepIndex &&
                 msg.taskState?.stepCommand === command
        );
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            taskState: { ...updated[idx].taskState!, status: 'waiting_password' },
          };
        }
        return updated;
      });
      return;
    }

    // 非 sudo，直接执行
    executeViaAgent(stepIndex, command, taskId);
  }, [skipPasswordPrompt, currentSessionPassword]);

  // 保持 ref 同步，供 step:detail auto-execute 回调使用
  confirmExecuteRef.current = confirmExecute;

  /** 内部：通过 agent 执行命令 */
  const executeViaAgent = useCallback(async (
    stepIndex: number,
    command: string,
    taskId: string,
    password?: string,
  ) => {
    const agent = agentRef.current;
    if (!agent) return;

    setAIStatus('thinking');
    setIsLoading(true);

    // 更新消息状态为执行中
    setMessages(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(
        msg => msg.taskState?.taskId === taskId &&
               msg.taskState?.stepIndex === stepIndex &&
               msg.taskState?.stepCommand === command
      );
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          taskState: { ...updated[idx].taskState!, status: 'executing' },
        };
      }
      return updated;
    });

    try {
      await agent.confirmExecute(stepIndex, command, password, taskId);
    } catch (error) {
      logger.error(LOG_MODULE.AI, 'ai.ops.execute.failed', 'Command execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  /** 取消执行 */
  const cancelExecute = useCallback((taskId: string, stepIndex: number) => {
    const agent = agentRef.current;
    if (!agent) return;

    // 只发 Ctrl+C 中断命令，不手动改 UI 状态
    // executor 检测到 ^C + [?2004h → resolve 失败 → EXECUTE_RESULT → TOOL_RESULT → UI 自动更新
    agent.cancelExecute(stepIndex);
  }, []);

  /** 提交密码 */
  const submitPassword = useCallback(() => {
    if (!passwordInput.trim()) return;

    const password = passwordInput;
    setCurrentSessionPassword(password);
    setShowPasswordInput(false);
    setPasswordInput('');

    // Code 模式：密码用于工具权限批准
    const pendingPerm = pendingPermissionApproval;
    if (pendingPerm) {
      setPendingPermissionApproval(null);
      const agent = agentRef.current;
      if (agent) {
        // 缓存密码到 AIAgent（handleCodeModeExecuteRequest 会自动使用）
        agent.setPassword(password);
        agent.approveToolPermission(pendingPerm.permissionId);

        // 更新消息状态
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].taskState?.permissionId === pendingPerm.permissionId) {
              updated[i] = {
                ...updated[i],
                taskState: { ...updated[i].taskState!, status: 'executing' },
              };
              break;
            }
          }
          return updated;
        });
      }
      return;
    }

    // Agent 模式：密码用于命令执行
    const pending = pendingPasswordCommand;
    if (!pending) return;

    setPendingPasswordCommand(null);
    executeViaAgent(pending.stepIndex, pending.command, pending.taskId, password);
  }, [pendingPasswordCommand, pendingPermissionApproval, passwordInput, executeViaAgent]);

  /** 提交用户选择（防重复提交：已提交的 step 不会再次发送） */
  const submitUserChoice = useCallback((
    taskId: string,
    stepIndex: number,
    choice: string,
    customInput?: string,
  ) => {
    const agent = agentRef.current;
    if (!agent) return;

    // 防重复提交：同一任务同一步骤只允许提交一次
    const choiceKey = `${taskId}_${stepIndex}`;
    if (submittedChoicesRef.current.has(choiceKey)) {
      logger.warn(LOG_MODULE.AI, 'ai.user_choice.duplicate', 'Duplicate user choice submission blocked', {
        task_id: taskId,
        step_index: stepIndex,
      });
      return;
    }
    submittedChoicesRef.current.add(choiceKey);

    setAIStatus('thinking');
    agent.sendUserChoice(stepIndex, choice, customInput);

    setMessages(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(
        msg => msg.taskState?.taskId === taskId &&
               msg.taskState?.stepIndex === stepIndex &&
               msg.taskState?.status === 'waiting_user_choice'
      );
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          taskState: {
            ...updated[idx].taskState!,
            status: 'user_choice_submitted',
            userChoice: choice,
            userCustomInput: customInput,
          },
        };
      }
      return updated;
    });
  }, []);

  /** 取消用户选择 */
  const cancelUserChoice = useCallback((taskId: string, stepIndex: number) => {
    const agent = agentRef.current;
    if (!agent) return;

    agent.cancelUserChoice(stepIndex);

    setMessages(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(
        msg => msg.taskState?.taskId === taskId &&
               msg.taskState?.stepIndex === stepIndex &&
               msg.taskState?.status === 'waiting_user_choice'
      );
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          taskState: { ...updated[idx].taskState!, status: 'error', error: '用户取消选择' },
        };
      }
      return updated;
    });
  }, []);

  /** 发送交互式响应 */
  const sendInteractiveResponse = useCallback((response: string) => {
    const executor = executorRef.current;
    if (!executor) return;

    executor.sendInteractiveResponse(response).then(() => {
      setWaitingForInteraction(false);
      setInteractionPrompt('');
    }).catch(() => {
      setWaitingForInteraction(false);
      setInteractionPrompt('');
    });
  }, []);

  /** 重置建议 */
  const resetSuggestions = useCallback(() => {
    setShowAgentSuggestion(false);
  }, []);

  /** 批准工具执行（Code 模式）— 支持 sudo 密码和高风险确认 */
  const approveToolPermission = useCallback((permissionId: string, permanent?: boolean) => {
    const agent = agentRef.current;
    if (!agent) return;

    // 查找对应的消息
    const targetMsg = messagesRef.current.slice().reverse().find(
      msg => msg.taskState?.permissionId === permissionId
    );
    const currentStatus = targetMsg?.taskState?.status;

    const toolName = targetMsg?.taskState?.toolName;
    if (toolName === 'mcp__remote_ops__bash' || toolName === 'bash') {
      const command = targetMsg.taskState.toolInput?.command || '';
      const risk = targetMsg.taskState.stepRisk;
      const isSudo = /\bsudo\s+/.test(command);

      // 第一阶段：高/中风险命令先显示确认 UI（从 waiting_tool_permission → waiting_user_confirm）
      if ((risk === 'high' || risk === 'medium') &&
          currentStatus === 'waiting_tool_permission') {
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].taskState?.permissionId === permissionId) {
              updated[i] = {
                ...updated[i],
                taskState: { ...updated[i].taskState!, status: 'waiting_user_confirm' },
              };
              break;
            }
          }
          return updated;
        });
        return;
      }

      // 第二阶段（或低风险直接进入）：sudo 命令需要密码
      if (isSudo && !currentSessionPassword) {
        setPendingPermissionApproval({ permissionId });
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].taskState?.permissionId === permissionId) {
              updated[i] = {
                ...updated[i],
                taskState: { ...updated[i].taskState!, status: 'waiting_password' },
              };
              break;
            }
          }
          return updated;
        });
        return;
      }

      // sudo 命令但有缓存密码：先设置密码再批准
      if (isSudo && currentSessionPassword) {
        agent.setPassword(currentSessionPassword);
      }
    }

    // 发送批准（permanent=true → "永久允许"，会在 session 内记住规则）
    agent.approveToolPermission(permissionId, permanent);

    // 更新消息状态为执行中
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].taskState?.permissionId === permissionId) {
          updated[i] = {
            ...updated[i],
            taskState: {
              ...updated[i].taskState!,
              status: 'executing',
            },
          };
          break;
        }
      }
      return updated;
    });
  }, [currentSessionPassword]);

  /** 拒绝工具执行（Code 模式） */
  const denyToolPermission = useCallback((permissionId: string, reason?: string) => {
    const agent = agentRef.current;
    if (!agent) return;

    // 清理可能存在的待密码审批
    if (pendingPermissionApproval?.permissionId === permissionId) {
      setPendingPermissionApproval(null);
    }

    agent.denyToolPermission(permissionId, reason);

    // 更新消息状态（匹配所有中间状态）
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].taskState?.permissionId === permissionId) {
          updated[i] = {
            ...updated[i],
            taskState: {
              ...updated[i].taskState!,
              status: 'error',
              error: reason || '用户拒绝执行',
            },
          };
          break;
        }
      }
      return updated;
    });
  }, [pendingPermissionApproval]);

  /** 接受任务结果（Code 模式） */
  const acceptFeedback = useCallback(() => {
    const agent = agentRef.current;
    if (!agent) return;

    agent.acceptFeedback();
  }, []);

  /** 继续任务（Code 模式） */
  const continueFeedback = useCallback((message: string) => {
    const agent = agentRef.current;
    if (!agent) return;

    // 添加用户消息到列表
    const userMsg: AIOpsMessage = {
      id: generateMessageId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setAIStatus('thinking');

    agent.continueFeedback(message);
  }, []);

  /** 新建会话（清空当前消息） */
  const newConversation = useCallback(() => {
    codeFeedbackWaitingRef.current = false;
    setHasCodeSession(false);
    closeTaskConnection();
    setMessages([]);
    setConvId(null);
    setConvCreatedAt(0);
    setConvTitle('');
    setSavedMsgCount(0);
    convIdRef.current = null;
    convCreatedAtRef.current = 0;
    savedMsgCountRef.current = 0;
    setIsLoading(false);
    setAIStatus('idle');
  }, []);

  /** 加载历史会话 */
  const loadConversation = useCallback((data: ConversationData) => {
    setConvId(data.convId);
    setConvCreatedAt(data.createdAt);
    setConvTitle(data.title);
    setMessages(data.messages);
    setSavedMsgCount(data.messages.length);
    convIdRef.current = data.convId;
    convCreatedAtRef.current = data.createdAt;
    savedMsgCountRef.current = data.messages.length;
    setIsLoading(false);
    setAIStatus('idle');
  }, []);

  // ==================== 文件附件（简单实现，不经过 agent） ====================

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
      });
      newAttachments.push({
        id: generateMessageId(),
        name: file.name,
        size: file.size,
        type: file.type,
        content: base64,
      });
    }
    setAttachedFiles(prev => [...prev, ...newAttachments]);

    // 清空 input
    if (e.target) e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachedFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  // ==================== 返回 ====================

  return {
    // 连接状态（任务级连接：发送消息时建连，任务结束后断连）
    // Code 模式持久会话期间即使 isLoading=false 也保持 connected
    isConnected: isLoading || hasCodeSession,
    connectionStatus: (isLoading || hasCodeSession) ? 'connected' as const : 'idle' as const,

    // AI 状态
    aiStatus,
    isLoading,

    // 消息
    messages,

    // 模式与配置
    mode,
    sshMode,
    selectedModel,
    availableModels,
    setMode,
    setSshMode,
    setSelectedModel,

    // 交互式提示
    waitingForInteraction,
    interactionPrompt,
    sendInteractiveResponse,

    // 密码
    showPasswordInput,
    passwordInput,
    skipPasswordPrompt,
    currentSessionPassword,
    pendingPasswordCommand,
    setPassword: setPasswordInput,
    setSkipPasswordPrompt,

    // 文件附件
    attachedFiles,
    handleFileChange,
    removeAttachment,
    clearAttachments,

    // UI 状态
    autoScroll,
    setAutoScroll,
    showInsufficientGems,
    setShowInsufficientGems,
    showAgentSuggestion,
    setShowAgentSuggestion,

    // 会话记录
    convId,
    convTitle,
    newConversation,
    loadConversation,

    // 操作
    sendMessage,
    stopTask,
    confirmExecute,
    cancelExecute,
    submitPassword,
    submitUserChoice,
    cancelUserChoice,
    resetSuggestions,

    // 工具权限和用户反馈（Code 模式）
    approveToolPermission,
    denyToolPermission,
    acceptFeedback,
    continueFeedback,
    hasCodeSession,
    disconnectCodeSession,

    // Agent 实例
    agent: agentRef.current,
  };
}
