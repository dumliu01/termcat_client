/**
 * Conversation Record Utility Functions
 */

import { AIOpsMessage } from '@/features/terminal/types';

/** Serialize single message, strip base64 attachment content */
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

  // Attachments only keep metadata, do not persist base64 content
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
