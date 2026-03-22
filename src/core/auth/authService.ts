import { User } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/** 客户端保底最小续期间隔（分钟） */
const MIN_REFRESH_INTERVAL_MINUTES = 30;
/** 默认续期间隔（分钟），服务端未返回时使用 */
const DEFAULT_REFRESH_INTERVAL_MINUTES = 60;

/**
 * 认证服务
 * 管理用户认证状态、token 存储、自动续期等
 */
class AuthService {
  private readonly TOKEN_KEY = 'termcat_auth_token';
  private readonly USER_KEY = 'termcat_user';
  private authFailedListeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshFn: (() => Promise<{ token: string; refresh_interval_minutes: number; seqs?: any }>) | null = null;
  private onSeqsUpdated: ((seqs: any) => void) | null = null;

  /**
   * 保存 token
   */
  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  /**
   * 获取 token
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * 移除 token
   */
  removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * 保存用户信息
   */
  setUser(user: User): void {
    // 保存 token
    if (user.token) {
      this.setToken(user.token);
    }

    // 保存用户信息（不包含 token，避免重复存储）
    const { token, ...userWithoutToken } = user;
    localStorage.setItem(this.USER_KEY, JSON.stringify(userWithoutToken));
  }

  /**
   * 获取用户信息
   */
  getUser(): User | null {
    try {
      const userJson = localStorage.getItem(this.USER_KEY);
      if (!userJson) return null;

      const user = JSON.parse(userJson);
      const token = this.getToken();

      // 合并 token
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
   * 移除用户信息
   */
  removeUser(): void {
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * 登出
   */
  logout(): void {
    this.stopAutoRefresh();
    this.removeToken();
    this.removeUser();
  }

  /**
   * 清空所有认证数据
   */
  clear(): void {
    this.logout();
  }

  /**
   * 注册认证失败监听器
   * 当收到401错误时会调用这些监听器
   */
  onAuthFailed(listener: () => void): () => void {
    this.authFailedListeners.push(listener);
    // 返回取消监听的函数
    return () => {
      this.authFailedListeners = this.authFailedListeners.filter(l => l !== listener);
    };
  }

  /**
   * 触发认证失败事件
   * 在收到401错误时调用
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
   * 启动自动续期定时器
   * @param refreshFn 调用服务端 /auth/refresh 的函数
   * @param intervalMinutes 服务端返回的续期间隔（分钟），保底不小于 30 分钟
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
   * 停止自动续期定时器
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshFn = null;
  }

  /**
   * 执行一次 token 续期
   */
  private async doRefresh(): Promise<void> {
    if (!this.refreshFn || !this.isAuthenticated()) {
      this.stopAutoRefresh();
      return;
    }

    try {
      const result = await this.refreshFn();
      this.setToken(result.token);

      // 通知 seqs 更新（由调用方处理增量同步）
      if (result.seqs && this.onSeqsUpdated) {
        this.onSeqsUpdated(result.seqs);
      }

      // 如果服务端返回了新的续期间隔，动态调整定时器
      const newInterval = Math.max(
        result.refresh_interval_minutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES,
        MIN_REFRESH_INTERVAL_MINUTES,
      );

      logger.info(LOG_MODULE.AUTH, 'auth.auto_refresh.success', 'Token refreshed successfully', {
        next_interval_minutes: newInterval,
      });

      // 重新设置定时器（间隔可能变了）
      if (this.refreshFn) {
        const fn = this.refreshFn;
        this.stopAutoRefresh();
        this.startAutoRefresh(fn, newInterval);
      }
    } catch (error) {
      logger.warn(LOG_MODULE.AUTH, 'auth.auto_refresh.failed', 'Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // 续期失败不立即踢出，等下次请求 401 时再处理
    }
  }
}

export const authService = new AuthService();
