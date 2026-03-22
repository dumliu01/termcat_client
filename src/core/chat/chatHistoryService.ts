/**
 * 会话记录服务（Renderer 进程）
 *
 * 通过 IPC 桥接调用 Main 进程的文件读写操作。
 */

import { ConversationMeta, ConversationData, ConversationHeader } from './types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

class ChatHistoryClientService {
  /** 检查 IPC 桥是否可用 */
  private get ipc() {
    const api = window.electron?.chatHistory;
    if (!api) {
      logger.warn(LOG_MODULE.AI, 'chat_history.ipc_unavailable', 'chatHistory IPC bridge not available');
    }
    return api;
  }

  /** 创建新会话（写入 header 行） */
  async create(header: ConversationHeader): Promise<string> {
    const api = this.ipc;
    if (!api) return '';
    return await api.create(header);
  }

  /** 追加单条消息到会话文件末尾 */
  async appendMessage(userId: string, convId: string, createdAt: number, message: any): Promise<void> {
    const api = this.ipc;
    if (!api) return;
    await api.append(userId, convId, createdAt, message);
  }

  /** 批量追加消息 */
  async appendMessages(userId: string, convId: string, createdAt: number, messages: any[]): Promise<void> {
    const api = this.ipc;
    if (!api) return;
    await api.appendBatch(userId, convId, createdAt, messages);
  }

  /** 更新 header 元信息（如 updatedAt） */
  async updateHeader(userId: string, convId: string, createdAt: number, updates: Partial<ConversationHeader>): Promise<void> {
    const api = this.ipc;
    if (!api) return;
    await api.updateHeader(userId, convId, createdAt, updates);
  }

  /** 获取会话列表（仅 header 信息） */
  async list(userId: string): Promise<ConversationMeta[]> {
    const api = this.ipc;
    if (!api) return [];
    return await api.list(userId);
  }

  /** 加载完整会话（header + 全部消息） */
  async load(userId: string, fileName: string): Promise<ConversationData | null> {
    const api = this.ipc;
    if (!api) return null;
    return await api.load(userId, fileName);
  }

  /** 删除会话文件 */
  async delete(userId: string, fileName: string): Promise<boolean> {
    const api = this.ipc;
    if (!api) return false;
    return await api.delete(userId, fileName);
  }
}

export const chatHistoryClientService = new ChatHistoryClientService();
