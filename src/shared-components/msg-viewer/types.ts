/**
 * msg-viewer type definitions
 *
 * Data types for universal rich message display component.
 * Completely decoupled from business logic (AI ops / ad system),
 * only describes "what to display" and "what operations user can do".
 */

import type { VirtuosoHandle } from 'react-virtuoso';

// ─── Basic enums ───

export type RiskLevel = 'low' | 'medium' | 'high';

export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

export type BlockStatus =
  | 'idle' | 'running' | 'executing'
  | 'waiting_confirm' | 'waiting_password' | 'waiting_user_confirm'
  | 'waiting_permission' | 'waiting_feedback'
  | 'completed' | 'error';

// ─── Sub structures ───

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

// ─── Block union type ───

interface BlockBase {
  /** Stable unique ID (Virtuoso key) */
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
  /** 'running' = streaming in progress */
  status: BlockStatus;
  error?: string;
  tokenUsage?: TokenUsageInfo;
  /** Which languages show "execute" button in code blocks, e.g. ['bash','sh'] */
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
  /** When set, this step is a Code-mode tool permission (show Allow once / Always allow / Deny) */
  permissionId?: string;
  /** Whether "Always allow" button should show (Code mode only) */
  allowPermanent?: boolean;
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
  /** SDK title (e.g. "Claude wants to run: lsof -iTCP") */
  permissionTitle?: string;
  /** Whether "Always allow" button should show (Code mode only) */
  allowPermanent?: boolean;
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

/** All block types */
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

// ─── Action callbacks ───

export interface MsgViewerActions {
  /** Execute command (terminal / bash) */
  onExecuteCommand?: (command: string) => void;

  /** Step confirmed to execute */
  onStepConfirm?: (blockId: string, stepIndex: number, command: string, risk?: RiskLevel, needsConfirmation?: boolean) => void;
  /** Step skipped/cancelled */
  onStepCancel?: (blockId: string, stepIndex: number) => void;

  /** Password submitted */
  onPasswordSubmit?: () => void;
  /** Password input changed */
  onPasswordChange?: (value: string) => void;
  /** Password skip changed */
  onPasswordSkipChange?: (skip: boolean) => void;

  /** Tool permission approved (allow once) */
  onToolApprove?: (permissionId: string) => void;
  /** Tool permission approved permanently (always allow for session) */
  onToolApproveAlways?: (permissionId: string) => void;
  /** Tool permission denied */
  onToolDeny?: (permissionId: string, reason?: string) => void;

  /** User choice submitted */
  onChoiceSubmit?: (blockId: string, choice: string, customInput?: string) => void;
  /** User choice cancelled */
  onChoiceCancel?: (blockId: string) => void;

  /** Task feedback: accept */
  onFeedbackAccept?: () => void;
  /** Task feedback: continue conversation */
  onFeedbackContinue?: (message: string) => void;

  /** Ad action clicked */
  onAdAction?: (blockId: string) => void;

  /** Copy a reply segment */
  onCopyReply?: (startIndex: number, endIndex: number) => void;
}

// ─── Password state (session-level, shared across blocks) ───

export interface PasswordState {
  value: string;
  skipPrompt: boolean;
  showInput: boolean;
  /** Currently executing step block ID */
  executingStepId?: string;
}

// ─── MsgViewer Props ───

export interface MsgViewerProps {
  blocks: MsgBlock[];
  actions: MsgViewerActions;
  language: 'zh' | 'en';

  /** Is loading (show footer loading) */
  isLoading?: boolean;
  loadingStatus?: 'thinking' | 'generating' | 'waiting_user';
  loadingMessage?: string;

  /** Password state (session-level shared) */
  passwordState?: PasswordState;

  /** Auto scroll */
  autoScroll?: boolean;
  onAutoScrollChange?: (atBottom: boolean) => void;

  /** Virtuoso handle */
  virtuosoRef?: React.RefObject<VirtuosoHandle>;

  /** Block id to scroll into view when `scrollNonce` changes. */
  scrollToBlockId?: string;
  /** Incrementing counter — each change triggers a scroll to `scrollToBlockId`. */
  scrollNonce?: number;

  /** Empty state customization */
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptySubtitle?: string;
}
