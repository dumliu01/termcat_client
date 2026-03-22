/**
 * 会话记录持久化服务（Main 进程）
 *
 * 使用 JSONL（JSON Lines）格式存储：
 * - 第1行：header（会话元信息）
 * - 后续行：msg（消息），支持追加写入
 *
 * 存储路径：~/.termcat/chat_records/<userId>/conv_<userId>_<convId>_<timestamp>.dat
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LOG_MODULE } from '../base/logger/logger';

class ChatHistoryService {
  private getBasePath(): string {
    return path.join(app.getPath('home'), '.termcat', 'chat_records');
  }

  private getUserDir(userId: string): string {
    return path.join(this.getBasePath(), this.sanitize(userId));
  }

  private getFilePath(userId: string, convId: string, createdAt: number): string {
    const ts = Math.floor(createdAt / 1000);
    const fileName = `conv_${this.sanitize(userId)}_${this.sanitize(convId)}_${ts}.dat`;
    return path.join(this.getUserDir(userId), fileName);
  }

  /** 防止路径穿越 */
  private sanitize(input: string | number): string {
    return String(input).replace(/[\/\\\.]/g, '_');
  }

  /** 创建会话（写入 header 行） */
  async createConversation(header: any): Promise<string> {
    const dir = this.getUserDir(header.userId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = this.getFilePath(header.userId, header.convId, header.createdAt);
    const headerLine = JSON.stringify({ type: 'header', version: 1, ...header }) + '\n';
    await fs.writeFile(filePath, headerLine, 'utf-8');

    logger.info(LOG_MODULE.AI, 'chat_history.created', 'Conversation file created', {
      conv_id: header.convId,
      user_id: header.userId,
    });

    return path.basename(filePath);
  }

  /** 追加单条消息 */
  async appendMessage(userId: string, convId: string, createdAt: number, message: any): Promise<void> {
    const filePath = this.getFilePath(userId, convId, createdAt);
    const line = JSON.stringify({ type: 'msg', ...message }) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  }

  /** 批量追加消息 */
  async appendMessages(userId: string, convId: string, createdAt: number, messages: any[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    const filePath = this.getFilePath(userId, convId, createdAt);
    const lines = messages.map(msg => JSON.stringify({ type: 'msg', ...msg })).join('\n') + '\n';
    await fs.appendFile(filePath, lines, 'utf-8');
  }

  /** 更新 header 行（重写第一行，保留消息行不变） */
  async updateHeader(userId: string, convId: string, createdAt: number, updates: any): Promise<void> {
    const filePath = this.getFilePath(userId, convId, createdAt);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const firstNewline = raw.indexOf('\n');
      if (firstNewline === -1) return;

      const oldHeader = JSON.parse(raw.substring(0, firstNewline));
      const newHeader = { ...oldHeader, ...updates };
      const rest = raw.substring(firstNewline); // 包含 \n + 后续所有行
      await fs.writeFile(filePath, JSON.stringify(newHeader) + rest, 'utf-8');
    } catch {
      // 文件不存在或损坏，忽略
    }
  }

  /** 读取会话列表（只读每个文件第一行 header） */
  async listConversations(userId: string): Promise<any[]> {
    const dir = this.getUserDir(userId);
    try {
      const files = await fs.readdir(dir);
      const datFiles = files.filter(f => f.startsWith('conv_') && f.endsWith('.dat'));
      const metas: any[] = [];

      for (const fileName of datFiles) {
        try {
          const fullPath = path.join(dir, fileName);
          const header = await this.readFirstLine(fullPath);
          if (!header || header.type !== 'header') continue;

          const stat = await fs.stat(fullPath);
          metas.push({
            convId: header.convId,
            userId: header.userId,
            hostId: header.hostId,
            hostName: header.hostName,
            title: header.title,
            mode: header.mode,
            model: header.model,
            createdAt: header.createdAt,
            updatedAt: header.updatedAt,
            fileName,
            fileSize: stat.size,
          });
        } catch {
          // 跳过损坏文件
        }
      }

      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /** 读取完整会话（逐行解析） */
  async loadConversation(userId: string, fileName: string): Promise<any | null> {
    // 安全检查：防止路径穿越
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return null;
    }
    const filePath = path.join(this.getUserDir(userId), fileName);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const lines = raw.split('\n').filter(line => line.trim());
      let header: any = null;
      const messages: any[] = [];

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'header') {
            header = obj;
          } else if (obj.type === 'msg') {
            const { type, ...msg } = obj;
            messages.push(msg);
          }
        } catch {
          // 跳过损坏行
        }
      }

      if (!header) return null;

      return {
        ...header,
        messageCount: messages.length,
        messages,
      };
    } catch {
      return null;
    }
  }

  /** 删除会话文件 */
  async deleteConversation(userId: string, fileName: string): Promise<boolean> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return false;
    }
    const filePath = path.join(this.getUserDir(userId), fileName);
    try {
      await fs.unlink(filePath);
      logger.info(LOG_MODULE.AI, 'chat_history.deleted', 'Conversation file deleted', {
        user_id: userId,
        file_name: fileName,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** 辅助：只读文件第一行并解析为 JSON */
  private async readFirstLine(filePath: string): Promise<any> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const firstNewline = raw.indexOf('\n');
      const firstLine = firstNewline === -1 ? raw : raw.substring(0, firstNewline);
      return JSON.parse(firstLine);
    } catch {
      return null;
    }
  }

  /** 注册 IPC handlers */
  registerHandlers(): void {
    ipcMain.handle('chat-history:create', (_e, header) =>
      this.createConversation(header));
    ipcMain.handle('chat-history:append', (_e, userId, convId, createdAt, message) =>
      this.appendMessage(userId, convId, createdAt, message));
    ipcMain.handle('chat-history:append-batch', (_e, userId, convId, createdAt, messages) =>
      this.appendMessages(userId, convId, createdAt, messages));
    ipcMain.handle('chat-history:update-header', (_e, userId, convId, createdAt, updates) =>
      this.updateHeader(userId, convId, createdAt, updates));
    ipcMain.handle('chat-history:list', (_e, userId) =>
      this.listConversations(userId));
    ipcMain.handle('chat-history:load', (_e, userId, fileName) =>
      this.loadConversation(userId, fileName));
    ipcMain.handle('chat-history:delete', (_e, userId, fileName) =>
      this.deleteConversation(userId, fileName));

    logger.info(LOG_MODULE.MAIN, 'chat_history.handlers_registered', 'Chat history IPC handlers registered');
  }
}

export const chatHistoryService = new ChatHistoryService();
