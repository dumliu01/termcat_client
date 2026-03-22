/**
 * AI 会话记录类型定义
 *
 * .dat 文件采用 JSONL（JSON Lines）格式：
 * - 第1行：header（会话元信息）
 * - 第2行起：msg（消息记录），支持追加写入
 */

import { AIOpsMessage } from '@/features/terminal/types';

/** Header 行数据结构（写入 .dat 文件第一行） */
export interface ConversationHeader {
  convId: string;           // 会话 UUID
  userId: string;           // 用户 ID
  hostId: string;           // 关联主机 ID
  hostName: string;         // 主机名称
  title: string;            // 会话标题（第一条用户消息截取前30字符）
  mode: 'ask' | 'agent' | 'code' | 'codex';   // 会话模式
  model: string;            // AI 模型名称
  createdAt: number;        // 会话创建时间 (ms)
  updatedAt: number;        // 最后更新时间 (ms)
}

/** 会话列表项（header + 文件级信息，不含 messages） */
export interface ConversationMeta extends ConversationHeader {
  fileName: string;         // 文件名（用于加载/删除）
  fileSize: number;         // 文件大小 (bytes)
}

/** 完整会话数据（header + messages，加载时组装） */
export interface ConversationData extends ConversationHeader {
  version: number;
  messageCount: number;
  messages: AIOpsMessage[];
}
