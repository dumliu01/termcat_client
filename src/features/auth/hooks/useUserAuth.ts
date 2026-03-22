/**
 * 用户认证与登录 Hook
 *
 * 管理用户状态、登录/登出流程、AI 模型列表、认证事件监听。
 */

import { useState, useCallback, useEffect } from 'react';
import { Host, User, TierType, HostGroup, ViewState, AIModelInfo, Proxy } from '@/utils/types';
import { hostService, StorageMode } from '@/core/host/hostService';
import { hostStorageService } from '@/core/host/hostStorageService';
import { authService } from '@/core/auth/authService';
import { apiService } from '@/base/http/api';
import { commerceService } from '@/core/commerce/commerceService';
import { PaymentOrder } from '@/core/commerce/paymentService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { builtinPluginManager } from '@/plugins/builtin';
import { AI_OPS_EVENTS } from '@/plugins/builtin/events';
import { useI18n } from '@/base/i18n/I18nContext';

const getDefaultGroups = (t: ReturnType<typeof useI18n>['t']): HostGroup[] => [
  { id: 'group_prod', name: t.dashboard.defaultGroupProduction, color: '#ef4444' },
  { id: 'group_dev', name: t.dashboard.defaultGroupDevelopment, color: '#10b981' },
];

const getDefaultHosts = (_t: ReturnType<typeof useI18n>['t']): Host[] => [];
// 本地终端已内置，不再自动创建 127.0.0.1 SSH 主机

interface UseUserAuthDeps {
  setHosts: (hosts: Host[]) => void;
  setGroups: (groups: HostGroup[]) => void;
  setProxies: (proxies: Proxy[]) => void;
  setStorageMode: (mode: 'local' | 'server') => void;
  loadProxies: () => Promise<void>;
  resetSessions: () => void;
  setActiveView: (v: ViewState) => void;
}

