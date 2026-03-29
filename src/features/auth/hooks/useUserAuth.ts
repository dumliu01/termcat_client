/**
 * User Authentication and Login Hook
 *
 * Manages user state, login/logout flow, AI model list, and authentication event listening.
 */

import { useState, useCallback, useEffect } from 'react';
import { Host, User, TierType, HostGroup, ViewState, AIModelInfo, AIModeInfo, Proxy } from '@/utils/types';
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
import { licenseService } from '@/core/license/licenseService';

const getDefaultGroups = (t: ReturnType<typeof useI18n>['t']): HostGroup[] => [
  { id: 'group_prod', name: t.dashboard.defaultGroupProduction, color: '#ef4444' },
  { id: 'group_dev', name: t.dashboard.defaultGroupDevelopment, color: '#10b981' },
];

const getDefaultHosts = (_t: ReturnType<typeof useI18n>['t']): Host[] => [];
// Local terminal is built-in, no need to auto-create 127.0.0.1 SSH host

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

  // AI available models/modes list (globally shared, fetched once on login)
  const [availableModels, setAvailableModels] = useState<AIModelInfo[]>([]);
  const [availableModes, setAvailableModes] = useState<string[]>(['ask', 'agent', 'x-agent']);
  const [availableModeInfos, setAvailableModeInfos] = useState<AIModeInfo[]>([]);
  const [showCloudSyncPrompt, setShowCloudSyncPrompt] = useState(false);

  // Built-in mode display info
  const MODE_DISPLAY: Record<string, { name: string; icon: string }> = {
    ask:   { name: 'Ask',   icon: 'zap' },
    agent: { name: 'Agent', icon: 'brain-circuit' },
    code:  { name: 'Code',  icon: 'code-2' },
    codex: { name: 'X-Agent', icon: 'zap' },
  };

  // Fetch AI available models list from server
  const fetchAIModels = useCallback(async () => {
    try {
      const response = await apiService.getAIModels();
      if (response.success && response.data) {
        setAvailableModels(response.data.models || []);
        if (response.data.modes && Array.isArray(response.data.modes)) {
          const modeInfos: AIModeInfo[] = (response.data.modes as Array<{ mode: string; cost_per_question?: number; allowed_models?: string[] }>).map(m => {
            const modeId = m.mode === 'normal' ? 'ask' : m.mode;
            const display = MODE_DISPLAY[modeId] || { name: modeId, icon: 'zap' };
            return {
              id: modeId,
              name: display.name,
              icon: display.icon,
              allowedModels: m.allowed_models && m.allowed_models.length > 0 ? m.allowed_models : undefined,
              costPerQuestion: m.cost_per_question,
              source: 'server' as const,
            };
          });
          if (modeInfos.length > 0) {
            setAvailableModeInfos(modeInfos);
            setAvailableModes(modeInfos.map(m => m.id));
          }
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

  // Listen for authentication failure events (401 error)
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

  // Listen for gem balance update events from AI Ops plugin
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

  // License change listener: re-check and inject locked status into plugin modes
  useEffect(() => {
    const unsubscribe = licenseService.onChange(() => {
      // Re-enrich mode infos with latest license status (driven by pluginData.licenseFeature)
      setAvailableModeInfos(prev => prev.map(mode => {
        const licenseFeature = mode.pluginData?.licenseFeature;
        if (licenseFeature) {
          return {
            ...mode,
            locked: !licenseService.isFeatureUnlocked(licenseFeature),
            price: mode.pluginData?.licensePrice,
          };
        }
        return mode;
      }));
    });
    return unsubscribe;
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

  const handlePaymentSuccess = useCallback((type: 'gems' | 'vip_month' | 'vip_year' | 'agent_pack', order: PaymentOrder) => {
    if (type === 'gems') {
      setUser(prev => {
        if (!prev) return prev;
        const newUser = { ...prev, gems: (prev.gems || 0) + order.gems };
        authService.setUser(newUser);
        return newUser;
      });
    } else if (type === 'agent_pack') {
      // Force refresh license cache so agent modes get unlocked
      licenseService.checkLicense(true).catch(() => {});
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
    // Pull latest user info from server to ensure data accuracy
    // getUserProfile returns { user, seqs }
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
      // Start auto-refresh
      authService.startAutoRefresh(() => apiService.refreshToken());

      // New login, no incremental sync callback needed (full fetch already done in handleLogin)
      // App.tsx init path will configure auto-refresh with seqs callback

      // When switching users, close terminal sessions left by previous user/guest
      resetSessions();
      setActiveView('dashboard');

      // Switch to this user's storage scope
      hostService.setUserScope(userWithGems.id);

      // Read user's last selected storage mode
      const savedMode = hostService.getMode();
      const useLocal = savedMode === StorageMode.LOCAL;
      setStorageMode(useLocal ? 'local' : 'server');
      hostService.setMode(useLocal ? StorageMode.LOCAL : StorageMode.CLOUD);

      logger.info(LOG_MODULE.APP, 'app.login.sync_start', 'Starting post-login data load', {
        user_id: userWithGems.id,
        storage_mode: useLocal ? 'local' : 'cloud',
      });

      // Fetch all user data in parallel: hosts, groups, proxies, AI models
      const [hostResult, groupsResult, proxiesResult] = await Promise.allSettled([
        hostService.getHosts().then(hosts => ({ success: true as const, hosts, error: undefined })),
        hostService.getGroups(),
        useLocal ? Promise.resolve([]) : apiService.getProxies(),
      ]);

      // Sync refresh hosts
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

      // Sync refresh groups
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

      // Sync refresh proxy list
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

      // First-time login for new account: if local hosts are empty, create default localhost
      const loginHosts = hostResult.status === 'fulfilled' && hostResult.value.success ? hostResult.value.hosts : [];
      if (loginHosts.length === 0) {
        const defaultHosts = getDefaultHosts(t);
        for (const host of defaultHosts) {
          await hostService.addHost(host);
        }
        setHosts(defaultHosts);
      }

      // Commerce config (non-blocking for login flow)
      commerceService.fetchConfig();

      // AI model list (non-blocking for login flow)
      fetchAIModels();

      // License check (force refresh to sync with server)
      licenseService.checkLicense(true);

      // Get and save seqs, so next startup can do incremental sync
      apiService.getUserProfile().then((resp: any) => {
        if (resp?.seqs) {
          hostStorageService.saveSeqs(resp.seqs);
        }
      }).catch(() => {});

      // First login prompt: if this user has never selected a storage mode -> prompt to enable cloud sync
      const CLOUD_PROMPTED_KEY = `termcat_cloud_prompted_${userWithGems.id}`;
      if (!localStorage.getItem(CLOUD_PROMPTED_KEY)) {
        localStorage.setItem(CLOUD_PROMPTED_KEY, '1');
        // Only prompt when currently in local mode (already in cloud mode doesn't need prompt)
        if (useLocal) {
          setShowCloudSyncPrompt(true);
        }
      }
    } else {
      // Guest mode: close terminal sessions left by previous user
      resetSessions();
      setActiveView('dashboard');

      // Switch to guest storage scope and load guest data
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
    // Get userId before clearing token in logout, for clearing server cache
    const currentUser = authService.getUser();
    if (clearServerCache && currentUser?.id) {
      hostStorageService.clearServerCache(currentUser.id);
    }

    setUser(null);
    authService.logout();
    commerceService.clear();
    licenseService.clear();
    resetSessions();
    setActiveView('dashboard');
    setShowLogin(true);

    // On logout, switch to guest storage scope and local mode
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
    availableModeInfos,
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
