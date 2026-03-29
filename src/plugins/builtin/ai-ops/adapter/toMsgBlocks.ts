/**
 * AIOpsMessage[] + AdMessage[] → MsgBlock[] Adapter
 *
 * Converts AI Ops business layer message model to msg-viewer's common Block model.
 * One AIOpsMessage may map to 1~N MsgBlocks (e.g., carrying both content + suggestion).
 */

import type { AIOpsMessage } from '@/features/terminal/types';
import type { AdMessage } from '@/core/ad/types';
import type { MsgBlock, AdBlock, BlockStatus, RiskLevel } from '@/shared-components/msg-viewer/types';
import { getLocale } from '../i18n';

// ─── Helpers ───

/** Map AITaskState.status to BlockStatus */
function mapTaskStatus(status: string | undefined): BlockStatus {
  switch (status) {
    case 'running': return 'running';
    case 'executing': return 'executing';
    case 'waiting_confirm': return 'waiting_confirm';
    case 'waiting_password': return 'waiting_password';
    case 'waiting_user_confirm': return 'waiting_user_confirm';
    case 'waiting_tool_permission': return 'waiting_permission';
    case 'waiting_feedback': return 'waiting_feedback';
    case 'completed': return 'completed';
    case 'error': return 'error';
    default: return 'idle';
  }
}

/** Convert token usage */
function mapTokenUsage(tu: { inputTokens: number; outputTokens: number; totalTokens: number; costGems: number; showTokens?: boolean; showGems?: boolean } | undefined) {
  if (!tu) return undefined;
  return { inputTokens: tu.inputTokens, outputTokens: tu.outputTokens, totalTokens: tu.totalTokens, costGems: tu.costGems, showTokens: tu.showTokens, showGems: tu.showGems };
}

// ─── Single Message Conversion ───

