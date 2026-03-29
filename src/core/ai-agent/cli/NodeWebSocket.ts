/**
 * Node.js WebSocket Adapter
 *
 * Injects ws package as globalThis.WebSocket, enabling AIAgentConnection to run in Node.js environment.
 * Must call installWebSocket() before importing AIAgentConnection.
 */

import WebSocket from 'ws';

export function installWebSocket(): void {
  if (typeof globalThis.WebSocket === 'undefined') {
    (globalThis as any).WebSocket = WebSocket;
  }
}
