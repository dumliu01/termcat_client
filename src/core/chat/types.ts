/**
 * AI Conversation Record Type Definitions
 *
 * .dat files use JSONL (JSON Lines) format:
 * - Line 1: header (conversation metadata)
 * - Line 2+: msg (message records), supports append writing
 */

import { AIOpsMessage } from '@/features/terminal/types';

/** Header line data structure (written to first line of .dat file) */
export interface ConversationHeader {
  convId: string;           // Conversation UUID
  userId: string;           // User ID
  hostId: string;           // Associated host ID
  hostName: string;         // Host name
  title: string;            // Conversation title (first 30 chars of first user message)
  mode: 'ask' | 'agent' | 'code' | 'x-agent';   // Conversation mode
  model: string;            // AI model name
  createdAt: number;        // Conversation creation time (ms)
  updatedAt: number;        // Last update time (ms)
}

/** Conversation list item (header + file-level info, no messages) */
export interface ConversationMeta extends ConversationHeader {
  fileName: string;         // File name (for loading/deletion)
  fileSize: number;         // File size (bytes)
}

/** Complete conversation data (header + messages, assembled on load) */
export interface ConversationData extends ConversationHeader {
  version: number;
  messageCount: number;
  messages: AIOpsMessage[];
}
