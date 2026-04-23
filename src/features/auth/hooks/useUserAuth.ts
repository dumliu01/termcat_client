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
import { aiModelsCache, AIModelsCachePayload } from '@/core/ai/aiModelsCache';
import { bootstrapService } from '@/core/bootstrap/bootstrapService';
import type { LoginResponseWithSeqs } from '@/core/commerce/types';

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

  // Apply a /ai/get-models payload (or its cached copy) into React state.
  // Shared between manual fetchAIModels() and the aiModelsCache subscription
  // so cached startups render instantly without waiting on the network.
  const applyAIModelsData = useCallback((data: any) => {
    if (!data) return;
    setAvailableModels(data.models || []);
    if (data.modes && Array.isArray(data.modes)) {
      const modeInfos: AIModeInfo[] = (data.modes as Array<{ mode: string; cost_per_question?: number; allowed_models?: string[] }>).map(m => {
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
  }, []);

  // Manual refresh of the AI model list (e.g. user clicks "refresh" in settings).
  // The login / startup path no longer calls this — bootstrapService handles
  // model sync via aiModelsCache, which in turn drives applyAIModelsData here.
  const fetchAIModels = useCallback(async () => {
    try {
      const response = await apiService.getAIModels();
      if (response.success && response.data) {
        applyAIModelsData(response.data);
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
  }, [applyAIModelsData]);

  // Subscribe to aiModelsCache so bootstrap-triggered refreshes propagate to
  // local state. Also apply whatever's already in cache on mount, so a cached
  // startup paints the mode picker without waiting for any network call.
  useEffect(() => {
    applyAIModelsData(aiModelsCache.get()?.data);
    return aiModelsCache.onChange((payload: AIModelsCachePayload | null) => {
      applyAIModelsData(payload?.data);
    });
  }, [applyAIModelsData]);

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

  const handleLogin = useCallback(async (newUser: User | null, loginResp?: LoginResponseWithSeqs) => {
    if (newUser) {
      const userWithGems = {
        ...newUser,
        gems: newUser.gems ?? 10,
        tier: newUser.tier ?? 'Standard'
      };
      setUser(userWithGems);
      authService.setUser(userWithGems);

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

      // Persist seqs from the login response so /user/bootstrap can compare
      // against them; this also removes the need for a follow-up get-profile.
      if (loginResp?.seqs) {
        hostStorageService.saveSeqs(loginResp.seqs);
      }

      logger.info(LOG_MODULE.APP, 'app.login.sync_start', 'Starting post-login bootstrap', {
        user_id: userWithGems.id,
        storage_mode: useLocal ? 'local' : 'cloud',
      });

      // Single bootstrap call replaces what used to be:
      //   commerce/config + ai/get-models + license/features + user/get-profile.
      // Bootstrap only ships sections whose local cache is stale, so a typical
      // returning user pays only the bootstrap round-trip itself.
      let bootstrapSeqs = loginResp?.seqs;
      let refreshIntervalMinutes: number | undefined;
      try {
        const machineId = await licenseService.getMachineId();
        // handleLogin is only entered right after /auth/login or an OAuth
        // callback — the token is fresh, so skip the redundant re-sign.
        const result = await bootstrapService.bootstrap(machineId, { skipTokenRefresh: true });
        bootstrapSeqs = result.seqs;
        refreshIntervalMinutes = result.refreshIntervalMinutes;
      } catch (err) {
        logger.warn(LOG_MODULE.APP, 'app.login.bootstrap_failed', 'Bootstrap failed; falling back to local cache', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Kick off the auto-refresh timer with the interval bootstrap reported
      // (falls back to the client default if bootstrap failed). Must happen
      // after bootstrap so the timer aligns with the freshly-issued token.
      authService.startAutoRefresh(() => apiService.refreshToken(), refreshIntervalMinutes);

      // Hosts/groups/proxies sync uses the seqs that bootstrap (or login) returned.
      // syncBySeqs internally skips any resource whose seq matches the local cache,
      // so this is cheap when nothing changed.
      let loginHostsCount = 0;
      if (!useLocal && bootstrapSeqs) {
        try {
          const sync = await hostService.syncBySeqs(bootstrapSeqs);
          setHosts(sync.hosts);
          if (sync.groups.length > 0) setGroups(sync.groups);
          setProxies(sync.proxies);
          loginHostsCount = sync.hosts.length;
          logger.info(LOG_MODULE.APP, 'app.login.synced', 'Login data synced', {
            hosts: sync.hosts.length,
            groups: sync.groups.length,
            proxies: sync.proxies.length,
            changed: sync.changed,
          });
        } catch (err) {
          logger.warn(LOG_MODULE.APP, 'app.login.sync_failed', 'syncBySeqs failed; reading local cache', {
            error: err instanceof Error ? err.message : String(err),
          });
          const localHosts = await hostService.getHosts();
          const localGroups = await hostService.getGroups();
          setHosts(localHosts);
          if (localGroups.length > 0) setGroups(localGroups);
          loginHostsCount = localHosts.length;
        }
      } else {
        // Local-only mode: nothing to sync, just read local storage.
        const localHosts = await hostService.getHosts();
        const localGroups = await hostService.getGroups();
        setHosts(localHosts);
        if (localGroups.length > 0) setGroups(localGroups);
        loginHostsCount = localHosts.length;
      }

      // First-time login for new account: if local hosts are empty, create defaults.
      if (loginHostsCount === 0) {
        const defaultHosts = getDefaultHosts(t);
        for (const host of defaultHosts) {
          await hostService.addHost(host);
        }
        setHosts(defaultHosts);
      }

      // First login prompt: if this user has never selected a storage mode -> prompt to enable cloud sync
      const CLOUD_PROMPTED_KEY = `termcat_cloud_prompted_${userWithGems.id}`;
      if (!localStorage.getItem(CLOUD_PROMPTED_KEY)) {
        localStorage.setItem(CLOUD_PROMPTED_KEY, '1');
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
  }, [t, setHosts, setGroups, setProxies, setStorageMode, resetSessions, setActiveView]);

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
