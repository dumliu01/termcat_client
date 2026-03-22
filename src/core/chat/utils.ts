/**
 * 会话记录工具函数
 */

import { AIOpsMessage } from '@/features/terminal/types';

/** 序列化单条消息，剥离 base64 附件内容 */
export function serializeMsg(msg: AIOpsMessage): any {
  const result: any = {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  };

  if (msg.suggestion) {
    result.suggestion = msg.suggestion;
  }

  if (msg.taskState) {
    result.taskState = msg.taskState;
  }

  // 附件只保留元信息，不持久化 base64 内容
  if (msg.files && msg.files.length > 0) {
    result.files = msg.files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
  }

  return result;
}
