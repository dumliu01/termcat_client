/**
 * msg-viewer 公共 API
 *
 * 通用富消息展示控件，支持 AI 对话、广告、运维操作等多种消息类型。
 */

// 主组件
export { MsgViewer } from './MsgViewer';

// 类型
export type {
  // Block 类型
  MsgBlock,
  UserTextBlock,
  AssistantTextBlock,
  CommandSuggestionBlock,
  OperationPlanBlock,
  StepDetailBlock,
  ToolUseBlock,
  UserChoiceBlock,
  AdBlock,
  FeedbackBlock,
  LoadingBlock,
  // 子类型
  RiskLevel,
  StepStatus,
  BlockStatus,
  TokenUsageInfo,
  FileAttachmentInfo,
  PlanStep,
  ChoiceOptionInfo,
  // Props & Actions
  MsgViewerProps,
  MsgViewerActions,
  PasswordState,
} from './types';

// 可复用子组件（供外部直接使用）
export { MarkdownRenderer } from './shared/MarkdownRenderer';
export { CodeBlock, StableCodeBlock } from './shared/CodeBlock';
export { CopyButton } from './shared/CopyButton';
export { PasswordInputRow } from './shared/PasswordInput';
export { CommandConfirmation } from './shared/CommandConfirmation';

// Block 组件（供需要自定义渲染的场景使用）
export { BlockRenderer } from './blocks/BlockRenderer';
export { UserTextBubble } from './blocks/UserTextBubble';
export { AssistantTextBubble } from './blocks/AssistantTextBubble';
export { CommandSuggestionCard } from './blocks/CommandSuggestionCard';
export { OperationPlanCard } from './blocks/OperationPlanCard';
export { StepDetailCard } from './blocks/StepDetailCard';
export { ToolUseCard } from './blocks/ToolUseCard';
export { UserChoiceCard } from './blocks/UserChoiceCard';
export { AdBubble } from './blocks/AdBubble';
export { FeedbackPrompt } from './blocks/FeedbackPrompt';
export { LoadingIndicator } from './blocks/LoadingIndicator';

// 工具函数
export { getRiskColor, getStepStatusBgColor } from './utils/riskColors';
export { getStepStatusIcon } from './utils/stepIcons';
