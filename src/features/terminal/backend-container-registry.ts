/**
 * Reverse index from a terminal backend's id (ptyId for local PTY,
 * connectionId for SSH) to the DOM element wrapping its xterm.
 *
 * Background: plugins receive `sessionId` via `pluginManager.registerTerminal`,
 * which is the backend id (see main.ts where local-pty-create / ssh-create-shell
 * both register with `sessionId: <backendId>`). But TerminalHostLayer keys its
 * portal containers by the *renderer-generated* `Session.id` (random 9-char
 * string from useSessionManager). The two namespaces never match, so any
 * `api.terminal.focus(sessionId)` from a plugin previously hit a `Map.get` miss
 * and silently no-op'd. This registry bridges them: TerminalView registers its
 * backend id when ready, and the focus handler falls back to it.
 */

const containers = new Map<string, HTMLElement>();

export function registerBackendContainer(backendId: string, container: HTMLElement): void {
  if (!backendId) return;
  containers.set(backendId, container);
}

export function unregisterBackendContainer(backendId: string): void {
  if (!backendId) return;
  containers.delete(backendId);
}

export function getBackendContainer(backendId: string): HTMLElement | undefined {
  return containers.get(backendId);
}
