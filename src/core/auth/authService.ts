import { User } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/** Client-side minimum refresh interval (minutes) */
const MIN_REFRESH_INTERVAL_MINUTES = 30;
/** Default refresh interval (minutes), used when server doesn't return */
const DEFAULT_REFRESH_INTERVAL_MINUTES = 60;

/**
 * Authentication Service
 * Manages user authentication state, token storage, auto-refresh, etc.
 */
class AuthService {
  private readonly TOKEN_KEY = 'termcat_auth_token';
  private readonly USER_KEY = 'termcat_user';
  private authFailedListeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshFn: (() => Promise<{ token: string; refresh_interval_minutes: number; seqs?: any }>) | null = null;
  private onSeqsUpdated: ((seqs: any) => void) | null = null;

  /**
   * Save token
   */
  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  /**
   * Get token
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Remove token
   */
  removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  /**
   * Check if logged in
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Save user info
   */
  setUser(user: User): void {
    // Save token
    if (user.token) {
      this.setToken(user.token);
    }

    // Save user info (does not include token to avoid duplicate storage)
    const { token, ...userWithoutToken } = user;
    localStorage.setItem(this.USER_KEY, JSON.stringify(userWithoutToken));
  }

  /**
   * Get user info
   */
  getUser(): User | null {
    try {
      const userJson = localStorage.getItem(this.USER_KEY);
      if (!userJson) return null;

      const user = JSON.parse(userJson);
      const token = this.getToken();

      // Merge token
      if (token) {
        user.token = token;
      }

      return user;
    } catch (error) {
      logger.error(LOG_MODULE.AUTH, 'auth.get_user_failed', 'Failed to get user from storage', {
        error: 1,
        msg: (error as Error).message || 'Failed to get user from storage',
      });
      return null;
    }
  }

  /**
   * Remove user info
   */
  removeUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Logout
   */
  logout(): void {
    this.stopAutoRefresh();
    this.removeToken();
    this.removeUser();
  }

  /**
   * Clear all authentication data
   */
  clear(): void {
    this.logout();
  }

  /**
   * Register authentication failure listener
   * Called when 401 error is received
   */
  onAuthFailed(listener: () => void): () => void {
    this.authFailedListeners.push(listener);
    // Return function to unsubscribe
    return () => {
      this.authFailedListeners = this.authFailedListeners.filter(l => l !== listener);
    };
  }

  /**
   * Trigger authentication failure event
   * Called when 401 error is received
   */
  notifyAuthFailed(): void {
    logger.info(LOG_MODULE.AUTH, 'auth.failed', 'Authentication failed', {
      error: 0,
      listeners_count: this.authFailedListeners.length,
    });
    this.authFailedListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        logger.error(LOG_MODULE.AUTH, 'auth.listener_error', 'Auth listener error', {
          error: 1,
          msg: (error as Error).message || 'Error in auth failed listener',
        });
      }
    });
  }

  /**
   * Start auto-refresh timer
   * @param refreshFn Function to call server /auth/refresh
   * @param intervalMinutes Server-returned refresh interval (minutes), minimum 30 minutes
   */
  startAutoRefresh(
    refreshFn: () => Promise<{ token: string; refresh_interval_minutes: number; seqs?: any }>,
    intervalMinutes?: number,
    onSeqsUpdated?: (seqs: any) => void,
  ): void {
    this.onSeqsUpdated = onSeqsUpdated ?? null;
    this.stopAutoRefresh();
    this.refreshFn = refreshFn;

    const interval = Math.max(intervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);
    const intervalMs = interval * 60 * 1000;

    logger.info(LOG_MODULE.AUTH, 'auth.auto_refresh.start', 'Token auto-refresh started', {
      interval_minutes: interval,
    });

    this.refreshTimer = setInterval(() => {
      this.doRefresh();
    }, intervalMs);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshFn = null;
  }

  /**
   * Perform one token refresh
   */
  private async doRefresh(): Promise<void> {
    if (!this.refreshFn || !this.isAuthenticated()) {
      this.stopAutoRefresh();
      return;
    }

    try {
      const result = await this.refreshFn();
      this.setToken(result.token);

      // Notify seqs update (handled by caller for incremental sync)
      if (result.seqs && this.onSeqsUpdated) {
        this.onSeqsUpdated(result.seqs);
      }

      // If server returns new refresh interval, dynamically adjust timer
      const newInterval = Math.max(
        result.refresh_interval_minutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES,
        MIN_REFRESH_INTERVAL_MINUTES,
      );

      logger.info(LOG_MODULE.AUTH, 'auth.auto_refresh.success', 'Token refreshed successfully', {
        next_interval_minutes: newInterval,
      });

      // Reset timer (interval may have changed)
      if (this.refreshFn) {
        const fn = this.refreshFn;
        this.stopAutoRefresh();
        this.startAutoRefresh(fn, newInterval);
      }
    } catch (error) {
      logger.warn(LOG_MODULE.AUTH, 'auth.auto_refresh.failed', 'Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Refresh failure doesn't kick out immediately, wait for next 401
    }
  }
}

export const authService = new AuthService();
