/**
 * Lightweight EventEmitter Implementation
 *
 * Alternative to Node.js 'events' module, runs in both browser (Vite) and Node.js environments.
 * API compatible with Node.js EventEmitter (only implements required subset).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Listener = (...args: any[]) => void;

export class EventEmitter {
  private _events: Map<string, Listener[]> = new Map();

  on(event: string, listener: Listener): this {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event)!.push(listener);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this._events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this._events.delete(event);
      }
    }
    return this;
  }

  once(event: string, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    return this.on(event, wrapper);
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this._events.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }
    for (const listener of [...listeners]) {
      try {
        listener.apply(this, args);
      } catch {
        // ignore listener errors
      }
    }
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }

  listenerCount(event: string): number {
    return this._events.get(event)?.length ?? 0;
  }
}