function convertMessage(msg: AIOpsMessage, language: string): MsgBlock[] {
  const blocks: MsgBlock[] = [];
  const ts = msg.timestamp;

  // User message
  if (msg.role === 'user') {
    blocks.push({
      id: msg.id,
      type: 'user_text',
      content: msg.content,
      timestamp: ts,
      files: msg.files?.map(f => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
    });
    return blocks;
  }

  // ── The following are all assistant ──

  const task = msg.taskState;

  // Plain text answer (answer type, or no taskState but has content)
  if (task?.taskType === 'answer' || (!task && msg.content)) {
    blocks.push({
      id: `${msg.id}_text`,
      type: 'assistant_text',
      content: msg.content || task?.content || '',
      status: mapTaskStatus(task?.status),
      error: task?.error,
      tokenUsage: mapTokenUsage(task?.tokenUsage),
      executableCodeLangs: ['bash', 'sh'],
      timestamp: ts,
    });
  }

  // Command suggestion
  if (msg.suggestion) {
    blocks.push({
      id: `${msg.id}_cmd`,
      type: 'command_suggestion',
      command: msg.suggestion.command,
      explanation: msg.suggestion.explanation,
      risk: (msg.suggestion.risk || 'low') as RiskLevel,
      tokenUsage: mapTokenUsage(task?.tokenUsage),
      timestamp: ts,
    });
  }

  // Operation plan
  if (task?.taskType === 'operation' && task.plan) {
    blocks.push({
      id: `${msg.id}_plan`,
      type: 'operation_plan',
      description: task.content || '',
      steps: task.plan.map(s => ({
        description: s.description,
        status: s.status || 'pending',
      })),
      status: mapTaskStatus(task.status),
      tokenUsage: mapTokenUsage(task.tokenUsage),
      timestamp: ts,
    });
  }

  // Step detail
  if (task?.taskType === 'step_detail') {
    blocks.push({
      id: `${msg.id}_step`,
      type: 'step_detail',
      stepIndex: task.stepIndex ?? 0,
      stepDescription: task.stepDescription || '',
      command: task.stepCommand,
      risk: task.stepRisk as RiskLevel | undefined,
      status: mapTaskStatus(task.status),
      output: task.stepOutput,
      success: task.stepSuccess,
      passwordPrompt: task.passwordPrompt,
      tokenUsage: mapTokenUsage(task.tokenUsage),
      timestamp: ts,
    });
  }

  // Tool call (Code / X-Agent mode) — Bash commands reuse step_detail display
  const isBashTool = task?.toolName === 'mcp__remote_ops__bash' || task?.toolName === 'bash' || task?.toolName === 'Bash';
  if (task?.taskType === 'tool_use' && isBashTool) {
    blocks.push({
      id: `${msg.id}_step`,
      type: 'step_detail',
      stepIndex: task.stepIndex ?? 0,
      stepDescription: task.stepDescription || getLocale(language).executeCommand,
      command: task.toolInput?.command || '',
      risk: (task.stepRisk || 'low') as RiskLevel,
      status: mapTaskStatus(
        task.status === 'waiting_tool_permission' ? 'waiting_confirm' : task.status,
      ),
      output: task.toolOutput,
      success: task.toolError ? false : task.status === 'completed' ? true : undefined,
      passwordPrompt: task.passwordPrompt,
      tokenUsage: mapTokenUsage(task.tokenUsage),
      timestamp: ts,
      permissionId: task.status === 'waiting_tool_permission' ? task.permissionId : undefined,
      allowPermanent: task.allowPermanent,
    });
  }

  // Tool call (Code / X-Agent mode) — Non-Bash tools
  if (task?.taskType === 'tool_use' && !isBashTool) {
    blocks.push({
      id: `${msg.id}_tool`,
      type: 'tool_use',
      toolName: task.toolName || '',
      toolLabel: task.toolName || '',
      toolInput: task.toolInput,
      status: mapTaskStatus(task.status),
      output: task.toolOutput,
      isError: task.toolError,
      error: task.error,
      permissionId: task.permissionId,
      permissionTitle: task.permissionTitle,
      allowPermanent: task.allowPermanent,
      timestamp: ts,
    });
  }

  // User choice
  if (task?.taskType === 'user_choice' && task.choiceData) {
    blocks.push({
      id: `${msg.id}_choice`,
      type: 'user_choice',
      issue: task.choiceData.issue || '',
      question: task.choiceData.question || '',
      options: (task.choiceData.options || []).map(o => ({
        value: o.value,
        label: o.label,
        description: o.description,
        recommended: o.recommended,
      })),
      allowCustomInput: task.choiceData.allowCustomInput || false,
      customInputPlaceholder: task.choiceData.customInputPlaceholder,
      timestamp: ts,
    });
  }

  // Task completion feedback
  if (task?.status === 'waiting_feedback') {
    blocks.push({
      id: `${msg.id}_feedback`,
      type: 'feedback',
      timestamp: ts,
    });
  }

  return blocks;
}

// ─── AdMessage → AdBlock ───

function convertAdMessage(ad: AdMessage): AdBlock {
  return {
    id: ad.id,
    type: 'ad',
    renderMode: ad.content.renderMode || 'api',
    markdownContent: ad.content.message || '',
    actionText: ad.content.actionText,
    actionUrl: ad.content.actionUrl,
    actionType: ad.content.actionType,
    scriptHtml: ad.content.scriptHtml,
    scriptPageUrl: ad.content.scriptPageUrl,
    scriptSize: ad.content.scriptSize,
    platformLabel: ad.platform,
    timestamp: ad.timestamp,
  };
}

// ─── Main Export ───

/**
 * Merge AIOpsMessage[] and AdMessage[] and convert to MsgBlock[]
 *
 * @param messages - AI Ops message list
 * @param adMessages - Ad message list
 * @param shouldShowAd - Whether to display ads
 */
export function toMsgBlocks(
  messages: AIOpsMessage[],
  adMessages: AdMessage[] = [],
  shouldShowAd = false,
  language = 'zh',
): MsgBlock[] {
  // Convert normal messages (preserve order, one may produce multiple blocks)
  const msgBlocks: MsgBlock[] = [];
  for (const msg of messages) {
    msgBlocks.push(...convertMessage(msg, language));
  }

  // Not showing ads → return directly
  if (!shouldShowAd || adMessages.length === 0) {
    return msgBlocks;
  }

  // Merge ads (merge sort by timestamp)
  const adBlocks = adMessages
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(convertAdMessage);

  const result: MsgBlock[] = [];
  let mi = 0;
  let ai = 0;

  while (mi < msgBlocks.length && ai < adBlocks.length) {
    if (msgBlocks[mi].timestamp <= adBlocks[ai].timestamp) {
      result.push(msgBlocks[mi++]);
    } else {
      result.push(adBlocks[ai++]);
    }
  }
  while (mi < msgBlocks.length) result.push(msgBlocks[mi++]);
  while (ai < adBlocks.length) result.push(adBlocks[ai++]);

  return result;
}

/**
 * Find permissionId from MsgBlock[]
 *
 * Used in tool call scenarios: step_detail block may be generated by tool_use bash command,
 * needs to get permissionId from original AIOpsMessage to approve/reject tool permissions.
 */
export function findPermissionId(
  messages: AIOpsMessage[],
  blockId: string,
): string | undefined {
  // blockId format is `${msg.id}_step` or `${msg.id}_tool`
  const msgId = blockId.replace(/_(step|tool|text|cmd|plan|choice|feedback)$/, '');
  const msg = messages.find(m => m.id === msgId);
  return msg?.taskState?.permissionId;
}

/**
 * Restore original AIOpsMessage's taskId and stepIndex from blockId
 */
export function resolveTaskInfo(
  messages: AIOpsMessage[],
  blockId: string,
): { taskId: string; stepIndex: number } | undefined {
  const msgId = blockId.replace(/_(step|tool|text|cmd|plan|choice|feedback)$/, '');
  const msg = messages.find(m => m.id === msgId);
  if (!msg?.taskState) return undefined;
  return {
    taskId: msg.taskState.taskId,
    stepIndex: msg.taskState.stepIndex ?? 0,
  };
}
