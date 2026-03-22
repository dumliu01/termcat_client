/**
 * Block 分发渲染器
 *
 * 根据 block.type 分发到对应的 block 组件。
 */

import React from 'react';
import type { MsgBlock, MsgViewerActions, PasswordState } from '../types';
import { UserTextBubble } from './UserTextBubble';
import { AssistantTextBubble } from './AssistantTextBubble';
import { CommandSuggestionCard } from './CommandSuggestionCard';
import { OperationPlanCard } from './OperationPlanCard';
import { StepDetailCard } from './StepDetailCard';
import { ToolUseCard } from './ToolUseCard';
import { UserChoiceCard } from './UserChoiceCard';
import { AdBubble } from './AdBubble';
import { FeedbackPrompt } from './FeedbackPrompt';
import { LoadingIndicator } from './LoadingIndicator';

interface Props {
  block: MsgBlock;
  language: 'zh' | 'en';
  actions: MsgViewerActions;
  passwordState?: PasswordState;
}

export const BlockRenderer: React.FC<Props> = React.memo(({ block, language, actions, passwordState }) => {
  switch (block.type) {
    case 'user_text':
      return <UserTextBubble block={block} language={language} />;

    case 'assistant_text':
      return <AssistantTextBubble block={block} language={language} onExecuteCommand={actions.onExecuteCommand} />;

    case 'command_suggestion':
      return <CommandSuggestionCard block={block} language={language} onExecuteCommand={actions.onExecuteCommand} />;

    case 'operation_plan':
      return <OperationPlanCard block={block} language={language} />;

    case 'step_detail':
      return <StepDetailCard block={block} language={language} passwordState={passwordState} actions={actions} />;

    case 'tool_use':
      return <ToolUseCard block={block} language={language} actions={actions} />;

    case 'user_choice':
      return <UserChoiceCard block={block} language={language} actions={actions} />;

    case 'ad':
      return <AdBubble block={block} language={language} actions={actions} />;

    case 'feedback':
      return <FeedbackPrompt block={block} language={language} actions={actions} />;

    case 'loading':
      return <LoadingIndicator block={block} language={language} />;

    default:
      return null;
  }
});
