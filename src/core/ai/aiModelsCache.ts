/**
 * AIModelsCache — local cache for /ai/get-models payload, keyed by version.
 *
 * Background:
 *   /ai/get-models is called once per login by useUserAuth, but the model
 *   list rarely changes. Bootstrap returns a cheap `ai_models_version`
 *   string; we compare it against the cached version and skip the network
 *   fetch when they match. On mismatch, callers fetch fresh data and write
 *   it back via put().
 *
 * Storage: localStorage, single key. The cache survives app restarts so a
 * fresh launch with cached token can render the AI mode picker without
 * waiting for /ai/get-models.
 */

const STORAGE_KEY = 'termcat_ai_models_cache';

export interface AIModelsCachePayload {
  /** Version string returned by the server (sha256 prefix of pricing yaml). */
  version: string;
  /** Raw `data` field from /ai/get-models response (models, modes, ...). */
  data: any;
}

class AIModelsCache {
  private payload: AIModelsCachePayload | null = null;
  private listeners: Array<(p: AIModelsCachePayload | null) => void> = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.version === 'string' && parsed.data) {
          this.payload = parsed;
        }
      }
    } catch {
      // Corrupted cache — ignore.
    }
  }

  get(): AIModelsCachePayload | null {
    return this.payload;
  }

  getVersion(): string | null {
    return this.payload?.version ?? null;
  }

  /**
   * Replace the cached payload and notify listeners.
   * Pass version='' to skip caching when the server version is unknown
   * (callers should still write data so listeners can update UI).
   */
  put(version: string, data: any): void {
    this.payload = { version, data };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.payload));
    } catch {
      // Quota or serialization error — keep in-memory copy regardless.
    }
    this.notify();
  }

  clear(): void {
    this.payload = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  /** Subscribe to cache changes; returns an unsubscribe function. */
  onChange(listener: (p: AIModelsCachePayload | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => {
      try { l(this.payload); } catch { /* listener failures are isolated */ }
    });
  }
}

export const aiModelsCache = new AIModelsCache();
