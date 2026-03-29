/**
 * msg-viewer public API
 *
 * Universal rich message display component, supports AI chat, ads, ops operations, and various message types.
 */

// Main component
export { MsgViewer } from './MsgViewer';

// Types
export type {
  // Block types
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
  // Sub types
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

// Reusable sub-components (for external direct use)
export { MarkdownRenderer } from './shared/MarkdownRenderer';
export { CodeBlock, StableCodeBlock } from './shared/CodeBlock';
export { CopyButton } from './shared/CopyButton';
export { PasswordInputRow } from './shared/PasswordInput';
export { CommandConfirmation } from './shared/CommandConfirmation';

// Block components (for scenarios requiring custom rendering)
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

// Utility functions
export { getRiskColor, getStepStatusBgColor } from './utils/riskColors';
export { getStepStatusIcon } from './utils/stepIcons';
