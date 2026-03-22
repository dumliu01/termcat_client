/**
 * msg-viewer 类型定义
 *
 * 通用富消息展示控件的数据类型。
 * 与业务逻辑（AI ops / 广告系统）完全解耦，
 * 仅描述"要显示什么"和"用户能做什么操作"。
 */

import type { VirtuosoHandle } from 'react-virtuoso';

// ─── 基础枚举 ───

export type RiskLevel = 'low' | 'medium' | 'high';

export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

export type BlockStatus =
  | 'idle' | 'running' | 'executing'
  | 'waiting_confirm' | 'waiting_password' | 'waiting_user_confirm'
  | 'waiting_permission' | 'waiting_feedback'
  | 'completed' | 'error';

// ─── 子结构 ───

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costGems: number;
  showTokens?: boolean;
  showGems?: boolean;
}

export interface FileAttachmentInfo {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface PlanStep {
  description: string;
  status?: StepStatus;
}

export interface ChoiceOptionInfo {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

// ─── Block 联合类型 ───

interface BlockBase {
  /** 稳定唯一 ID（Virtuoso key） */
  id: string;
  timestamp: number;
}

export interface UserTextBlock extends BlockBase {
  type: 'user_text';
  content: string;
  files?: FileAttachmentInfo[];
}

export interface AssistantTextBlock extends BlockBase {
  type: 'assistant_text';
  content: string;
  /** 'running' = 流式输出中 */
  status: BlockStatus;
  error?: string;
  tokenUsage?: TokenUsageInfo;
  /** 代码块中哪些语言显示"执行"按钮，如 ['bash','sh'] */
  executableCodeLangs?: string[];
}

export interface CommandSuggestionBlock extends BlockBase {
  type: 'command_suggestion';
  command: string;
  explanation?: string;
  risk: RiskLevel;
  tokenUsage?: TokenUsageInfo;
}

export interface OperationPlanBlock extends BlockBase {
  type: 'operation_plan';
  description: string;
  steps: PlanStep[];
  status: BlockStatus;
  tokenUsage?: TokenUsageInfo;
}

export interface StepDetailBlock extends BlockBase {
  type: 'step_detail';
  stepIndex: number;
  stepDescription: string;
  command?: string;
  risk?: RiskLevel;
  status: BlockStatus;
  output?: string;
  success?: boolean;
  passwordPrompt?: string;
  tokenUsage?: TokenUsageInfo;
}

export interface ToolUseBlock extends BlockBase {
  type: 'tool_use';
  toolName: string;
  toolLabel: string;
  toolInput?: Record<string, any>;
  status: BlockStatus;
  output?: string;
  isError?: boolean;
  error?: string;
  permissionId?: string;
}

export interface UserChoiceBlock extends BlockBase {
  type: 'user_choice';
  issue: string;
  question: string;
  options: ChoiceOptionInfo[];
  allowCustomInput: boolean;
  customInputPlaceholder?: string;
}

export interface AdBlock extends BlockBase {
  type: 'ad';
  renderMode: 'api' | 'script';
  markdownContent: string;
  actionText?: string;
  actionUrl?: string;
  actionType?: 'url' | 'upgrade' | 'custom';
  scriptHtml?: string;
  scriptPageUrl?: string;
  scriptSize?: { width: number; height: number };
  platformLabel?: string;
}

export interface FeedbackBlock extends BlockBase {
  type: 'feedback';
}

export interface LoadingBlock extends BlockBase {
  type: 'loading';
  loadingStatus: 'thinking' | 'generating' | 'waiting_user';
  message?: string;
}

/** 所有 block 类型 */
export type MsgBlock =
  | UserTextBlock
  | AssistantTextBlock
  | CommandSuggestionBlock
  | OperationPlanBlock
  | StepDetailBlock
  | ToolUseBlock
  | UserChoiceBlock
  | AdBlock
  | FeedbackBlock
  | LoadingBlock;

// ─── 操作回调 ───

export interface MsgViewerActions {
  /** 执行命令（终端 / bash） */
  onExecuteCommand?: (command: string) => void;

  /** 步骤确认执行 */
  onStepConfirm?: (blockId: string, stepIndex: number, command: string, risk?: RiskLevel, needsConfirmation?: boolean) => void;
  /** 步骤跳过/取消 */
  onStepCancel?: (blockId: string, stepIndex: number) => void;

  /** 密码提交 */
  onPasswordSubmit?: () => void;
  /** 密码输入变化 */
  onPasswordChange?: (value: string) => void;
  /** 密码跳过变化 */
  onPasswordSkipChange?: (skip: boolean) => void;

  /** 工具权限批准 */
  onToolApprove?: (permissionId: string) => void;
  /** 工具权限拒绝 */
  onToolDeny?: (permissionId: string, reason?: string) => void;

  /** 用户选择提交 */
  onChoiceSubmit?: (blockId: string, choice: string, customInput?: string) => void;
  /** 用户选择取消 */
  onChoiceCancel?: (blockId: string) => void;

  /** 任务反馈：接受 */
  onFeedbackAccept?: () => void;
  /** 任务反馈：继续对话 */
  onFeedbackContinue?: (message: string) => void;

  /** 广告动作点击 */
  onAdAction?: (blockId: string) => void;

  /** 复制一段回复 */
  onCopyReply?: (startIndex: number, endIndex: number) => void;
}

// ─── 密码状态（会话级，跨 block 共享） ───

export interface PasswordState {
  value: string;
  skipPrompt: boolean;
  showInput: boolean;
  /** 当前正在执行的 step block ID */
  executingStepId?: string;
}

// ─── MsgViewer Props ───

export interface MsgViewerProps {
  blocks: MsgBlock[];
  actions: MsgViewerActions;
  language: 'zh' | 'en';

  /** 是否正在加载（显示 footer loading） */
  isLoading?: boolean;
  loadingStatus?: 'thinking' | 'generating' | 'waiting_user';
  loadingMessage?: string;

  /** 密码状态（会话级共享） */
  passwordState?: PasswordState;

  /** 自动滚动 */
  autoScroll?: boolean;
  onAutoScrollChange?: (atBottom: boolean) => void;

  /** Virtuoso handle */
  virtuosoRef?: React.RefObject<VirtuosoHandle>;

  /** 空状态自定义 */
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptySubtitle?: string;
}
