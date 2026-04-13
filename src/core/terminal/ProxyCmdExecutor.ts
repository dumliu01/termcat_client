/**
 * ProxyCmdExecutor — transparent command execution proxy
 *
 * Routes execute() calls to either the original SSH executor or a
 * terminal-based executor depending on nested SSH state.
 * Upper layers call execute() without knowing which backend is active.
 */

import type { CmdResult, ICmdExecutor } from './ICmdExecutor';

export class ProxyCmdExecutor implements ICmdExecutor {
  private _original: ICmdExecutor;
  private _nested: ICmdExecutor | null = null;
  private _isNested = false;

  constructor(original: ICmdExecutor) {
    this._original = original;
  }

  async execute(command: string): Promise<CmdResult> {
    if (this._isNested && this._nested) {
      return this._nested.execute(command);
    }
    return this._original.execute(command);
  }

  /** Switch to nested mode (internal, called by SSHHostConnection / LocalHostConnection) */
  _switchToNested(executor: ICmdExecutor): void {
    this._nested = executor;
    this._isNested = true;
  }

  /** Restore original mode (internal, called by SSHHostConnection / LocalHostConnection) */
  _switchToOriginal(): void {
    this._isNested = false;
    this._nested = null;
  }

  /** Whether currently in nested mode */
  get isNested(): boolean {
    return this._isNested;
  }
}
