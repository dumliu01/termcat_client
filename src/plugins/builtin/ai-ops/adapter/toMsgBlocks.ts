/**
 * AIOpsMessage[] + AdMessage[] → MsgBlock[] 适配器
 *
 * 将 AI 运维业务层的消息模型转换为 msg-viewer 的通用 Block 模型。
 * 一条 AIOpsMessage 可能映射为 1~N 个 MsgBlock（例如同时携带 content + suggestion）。
 */

import type { AIOpsMessage } from '@/features/terminal/types';
import type { AdMessage } from '@/core/ad/types';
import type { MsgBlock, AdBlock, BlockStatus, RiskLevel } from '@/shared-components/msg-viewer/types';
import { getLocale } from '../i18n';

// ─── 辅助 ───

/** 将 AITaskState.status 映射为 BlockStatus */
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

/** 转换 token usage */
function mapTokenUsage(tu: { inputTokens: number; outputTokens: number; totalTokens: number; costGems: number; showTokens?: boolean; showGems?: boolean } | undefined) {
  if (!tu) return undefined;
  return { inputTokens: tu.inputTokens, outputTokens: tu.outputTokens, totalTokens: tu.totalTokens, costGems: tu.costGems, showTokens: tu.showTokens, showGems: tu.showGems };
}

// ─── 单条消息转换 ───

function convertMessage(msg: AIOpsMessage, language: string): MsgBlock[] {
  const blocks: MsgBlock[] = [];
  const ts = msg.timestamp;

  // 用户消息
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

  // ── 以下均为 assistant ──

  const task = msg.taskState;

  // 纯文本回答（answer 类型 或 无 taskState 但有 content）
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

  // 命令建议
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

  // 操作计划
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

  // 步骤详情
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

  // 工具调用（Code / Codex 模式）— Bash 命令复用 step_detail 展示
  const isBashTool = task?.toolName === 'mcp__remote_ops__bash' || task?.toolName === 'bash';
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
      // 额外字段用于处理 tool permission — 通过 block id 关联
    });
  }

  // 工具调用（Code / Codex 模式）— 非 Bash 工具
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
      timestamp: ts,
    });
  }

  // 用户选择
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

  // 任务完成反馈
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

// ─── 主导出 ───

/**
 * 将 AIOpsMessage[] 和 AdMessage[] 合并转换为 MsgBlock[]
 *
 * @param messages - AI 运维消息列表
 * @param adMessages - 广告消息列表
 * @param shouldShowAd - 是否展示广告
 */
export function toMsgBlocks(
  messages: AIOpsMessage[],
  adMessages: AdMessage[] = [],
  shouldShowAd = false,
  language = 'zh',
): MsgBlock[] {
  // 转换普通消息（保留顺序，一条可能产生多个 block）
  const msgBlocks: MsgBlock[] = [];
  for (const msg of messages) {
    msgBlocks.push(...convertMessage(msg, language));
  }

  // 不展示广告 → 直接返回
  if (!shouldShowAd || adMessages.length === 0) {
    return msgBlocks;
  }

  // 合并广告（双指针归并，按 timestamp 排序）
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
 * 从 MsgBlock[] 中查找 permissionId
 *
 * 用于工具调用场景：step_detail block 可能由 tool_use bash 命令生成，
 * 需要从原始 AIOpsMessage 中获取 permissionId 以批准/拒绝工具权限。
 */
export function findPermissionId(
  messages: AIOpsMessage[],
  blockId: string,
): string | undefined {
  // blockId 格式为 `${msg.id}_step` 或 `${msg.id}_tool`
  const msgId = blockId.replace(/_(step|tool|text|cmd|plan|choice|feedback)$/, '');
  const msg = messages.find(m => m.id === msgId);
  return msg?.taskState?.permissionId;
}

/**
 * 从 blockId 还原原始 AIOpsMessage 的 taskId 和 stepIndex
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
