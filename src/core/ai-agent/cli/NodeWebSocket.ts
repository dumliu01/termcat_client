/**
 * Node.js WebSocket 适配器
 *
 * 将 ws 包注入为 globalThis.WebSocket，使 AIAgentConnection 能在 Node.js 环境下运行。
 * 必须在 import AIAgentConnection 之前调用 installWebSocket()。
 */

import WebSocket from 'ws';

export function installWebSocket(): void {
  if (typeof globalThis.WebSocket === 'undefined') {
    (globalThis as any).WebSocket = WebSocket;
  }
}