export function useUserAuth(deps: UseUserAuthDeps) {
  const { t } = useI18n();
  const { setHosts, setGroups, setProxies, setStorageMode, loadProxies, resetSessions, setActiveView } = deps;

  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  // AI 可用模型/模式列表（全局共享，登录时拉取一次）
  const [availableModels, setAvailableModels] = useState<AIModelInfo[]>([]);
  const [availableModes, setAvailableModes] = useState<string[]>(['ask', 'agent']);
  const [showCloudSyncPrompt, setShowCloudSyncPrompt] = useState(false);

  // 从服务端获取 AI 可用模型列表
  const fetchAIModels = useCallback(async () => {
    try {
      const response = await apiService.getAIModels();
      if (response.success && response.data) {
        setAvailableModels(response.data.models || []);
        if (response.data.modes && Array.isArray(response.data.modes)) {
          const modes = (response.data.modes as Array<{ mode: string }>).map(m =>
            m.mode === 'normal' ? 'ask' : m.mode
          );
          if (modes.length > 0) setAvailableModes(modes);
        }
        logger.info(LOG_MODULE.APP, 'app.ai_models.fetched', 'AI models fetched', {
          count: response.data.models?.length || 0,
          modes: response.data.modes?.length || 0,
        });
      }
    } catch (error) {
      logger.warn(LOG_MODULE.APP, 'app.ai_models.fetch_failed', 'Failed to fetch AI models', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // 监听认证失败事件（401错误）
  useEffect(() => {
    const unsubscribe = authService.onAuthFailed(() => {
      logger.info(LOG_MODULE.APP, 'app.auth.failed', 'Auth failed, showing login view', {
        module: LOG_MODULE.AUTH,
      });
      setUser(null);
      setShowLogin(true);
      setActiveView('dashboard');
    });
    return () => unsubscribe();
  }, [setActiveView]);

  // 监听 AI Ops 插件的宝石余额更新事件
  useEffect(() => {
    const disposable = builtinPluginManager.on(AI_OPS_EVENTS.GEMS_UPDATED, (payload) => {
      const newBalance = payload as number;
      setUser(prev => {
        if (!prev) return null;
        const updated = { ...prev, gems: newBalance };
        authService.setUser(updated);
        return updated;
      });
    });
    return () => disposable.dispose();
  }, []);

  const updateUserState = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const newUser = { ...prev, ...updates };
      authService.setUser(newUser);
      return newUser;
    });
  }, []);

  const handleOpenPayment = useCallback((type: 'bones' | 'gems' | 'vip_month' | 'vip_year', amount: number, tierId?: string) => {
    return { type, amount, tierId };
  }, []);

  const handlePaymentSuccess = useCallback((type: 'gems' | 'vip_month' | 'vip_year', order: PaymentOrder) => {
    if (type === 'gems') {
      setUser(prev => {
        if (!prev) return prev;
        const newUser = { ...prev, gems: (prev.gems || 0) + order.gems };
        authService.setUser(newUser);
        return newUser;
      });
    } else {
      const tierExpiry = order.tier_days > 0
        ? new Date(Date.now() + order.tier_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : undefined;
      setUser(prev => {
        if (!prev) return prev;
        const newUser = { ...prev, tier: (order.tier_type || 'Pro') as TierType, tierExpiry };
        authService.setUser(newUser);
        return newUser;
      });
    }
    // 从服务端拉取最新用户信息，确保数据准确
    // getUserProfile 返回 { user, seqs }
    apiService.getUserProfile().then((resp: any) => {
      const profile = resp?.user ?? resp;
      if (profile) {
        setUser(prev => {
          if (!prev) return prev;
          const newUser = {
            ...prev,
            gems: profile.gems ?? prev.gems,
            tier: (profile.tier || 'Standard') as TierType,
            tierExpiry: profile.tier_expiry || undefined,
          };
          authService.setUser(newUser);
          return newUser;
        });
      }
    }).catch(() => {});
  }, []);

  const handleLogin = useCallback(async (newUser: User | null) => {
    if (newUser) {
      const userWithGems = {
        ...newUser,
        gems: newUser.gems ?? 10,
        tier: newUser.tier ?? 'Standard'
      };
      setUser(userWithGems);
      authService.setUser(userWithGems);
      // 启动自动续期
      authService.startAutoRefresh(() => apiService.refreshToken());

      // 新登录不做增量同步回调（handleLogin 内已全量拉取）
      // App.tsx init 路径会配置带 seqs 回调的 auto-refresh

      // 切换用户时，关闭上一个用户/游客遗留的终端会话
      resetSessions();
      setActiveView('dashboard');

      // 切换到该用户的存储作用域
      hostService.setUserScope(userWithGems.id);

      // 读取用户上次选择的存储模式
      const savedMode = hostService.getMode();
      const useLocal = savedMode === StorageMode.LOCAL;
      setStorageMode(useLocal ? 'local' : 'server');
      hostService.setMode(useLocal ? StorageMode.LOCAL : StorageMode.CLOUD);

      logger.info(LOG_MODULE.APP, 'app.login.sync_start', 'Starting post-login data load', {
        user_id: userWithGems.id,
        storage_mode: useLocal ? 'local' : 'cloud',
      });

      // 并行拉取所有用户数据：hosts, groups, proxies, AI models
      const [hostResult, groupsResult, proxiesResult] = await Promise.allSettled([
        hostService.getHosts().then(hosts => ({ success: true as const, hosts, error: undefined })),
        hostService.getGroups(),
        useLocal ? Promise.resolve([]) : apiService.getProxies(),
      ]);

      // 同步刷新 hosts
      if (hostResult.status === 'fulfilled' && hostResult.value.success) {
        setHosts(hostResult.value.hosts);
        logger.info(LOG_MODULE.APP, 'app.login.hosts_synced', 'Hosts synced after login', {
          hosts_count: hostResult.value.hosts.length,
        });
      } else {
        const error = hostResult.status === 'rejected'
          ? (hostResult.reason instanceof Error ? hostResult.reason.message : 'Unknown error')
          : hostResult.value.error;
        logger.warn(LOG_MODULE.APP, 'app.login.hosts_sync_failed', 'Failed to sync hosts after login', {
          error,
        });
      }

      // 同步刷新 groups
      if (groupsResult.status === 'fulfilled' && groupsResult.value.length > 0) {
        setGroups(groupsResult.value);
        logger.info(LOG_MODULE.APP, 'app.login.groups_synced', 'Groups synced after login', {
          groups_count: groupsResult.value.length,
        });
      } else if (groupsResult.status === 'rejected') {
        logger.warn(LOG_MODULE.APP, 'app.login.groups_sync_failed', 'Failed to sync groups after login', {
          error: groupsResult.reason instanceof Error ? groupsResult.reason.message : 'Unknown error',
        });
      }

      // 同步刷新代理列表
      if (proxiesResult.status === 'fulfilled') {
        setProxies(proxiesResult.value);
        logger.info(LOG_MODULE.APP, 'app.login.proxies_synced', 'Proxies synced after login', {
          proxies_count: proxiesResult.value.length,
        });
      } else {
        logger.warn(LOG_MODULE.APP, 'app.login.proxies_sync_failed', 'Failed to sync proxies after login', {
          error: proxiesResult.reason instanceof Error ? proxiesResult.reason.message : 'Unknown error',
        });
      }

      // 新账号首次登录，如果本地 hosts 为空则创建默认 localhost
      const loginHosts = hostResult.status === 'fulfilled' && hostResult.value.success ? hostResult.value.hosts : [];
      if (loginHosts.length === 0) {
        const defaultHosts = getDefaultHosts(t);
        for (const host of defaultHosts) {
          await hostService.addHost(host);
        }
        setHosts(defaultHosts);
      }

      // 商业化配置（不阻塞登录流程）
      commerceService.fetchConfig();

      // AI 模型列表（不阻塞登录流程）
      fetchAIModels();

      // 获取并保存 seqs，使下次启动可以走增量同步
      apiService.getUserProfile().then((resp: any) => {
        if (resp?.seqs) {
          hostStorageService.saveSeqs(resp.seqs);
        }
      }).catch(() => {});

      // 首次登录提示：该用户从未选择过存储模式 → 提示开启云端同步
      const CLOUD_PROMPTED_KEY = `termcat_cloud_prompted_${userWithGems.id}`;
      if (!localStorage.getItem(CLOUD_PROMPTED_KEY)) {
        localStorage.setItem(CLOUD_PROMPTED_KEY, '1');
        // 仅当前是本地模式时才提示（已经是云端的不需要提示）
        if (useLocal) {
          setShowCloudSyncPrompt(true);
        }
      }
    } else {
      // 游客模式：关闭上一个用户遗留的终端会话
      resetSessions();
      setActiveView('dashboard');

      // 切换到游客存储作用域并加载游客数据
      hostService.setUserScope(null);
      hostService.setMode(StorageMode.LOCAL);
      const guestHosts = await hostService.getHosts();
      setHosts(guestHosts);
      const guestGroups = await hostService.getGroups();
      if (guestGroups.length > 0) {
        setGroups(guestGroups);
      } else {
        const defaults = getDefaultGroups(t);
        setGroups(defaults);
        for (const group of defaults) {
          await hostService.addGroup(group);
        }
      }
      if (guestHosts.length === 0) {
        const defaultHosts = getDefaultHosts(t);
        for (const host of defaultHosts) {
          await hostService.addHost(host);
        }
        setHosts(defaultHosts);
      }
    }
    setShowLogin(false);
  }, [t, setHosts, setGroups, setProxies, setStorageMode, resetSessions, setActiveView, fetchAIModels]);

  const handleLogout = useCallback(async (clearServerCache?: boolean) => {
    // 在 logout 清除 token 之前获取 userId，用于清除服务器缓存
    const currentUser = authService.getUser();
    if (clearServerCache && currentUser?.id) {
      hostStorageService.clearServerCache(currentUser.id);
    }

    setUser(null);
    authService.logout();
    commerceService.clear();
    resetSessions();
    setActiveView('dashboard');
    setShowLogin(true);

    // 退出登录时，切换到游客存储作用域和本地模式
    hostService.setUserScope(null);
    hostService.setMode(StorageMode.LOCAL);

    const guestHosts = await hostService.getHosts();
    setHosts(guestHosts);
    const guestGroups = await hostService.getGroups();
    if (guestGroups.length > 0) {
      setGroups(guestGroups);
    } else {
      const defaults = getDefaultGroups(t);
      setGroups(defaults);
      for (const group of defaults) {
        await hostService.addGroup(group);
      }
    }
    if (guestHosts.length === 0) {
      const defaultHosts = getDefaultHosts(t);
      for (const host of defaultHosts) {
        await hostService.addHost(host);
      }
      setHosts(defaultHosts);
    }
  }, [t, setHosts, setGroups, resetSessions, setActiveView]);

  return {
    user,
    setUser,
    showLogin,
    setShowLogin,
    availableModels,
    availableModes,
    fetchAIModels,
    updateUserState,
    handleLogin,
    handleLogout,
    handlePaymentSuccess,
    getDefaultGroups,
    getDefaultHosts,
    showCloudSyncPrompt,
    setShowCloudSyncPrompt,
  };
}
