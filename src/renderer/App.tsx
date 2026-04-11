import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import { Sidebar } from '@/features/shared/components/Sidebar';
import { Dashboard } from '@/features/dashboard/components/Dashboard';
import { TerminalView } from '@/features/terminal/components/TerminalView';
import { TerminalTabBar } from '@/features/terminal/components/TerminalTabBar';
import { LoginView } from '@/features/auth/components/LoginView';
const SettingsView = React.lazy(() => import('@/features/settings/components/SettingsView').then(m => ({ default: m.SettingsView })));
const ExtensionsView = React.lazy(() => import('@/features/extensions/components/ExtensionsView').then(m => ({ default: m.ExtensionsView })));
const PaymentModalNew = React.lazy(() => import('@/features/payment/components/PaymentModalNew').then(m => ({ default: m.PaymentModalNew })));
const UpdateModal = React.lazy(() => import('@/features/shared/components/UpdateModal').then(m => ({ default: m.UpdateModal })));
import type { UpdateVersionInfo } from '@/features/shared/components/UpdateModal';
import { Host, ViewState, Session, TierType } from '@/utils/types';
import { THEME_CONFIG } from '@/utils/constants';
import { Terminal, Monitor, Loader2, KeyRound, Cloud, Copy, ExternalLink, Settings, Pencil, SplitSquareVertical, SplitSquareHorizontal, XCircle } from 'lucide-react';
const HostConfigModal = React.lazy(() => import('@/features/dashboard/components/HostConfigModal').then(m => ({ default: m.HostConfigModal })));
import { Header } from '@/features/shared/components/Header';
import { hostService, StorageMode } from '@/core/host/hostService';
import { authService } from '@/core/auth/authService';
import { apiService } from '@/base/http/api';
import { commerceService } from '@/core/commerce/commerceService';
import { licenseService } from '@/core/license/licenseService';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useI18n } from '@/base/i18n/I18nContext';
import { VERSION_NUMBER, versionToNumber } from '@/utils/version';
import { PluginStatusBar } from '@/features/shared/components/PluginStatusBar';
import { PluginNotifications } from '@/features/shared/components/PluginNotifications';
import { activateBuiltinPlugins, panelDataStore } from '@/plugins/builtin';
import { builtinPluginManager } from '@/plugins/builtin/builtin-plugin-manager';
import { AI_OPS_EVENTS } from '@/plugins/builtin/events';
import { AIServiceProvider } from '@/features/shared/contexts/AIServiceContext';
import { useTabManager } from '@/features/terminal/hooks/useTabManager';
import { SplitPaneLayout } from '@/features/terminal/components/SplitPaneLayout';
import { PaneHeader } from '@/features/terminal/components/PaneHeader';
import { PaneDropZone } from '@/features/terminal/components/PaneDropZone';
import { findPaneNode, countPanes, collectAllPaneIds } from '@/features/terminal/utils/split-layout';
import type { DropEdge } from '@/features/terminal/types';
import { useHostManager } from '@/features/dashboard/hooks/useHostManager';
import { useUserAuth } from '@/features/auth/hooks/useUserAuth';
import { useAppSettings } from '@/features/settings/hooks/useAppSettings';

// Module-level drag data store — accessible by drag sources and dragend handler
// This avoids the browser restriction that dataTransfer.getData() returns '' in dragend
export let __activeDragData: { type: string; tabId?: string; paneId?: string } | null = null;
export function setActiveDragData(data: typeof __activeDragData) { __activeDragData = data; }

const App: React.FC = () => {
  const { language, setLanguage, t } = useI18n();
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'bones' | 'gems' | 'vip_month' | 'vip_year' | 'agent_pack'>('bones');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentTierId, setPaymentTierId] = useState<string | undefined>();

  // Version update modal
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateVersionInfo | null>(null);

  // Tab right-click → Host config modal
  const [hostConfigSession, setHostConfigSession] = useState<Session | null>(null);

  // Pre-connection editing (hosts with empty username need config first)
  const [pendingConnectHost, setPendingConnectHost] = useState<Host | null>(null);
  const [editingPendingHost, setEditingPendingHost] = useState<Host | null>(null);

  // Effective hostname for nested SSH (tracked per session)
  const [effectiveHostnameMap, setEffectiveHostnameMap] = useState<Record<string, string | null>>({});

  // Drag-and-drop: pane currently showing drop zone overlay
  const [dropTargetPaneId, setDropTargetPaneId] = useState<string | null>(null);

  // Terminal pane context menu
  const [paneContextMenu, setPaneContextMenu] = useState<{
    x: number; y: number; tabId: string; paneId: string; sessionId: string;
  } | null>(null);

  useEffect(() => {
    if (!paneContextMenu) return;
    const close = () => setPaneContextMenu(null);
    // mousedown covers both left-click and right-click to dismiss
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [paneContextMenu]);

  // Per-pane portal containers: each pane gets its own set so panels stay mounted during pane switches.
  // Active pane's containers are visible; non-active pane's containers use display:none.
  const panePortalMapRef = useRef(new Map<string, {
    left: { current: HTMLDivElement | null },
    bottom: { current: HTMLDivElement | null },
    right: { current: HTMLDivElement | null },
  }>());
  const [portalVersion, forcePortalUpdate] = useReducer((x: number) => x + 1, 0);

  // Stable ref callbacks cached per pane+position. Using stable references prevents React from
  // re-invoking callback refs on every render (inline arrows get called with null→element each time).
  const refCallbackCacheRef = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const getPanePortalRefCb = useCallback((paneId: string, position: 'left' | 'bottom' | 'right') => {
    const key = `${paneId}-${position}`;
    let cb = refCallbackCacheRef.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        let entry = panePortalMapRef.current.get(paneId);
        if (!entry) {
          entry = { left: { current: null }, bottom: { current: null }, right: { current: null } };
          panePortalMapRef.current.set(paneId, entry);
        }
        if (entry[position].current !== el) {
          entry[position].current = el;
          // Trigger re-render so TerminalView can use the portal target via createPortal
          if (el !== null) forcePortalUpdate();
        }
      };
      refCallbackCacheRef.current.set(key, cb);
    }
    return cb;
  }, []);

  // --- Hooks ---
  const settings = useAppSettings();
  const tabManager = useTabManager(setActiveView);
  const hostManager = useHostManager();

  const userAuth = useUserAuth({
    setHosts: hostManager.setHosts,
    setGroups: hostManager.setGroups,
    setProxies: hostManager.setProxies,
    setStorageMode: hostManager.setStorageMode,
    loadProxies: hostManager.loadProxies,
    resetSessions: tabManager.resetSessions,
    setActiveView,
  });

  // Drag outside window → new window.
  // dataTransfer.getData() returns '' in dragend, so drag sources write to
  // module-level __activeDragData / setActiveDragData() on dragstart.
  useEffect(() => {
    const handleDragEnd = (e: DragEvent) => {
      const data = __activeDragData;
      __activeDragData = null; // Always clear
      if (!data) return;

      // Check if drop landed outside window bounds
      const isOutside = e.clientX <= 0 || e.clientY <= 0
        || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;

      logger.info(LOG_MODULE.APP, 'app.drag.end', 'Drag ended', {
        clientX: e.clientX, clientY: e.clientY,
        windowW: window.innerWidth, windowH: window.innerHeight,
        isOutside, dataType: data.type,
      });

      if (!isOutside) return;

      if (data.type === 'pane' && data.tabId && data.paneId) {
        tabManager.extractPaneToNewWindow(data.tabId, data.paneId);
      } else if (data.type === 'tab' && data.tabId) {
        tabManager.extractTabToNewWindow(data.tabId);
      }
    };
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, [tabManager.extractPaneToNewWindow, tabManager.extractTabToNewWindow]);

  // Split pane keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeView !== 'terminal') return;
      const currentTab = tabManager.currentTab;
      if (!currentTab) return;
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+D — vertical split
      if (meta && !e.shiftKey && e.key === 'd') {
        e.preventDefault();
        tabManager.splitPane(currentTab.id, currentTab.activePaneId, 'vertical');
        return;
      }
      // Cmd+Shift+D — horizontal split
      if (meta && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        tabManager.splitPane(currentTab.id, currentTab.activePaneId, 'horizontal');
        return;
      }
      // Cmd+] — next pane, Cmd+[ — previous pane
      if (meta && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const allPaneIds = collectAllPaneIds(currentTab.layout);
        if (allPaneIds.length <= 1) return;
        const currentIndex = allPaneIds.indexOf(currentTab.activePaneId);
        const nextIndex = e.key === ']'
          ? (currentIndex + 1) % allPaneIds.length
          : (currentIndex - 1 + allPaneIds.length) % allPaneIds.length;
        tabManager.setActivePane(currentTab.id, allPaneIds[nextIndex]);
        return;
      }
      // Cmd+W — close active pane (or tab if single pane)
      if (meta && e.key === 'w') {
        e.preventDefault();
        tabManager.closePane(currentTab.id, currentTab.activePaneId);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, tabManager.currentTab, tabManager.splitPane, tabManager.setActivePane, tabManager.closePane]);

  // Wrapper handleConnect: show config window when username is empty
  const handleConnect = useCallback((host: Host) => {
    if (!host.username) {
      setPendingConnectHost(host);
      return;
    }
    tabManager.handleConnect(host);
  }, [tabManager.handleConnect]);

  // Auto-connect: handle new windows opened with a specific host
  useEffect(() => {
    const cleanup = (window as any).electron.onAutoConnect((hostConfig: Host) => {
      setActiveView('terminal');
      handleConnect(hostConfig);
    });
    return cleanup;
  }, [handleConnect]);

  // Auto-connect local terminal: handle new windows opened for local terminal
  useEffect(() => {
    const cleanup = (window as any).electron.onAutoConnectLocal(() => {
      setActiveView('terminal');
      tabManager.handleLocalConnect();
    });
    return cleanup;
  }, [tabManager.handleLocalConnect]);

  // Duplicate Tab: receives a virtual session whose id is actually tabId
  const handleOpenPayment = useCallback((type: 'bones' | 'gems' | 'vip_month' | 'vip_year' | 'agent_pack', amount: number, tierId?: string) => {
    setPaymentType(type);
    setPaymentAmount(amount);
    setPaymentTierId(tierId);
    setShowPaymentModal(true);
  }, []);

  // Rename tab (updates the active pane's session customName)
  const handleRenameSession = useCallback((tabId: string, name: string | undefined) => {
    const tab = tabManager.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const pane = findPaneNode(tab.layout, tab.activePaneId);
    if (!pane) return;
    tabManager.setActiveSessions(prev => prev.map(s =>
      s.id === pane.sessionId ? { ...s, customName: name } : s
    ));
  }, [tabManager.tabs, tabManager.setActiveSessions]);

  // --- Local agent plugin: register modes/models via plugin extension point ---
  const localAgentDisposableRef = useRef<{ modeDisposable?: { dispose: () => void }; modelDisposable?: { dispose: () => void } } | null>(null);

  useEffect(() => {
    const registerLocalAgent = (data: { wsUrl: string; models?: any[]; modes?: any[] }) => {
      // Clean up previous registration
      localAgentDisposableRef.current?.modeDisposable?.dispose();
      localAgentDisposableRef.current?.modelDisposable?.dispose();

      const modelList = data.models || [];

      // Register modes from plugin data — plugin declares its own modes
      if (import.meta.env.DEV) console.log('[App] registerLocalAgent: modes=', data.modes, 'wsUrl=', data.wsUrl);
      const pluginModes = (data.modes || [{ id: 'local-agent', name: 'Local Agent', icon: 'cpu' }])
        .map((m: any) => ({
          id: m.id,
          name: m.name,
          icon: m.icon || 'cpu',
          allowedModels: m.allowedModels || modelList.map((ml: any) => ml.id || ml),
          source: 'plugin' as const,
          pluginData: { wsUrl: data.wsUrl, token: 'local', ...m.pluginData, errorTranslations: (data as any).errorTranslations },
        }));
      const modeDisposable = builtinPluginManager.registerExternalModes('local-agent', pluginModes);

      // Register models
      const modelDisposable = modelList.length > 0
        ? builtinPluginManager.registerExternalModels('local-agent', modelList.map((m: any) => ({
            id: m.id || m,
            name: m.name || m.id || m,
            provider: 'local',
            provider_name: '本地',
          })))
        : { dispose: () => {} };

      localAgentDisposableRef.current = { modeDisposable, modelDisposable };
    };

    // Check if local agent already running (retry: plugin subprocess may still be starting)
    const pollLocalAgent = (attempt = 0) => {
      window.electron?.plugin?.getLocalAgentStatus?.().then((data: any) => {
        if (data?.wsUrl) {
          if (import.meta.env.DEV) console.log('[App] getLocalAgentStatus returned (attempt', attempt, '):', JSON.stringify(data).slice(0, 200));
          registerLocalAgent(data);
        } else if (attempt < 5) {
          setTimeout(() => pollLocalAgent(attempt + 1), 2000);
        }
      }).catch(() => {});
    };
    pollLocalAgent();

    // Listen for start/stop events
    const unsubStarted = window.electron?.plugin?.onLocalAgentStarted?.((data) => {
      if (import.meta.env.DEV) console.log('[App] onLocalAgentStarted event:', data);
      registerLocalAgent(data);
    });
    const unsubStopped = window.electron?.plugin?.onLocalAgentStopped?.(() => {
      localAgentDisposableRef.current?.modeDisposable?.dispose();
      localAgentDisposableRef.current?.modelDisposable?.dispose();
      localAgentDisposableRef.current = null;
    });

    // Also listen for plugin state changes (covers plugin disable/uninstall from settings UI)
    const unsubStateChanged = window.electron?.plugin?.onStateChanged?.((data: any) => {
      if (data?.info?.state === 'deactivated' && localAgentDisposableRef.current) {
        // Check if local agent is no longer running after any plugin deactivation
        window.electron?.plugin?.getLocalAgentStatus?.().then((status: any) => {
          if (!status?.wsUrl) {
            localAgentDisposableRef.current?.modeDisposable?.dispose();
            localAgentDisposableRef.current?.modelDisposable?.dispose();
            localAgentDisposableRef.current = null;
          }
        }).catch(() => {});
      }
    });

    return () => {
      unsubStarted?.();
      unsubStopped?.();
      unsubStateChanged?.();
      localAgentDisposableRef.current?.modeDisposable?.dispose();
      localAgentDisposableRef.current?.modelDisposable?.dispose();
    };
  }, []);

  // --- Activate builtin plugins + register external plugin panel IPC bridge ---
  useEffect(() => {
    activateBuiltinPlugins();

    const cleanups: (() => void)[] = [];
    const electron = (window as any).electron;
    if (electron?.plugin) {
      cleanups.push(
        electron.plugin.onPanelRegister?.((data: any) => {
          panelDataStore.registerPanel(data.pluginId, data.options);
        }) || (() => {}),
        electron.plugin.onPanelUnregister?.((data: any) => {
          panelDataStore.unregisterPanel(data.panelId);
        }) || (() => {}),
        electron.plugin.onPanelSetData?.((data: any) => {
          panelDataStore.setPanelData(data.panelId, data.sections);
        }) || (() => {}),
        electron.plugin.onPanelUpdateSection?.((data: any) => {
          panelDataStore.updateSection(data.panelId, data.sectionId, data.data);
        }) || (() => {}),
        electron.plugin.onSSHExec?.((data: any) => {
          const { sessionId, command, responseChannel } = data;
          (window as any).electron.sshExecute(sessionId, command)
            .then((result: { output: string; exitCode: number }) => {
              electron.plugin.sendResponse(responseChannel, { exitCode: result.exitCode, stdout: result.output, stderr: '' });
            })
            .catch((err: Error) => {
              electron.plugin.sendResponse(responseChannel, { exitCode: 1, stdout: '', stderr: err.message });
            });
        }) || (() => {}),
      );

      electron.plugin.getCachedPanels?.()?.then?.((cached: any) => {
        if (!cached) return;
        for (const reg of cached.registrations || []) {
          panelDataStore.registerPanel(reg.pluginId, reg.options);
        }
        for (const pd of cached.panelData || []) {
          panelDataStore.setPanelData(pd.panelId, pd.sections);
        }
      });
    }

    return () => cleanups.forEach(fn => fn());
  }, []);

  // --- Listen to menu navigation events ---
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.onNavigate) return;
    return electron.onNavigate((view: string, tab?: string) => {
      setActiveView(view as ViewState);
      if (view === 'settings' && tab) {
        setSettingsInitialTab(tab);
      } else {
        setSettingsInitialTab(undefined);
      }
    });
  }, []);

  // --- Listen to AI panel open membership center event ---
  useEffect(() => {
    const disposable = builtinPluginManager.on(AI_OPS_EVENTS.OPEN_MEMBERSHIP, () => {
      setSettingsInitialTab('membership');
      setActiveView('settings');
    });
    return () => disposable.dispose();
  }, []);

  // --- Listen to open payment modal event ---
  useEffect(() => {
    const disposable = builtinPluginManager.on(AI_OPS_EVENTS.OPEN_PAYMENT, (data: any) => {
      handleOpenPayment(data?.type || 'gems', data?.amount || 69, data?.tierId);
    });
    return () => disposable.dispose();
  }, [handleOpenPayment]);

  // --- Initialize data ---
  useEffect(() => {
    const initializeData = async () => {
      try {
        let savedUser = authService.getUser();
        let serverSeqs: import('@/core/commerce/types').SyncSeqs | null = null;

        // If cached user info exists, validate token first
        if (savedUser) {
          try {
            const profileResp = await apiService.getUserProfile() as any;
            // getUserProfile now returns { user, seqs }
            const profile = profileResp?.user ?? profileResp;
            serverSeqs = profileResp?.seqs ?? null;

            // Token valid, update local cache with server's latest data
            savedUser = {
              ...savedUser,
              gems: profile?.gems ?? savedUser.gems ?? 10,
              tier: (profile?.tier || savedUser.tier || 'Standard') as TierType,
              tierExpiry: profile?.tier_expiry || savedUser.tierExpiry,
            };
            if (!savedUser.tier) savedUser.tier = 'Standard';
            authService.setUser(savedUser);
            // Start auto-refresh (with incremental sync callback)
            authService.startAutoRefresh(
              () => apiService.refreshToken(),
              undefined,
              (seqs) => {
                hostService.syncBySeqs(seqs).then(result => {
                  if (result.changed.hosts) hostManager.setHosts(result.hosts);
                  if (result.changed.groups && result.groups.length > 0) hostManager.setGroups(result.groups);
                  if (result.changed.proxies) hostManager.setProxies(result.proxies);
                }).catch(() => {});
                commerceService.handleLoginSeqs(seqs);
              },
            );
            logger.info(LOG_MODULE.APP, 'app.init.token_valid', 'Cached token validated, auto-login success', {
              user_id: savedUser.id,
            });
            // Refresh license from server (non-blocking)
            licenseService.checkLicense(true).catch(() => {});
          } catch (err) {
            // Token invalid, clear cache and redirect to login
            logger.info(LOG_MODULE.APP, 'app.init.token_invalid', 'Cached token invalid, redirecting to login', {
              user_id: savedUser.id,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
            authService.logout();
            savedUser = null;
            userAuth.setShowLogin(true);
          }
        }

        hostService.setUserScope(savedUser?.id || null);

        if (savedUser) {
          if (savedUser.gems === undefined) savedUser.gems = 10;
          if (!savedUser.tier) savedUser.tier = 'Standard';
          userAuth.setUser(savedUser);
        }

        const savedMode = savedUser ? hostService.getMode() : StorageMode.LOCAL;
        const isLocalMode = savedMode === StorageMode.LOCAL;
        if (savedUser) {
          hostManager.setStorageMode(isLocalMode ? 'local' : 'server');
        }
        hostService.setMode(savedUser ? savedMode : StorageMode.LOCAL);

        // Logged-in user + Cloud mode: use seq incremental sync
        if (savedUser && !isLocalMode && serverSeqs) {
          const [syncResult, _modelsResult, versionResult] = await Promise.allSettled([
            hostService.syncBySeqs(serverSeqs),
            userAuth.fetchAIModels(),
            this_fetchVersionCheck(),
          ]);

          if (syncResult.status === 'fulfilled') {
            hostManager.setHosts(syncResult.value.hosts);
            if (syncResult.value.groups.length > 0) {
              hostManager.setGroups(syncResult.value.groups);
            }
            hostManager.setProxies(syncResult.value.proxies);
            const c = syncResult.value.changed;
            logger.info(LOG_MODULE.APP, 'app.init.seq_sync', 'Incremental sync completed', {
              hosts_changed: c.hosts, groups_changed: c.groups, proxies_changed: c.proxies,
              hosts_count: syncResult.value.hosts.length,
            });
          } else {
            // Seq sync failed, fallback to full load from local cache
            logger.warn(LOG_MODULE.APP, 'app.init.seq_sync_failed', 'Seq sync failed, loading from cache', {
              error: syncResult.reason instanceof Error ? syncResult.reason.message : 'Unknown error',
            });
            const [hosts, groups] = await Promise.all([hostService.getHosts(), hostService.getGroups()]);
            hostManager.setHosts(hosts);
            if (groups.length > 0) hostManager.setGroups(groups);
          }

          // Commerce config seq sync
          commerceService.handleLoginSeqs(serverSeqs);

          handleVersionResult(versionResult);
        } else {
          // Guest mode / local mode / no seqs: use original full load logic
          const [hostResult, _modelsResult, _proxiesResult, versionResult] = await Promise.allSettled([
            (async () => {
              const hosts = await hostService.getHosts();
              return { success: true as const, hosts };
            })(),
            savedUser ? userAuth.fetchAIModels() : Promise.resolve(),
            savedUser && !isLocalMode ? hostManager.loadProxies() : Promise.resolve(),
            this_fetchVersionCheck(),
          ]);

          if (hostResult.status === 'fulfilled') {
            const result = hostResult.value as { success: boolean; hosts: Host[]; error?: string };
            if (result.success) {
              hostManager.setHosts(result.hosts);
            }
          } else {
            const loadedHosts = await hostService.getHosts();
            hostManager.setHosts(loadedHosts);
          }

          // Load groups
          try {
            const loadedGroups = await hostService.getGroups();
            if (loadedGroups.length > 0) {
              const m = new Map<string, typeof loadedGroups[0]>();
              for (const g of loadedGroups) m.set(g.id, g);
              hostManager.setGroups(Array.from(m.values()));
            } else if (!savedUser) {
              const defaults = userAuth.getDefaultGroups(t);
              hostManager.setGroups(defaults);
              for (const group of defaults) await hostService.addGroup(group);
            }
          } catch (e) {
            logger.warn(LOG_MODULE.APP, 'app.init.groups_failed', 'Failed to load groups', { error: e instanceof Error ? e.message : 'Unknown error' });
          }

          // Default hosts for guests
          if (!savedUser || isLocalMode) {
            const currentHosts = await hostService.getHosts();
            if (currentHosts.length === 0) {
              const defaultHosts = userAuth.getDefaultHosts(t);
              for (const host of defaultHosts) await hostService.addHost(host);
              hostManager.setHosts(defaultHosts);
            }
          }

          handleVersionResult(versionResult);
        }

        // Load saved settings
        settings.loadSavedSettings();
      } catch (e) {
        logger.error(LOG_MODULE.APP, 'app.storage.init_failed', 'Storage initialization failed', { module: LOG_MODULE.MAIN, error: 1, msg: e instanceof Error ? e.message : 'Unknown error' });
      }
    };

    // Version check (extracted as reusable function)
    const this_fetchVersionCheck = async (): Promise<UpdateVersionInfo | null> => {
      const VERSION_CHECK_CACHE_KEY = 'termcat_version_check_cache';
      const CACHE_TTL = 24 * 60 * 60 * 1000;
      let versionData: UpdateVersionInfo | null = null;
      const cached = localStorage.getItem(VERSION_CHECK_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { ts: number; data: UpdateVersionInfo };
          if (Date.now() - parsed.ts < CACHE_TTL && parsed.data?.version) {
            versionData = parsed.data;
          }
        } catch { /* ignore */ }
      }
      if (!versionData) {
        const data = await apiService.getLatestVersion();
        logger.info(LOG_MODULE.APP, 'app.version_check.fetched', 'Fetched latest version from server', {
          server_version: data?.version || '',
          current_version: VERSION_NUMBER,
        });
        if (data?.version) {
          versionData = {
            version: data.version,
            download_url: data.download_url || '',
            release_notes: data.release_notes || '',
            update_mode: data.update_mode || 'optional',
            min_version: data.min_version || '',
            update_method: data.update_method || '',
            created_at: data.created_at || '',
          };
          localStorage.setItem(VERSION_CHECK_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: versionData }));
        }
      }
      return versionData;
    };

    const handleVersionResult = (versionResult: PromiseSettledResult<UpdateVersionInfo | null | void>) => {
      if (versionResult.status === 'fulfilled' && versionResult.value) {
        const versionData = versionResult.value as UpdateVersionInfo;
        const VERSION_SKIP_KEY = 'termcat_skip_version';
        if (versionToNumber(versionData.version) > VERSION_NUMBER) {
          const belowMinVersion = versionData.min_version && versionToNumber(versionData.min_version) > VERSION_NUMBER;
          if (belowMinVersion) {
            setUpdateInfo({ ...versionData, update_mode: 'force' });
            setShowUpdateModal(true);
          } else if (versionData.update_mode === 'silent') {
            // no-op
          } else if (versionData.update_mode === 'force') {
            setUpdateInfo(versionData);
            setShowUpdateModal(true);
          } else {
            const skippedVersion = localStorage.getItem(VERSION_SKIP_KEY);
            if (skippedVersion !== versionData.version) {
              setUpdateInfo(versionData);
              setShowUpdateModal(true);
            }
          }
        }
      } else if (versionResult.status === 'rejected') {
        logger.warn(LOG_MODULE.APP, 'app.version_check.failed', 'Version check failed', { error: versionResult.reason instanceof Error ? versionResult.reason.message : 'Unknown error' });
      }
    };

    initializeData();
  }, []);

  // AIServiceProvider value
  const aiServiceValue = useMemo(() => ({
    user: userAuth.user,
    availableModels: userAuth.availableModels,
    availableModes: userAuth.availableModes,
    availableModeInfos: userAuth.availableModeInfos,
  }), [userAuth.user, userAuth.availableModels, userAuth.availableModes, userAuth.availableModeInfos]);

  const activeSession = tabManager.getActiveSession();

  // Map tabs to virtual sessions for TerminalTabBar compatibility.
  // Each tab appears as a "session" using its active pane's host info.
  const tabBarSessions = useMemo(() => {
    return tabManager.tabs.map(tab => {
      const pane = findPaneNode(tab.layout, tab.activePaneId);
      const session = pane ? tabManager.activeSessions.find(s => s.id === pane.sessionId) : null;
      return {
        id: tab.id,
        host: session?.host || { id: '', name: '?', hostname: '', username: '', port: 0, authType: 'password' as const, os: 'linux' as any, tags: [], connectionType: 'local' as const },
        lines: [],
        customName: session?.customName,
      } as Session;
    });
  }, [tabManager.tabs, tabManager.activeSessions]);

  if (userAuth.showLogin) return (
    <>
      <style>{settings.themeStyles}</style>
      <LoginView onLogin={userAuth.handleLogin} language={language} theme={settings.theme} />
    </>
  );

  return (
    <AIServiceProvider value={aiServiceValue}>
    <div className="flex h-screen overflow-hidden font-sans select-none" style={{ backgroundColor: 'var(--bg-main)' }}>
      <style>{settings.themeStyles}</style>

      <Header
        activeSessionName={activeSession?.host.name}
        activeView={activeView}
        minimalPanelStates={settings.minimalPanelStates}
        setMinimalPanelStates={settings.setMinimalPanelStates}
        isMinimalMode={settings.isMinimalMode}
        setIsMinimalMode={settings.setIsMinimalMode}
        setActiveView={setActiveView}
        user={userAuth.user}
        onLoginRequest={() => userAuth.setShowLogin(true)}
        onLogout={userAuth.handleLogout}
        language={language}
        setLanguage={setLanguage}
        terminalSessionCount={tabManager.tabs.length}
      />

      {!settings.isMinimalMode && (
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          language={language}
          setLanguage={setLanguage}
          user={userAuth.user}
          onLogout={userAuth.handleLogout}
          onLoginRequest={() => userAuth.setShowLogin(true)}
          terminalCount={tabManager.tabs.length}
        />
      )}

      <main
        className={`flex-1 flex flex-col relative overflow-hidden ${settings.isMinimalMode ? 'pt-10' : ''}`}
        style={{ backgroundColor: 'var(--bg-main)' }}
      >
        {activeView === 'terminal' && tabManager.tabs.length > 0 && (
          <TerminalTabBar
            sessions={tabBarSessions}
            currentSessionId={tabManager.currentTabId}
            onSelectSession={tabManager.setCurrentTabId}
            onCloseSession={tabManager.closeTab}
            onConnect={handleConnect}
            onReorderSessions={(reorderedVirtualSessions) => {
              const orderedIds = reorderedVirtualSessions.map(vs => vs.id);
              tabManager.reorderTabs(orderedIds);
            }}
            onTabContextMenu={(x, y, tabId) => {
              const tab = tabManager.tabs.find(t => t.id === tabId);
              if (!tab) return;
              const pane = findPaneNode(tab.layout, tab.activePaneId);
              if (!pane) return;
              setPaneContextMenu({ x, y, tabId, paneId: tab.activePaneId, sessionId: pane.sessionId });
            }}
            dragTabRef={tabManager.dragTabRef}
            dragOverTabId={tabManager.dragOverTabId}
            setDragOverTabId={tabManager.setDragOverTabId}
            renamingTabId={tabManager.renamingTabId}
            setRenamingTabId={tabManager.setRenamingTabId}
            renameValue={tabManager.renameValue}
            setRenameValue={tabManager.setRenameValue}
            onRenameSession={handleRenameSession}
            hosts={hostManager.hosts}
            groups={hostManager.groups}
            isMinimalMode={settings.isMinimalMode}
            onLocalConnect={() => tabManager.handleLocalConnect()}
            effectiveHostname={activeSession ? effectiveHostnameMap[activeSession.id] : null}
            onExtractPaneToTab={(sourceTabId, paneId) => tabManager.extractPaneToTab(sourceTabId, paneId)}
          />
        )}

        <div className="flex-1 relative overflow-hidden" style={{ isolation: 'isolate' }}>
          {/* All tabs remain mounted, z-index controls stacking to preserve xterm.js instances */}
          {tabManager.tabs.map((tab) => {
            const isActiveTab = tabManager.currentTabId === tab.id;
            const isMultiPane = countPanes(tab.layout) > 1;
            return (
              <div
                key={tab.id}
                className="absolute inset-0 flex"
                data-tab-inactive={isActiveTab ? undefined : ''}
                style={{
                  pointerEvents: isActiveTab ? 'auto' : 'none',
                  zIndex: isActiveTab ? 2 : 0,
                  transform: 'translateZ(0)',
                  contain: 'layout paint',
                }}
              >
                {/* Portal containers: left panel — one per pane, active pane visible.
                    Hidden panes use opacity:0 + position:absolute instead of display:none
                    so Virtuoso inside panels keeps its measured dimensions and avoids scroll jumps on switch.
                    Note: opacity (not visibility) because visibility:hidden can be overridden by child elements. */}
                {collectAllPaneIds(tab.layout).map(pid => {
                  const isActivePid = tab.activePaneId === pid;
                  return (
                    <div
                      key={`portal-left-${pid}`}
                      ref={getPanePortalRefCb(pid, 'left')}
                      className="flex shrink-0"
                      style={isActivePid ? undefined : { position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    />
                  );
                })}

                <div className="flex-1 flex flex-col min-w-0">
                  {/* Split terminal area */}
                  <div className="flex-1 relative min-h-0">
                    <SplitPaneLayout
                      tab={tab}
                      onResizePane={tabManager.resizePane}
                      renderPane={(paneId, sessionId, isPaneActive) => {
                        const session = tabManager.activeSessions.find(s => s.id === sessionId);
                        if (!session) return null;

                        // Pre-populate portal map entry so panelPortals is never undefined in multi-pane mode.
                        // This prevents panels from hiding for a frame while waiting for ref callbacks.
                        if (isMultiPane && !panePortalMapRef.current.has(paneId)) {
                          panePortalMapRef.current.set(paneId, {
                            left: { current: null }, bottom: { current: null }, right: { current: null },
                          });
                        }

                        const handlePaneDragEnter = (e: React.DragEvent) => {
                          // Only show drop zone for termcat drag data
                          if (!e.dataTransfer.types.includes('text/termcat-drag')) return;
                          e.preventDefault();
                          setDropTargetPaneId(paneId);
                        };

                        const handlePaneDrop = (edge: DropEdge, e: React.DragEvent) => {
                          setDropTargetPaneId(null);
                          const raw = e.dataTransfer.getData('text/termcat-drag');
                          if (!raw) return;
                          try {
                            const data = JSON.parse(raw) as { type: string; tabId?: string; paneId?: string };
                            if (data.type === 'pane' && data.tabId && data.paneId) {
                              if (data.paneId === paneId) return;
                              // Cross-tab or same-tab pane move
                              tabManager.movePaneBetweenTabs(data.tabId, data.paneId, tab.id, paneId, edge);
                            } else if (data.type === 'tab' && data.tabId) {
                              tabManager.moveTabToPane(data.tabId, tab.id, paneId, edge);
                            }
                          } catch {
                            // Invalid drag data, ignore
                          }
                        };

                        return (
                          <div
                            className="flex flex-col h-full group relative"
                            onDragEnter={handlePaneDragEnter}
                          >
                            {isMultiPane && (
                              <PaneHeader
                                host={session.host}
                                isActive={isPaneActive}
                                customName={session.customName}
                                effectiveHostname={effectiveHostnameMap[session.id]}
                                tabId={tab.id}
                                paneId={paneId}
                                onClose={() => tabManager.closePane(tab.id, paneId)}
                                onFocus={() => tabManager.setActivePane(tab.id, paneId)}
                                onRename={(name) => {
                                  tabManager.setActiveSessions(prev => prev.map(s =>
                                    s.id === sessionId ? { ...s, customName: name } : s
                                  ));
                                }}
                                onSplitVertical={() => tabManager.splitPane(tab.id, paneId, 'vertical')}
                                onSplitHorizontal={() => tabManager.splitPane(tab.id, paneId, 'horizontal')}
                              />
                            )}
                            <div
                              className="flex-1 min-h-0"
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setPaneContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, paneId, sessionId });
                              }}
                            >
                              <TerminalView
                                host={session.host}
                                onClose={() => tabManager.closePane(tab.id, paneId)}
                                theme={settings.theme}
                                terminalTheme={settings.terminalTheme}
                                terminalFontSize={settings.terminalFontSize}
                                isActive={isActiveTab}
                                isPaneActive={isPaneActive}
                                onPaneFocus={() => tabManager.setActivePane(tab.id, paneId)}
                                paneOnly={isMultiPane && (!isPaneActive || !isActiveTab)}
                                panelPortals={isMultiPane ? panePortalMapRef.current.get(paneId) : undefined}
                                portalVersion={portalVersion}
                                defaultFocusTarget={settings.defaultFocusTarget}
                                minimalPanelStates={settings.minimalPanelStates}
                                onMinimalPanelStatesChange={settings.setMinimalPanelStates}
                                initialDirectory={session.initialDirectory}
                                onConnectionReady={(connId) => {
                                  tabManager.setActiveSessions(prev => prev.map(s =>
                                    s.id === session.id ? { ...s, connectionId: connId } : s
                                  ));
                                }}
                                onEffectiveHostnameChange={(hostname) => {
                                  setEffectiveHostnameMap(prev => ({ ...prev, [session.id]: hostname }));
                                }}
                              />
                            </div>
                            {/* Drop zone overlay — shown when dragging over this pane */}
                            {dropTargetPaneId === paneId && (
                              <PaneDropZone
                                onDrop={handlePaneDrop}
                                onDragLeave={() => setDropTargetPaneId(null)}
                              />
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>

                  {/* Portal containers: bottom panel — one per pane, active pane visible */}
                  {collectAllPaneIds(tab.layout).map(pid => {
                    const isActivePid = tab.activePaneId === pid;
                    return (
                      <div
                        key={`portal-bottom-${pid}`}
                        ref={getPanePortalRefCb(pid, 'bottom')}
                        className="flex flex-col shrink-0"
                        style={isActivePid ? undefined : { position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                      />
                    );
                  })}
                </div>

                {/* Portal containers: right panel — one per pane, active pane visible */}
                {collectAllPaneIds(tab.layout).map(pid => {
                  const isActivePid = tab.activePaneId === pid;
                  return (
                    <div
                      key={`portal-right-${pid}`}
                      ref={getPanePortalRefCb(pid, 'right')}
                      className="flex shrink-0"
                      style={isActivePid ? undefined : { position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Terminal pane context menu */}
          {paneContextMenu && (() => {
            const ctxSession = tabManager.activeSessions.find(s => s.id === paneContextMenu.sessionId);
            const ctxTab = tabManager.tabs.find(t => t.id === paneContextMenu.tabId);
            if (!ctxSession || !ctxTab) return null;
            const isMulti = countPanes(ctxTab.layout) > 1;
            return (
              <div
                className="fixed z-[9999] animate-in fade-in"
                style={{ left: paneContextMenu.x, top: paneContextMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl py-1.5 shadow-2xl backdrop-blur-2xl min-w-[160px]">
                  <button
                    onClick={() => {
                      tabManager.duplicateSession(ctxSession);
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.terminal.duplicateTab}
                  </button>
                  <button
                    onClick={() => {
                      if (ctxSession.host.connectionType === 'local') {
                        (window as any).electron.windowCreate({ localTerminal: true });
                      } else {
                        (window as any).electron.windowCreate({ hostToConnect: ctxSession.host });
                      }
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.dashboard.openInNewWindow}
                  </button>
                  <button
                    onClick={() => {
                      setHostConfigSession(ctxSession);
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.terminal.hostSettings}
                  </button>
                  <button
                    onClick={() => {
                      tabManager.setRenamingTabId(ctxTab.id);
                      tabManager.setRenameValue(ctxSession.customName || ctxSession.host.name);
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.terminal.renameTab}
                  </button>
                  <div className="my-1 border-t border-[var(--border-color)]" />
                  <button
                    onClick={() => {
                      tabManager.splitPane(ctxTab.id, paneContextMenu.paneId, 'vertical');
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <SplitSquareVertical className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.terminal.splitVertical}
                  </button>
                  <button
                    onClick={() => {
                      tabManager.splitPane(ctxTab.id, paneContextMenu.paneId, 'horizontal');
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                  >
                    <SplitSquareHorizontal className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                    {t.terminal.splitHorizontal}
                  </button>
                  <div className="my-1 border-t border-[var(--border-color)]" />
                  <button
                    onClick={() => {
                      if (isMulti) {
                        tabManager.closePane(ctxTab.id, paneContextMenu.paneId);
                      } else {
                        tabManager.closeTab(null as any, ctxTab.id);
                      }
                      setPaneContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {isMulti ? t.terminal.closePane : t.terminal.closeTab}
                  </button>
                </div>
              </div>
            );
          })()}

          {activeView === 'terminal' && tabManager.tabs.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--bg-main)]">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-indigo-500/10 flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.1)]">
                <Terminal className="w-10 h-10 text-indigo-500/80" />
              </div>
              <h2 className="text-xl font-black text-[var(--text-main)] tracking-tight mb-2">
                {t.terminal.noActiveTerminals}
              </h2>
              <p className="text-sm font-medium text-[var(--text-dim)] mb-8 text-center max-w-sm">
                {t.terminal.noActiveTerminalsDesc}
              </p>
              <button
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
              >
                <Monitor className="w-4 h-4" />
                {t.terminal.goToHostList}
              </button>
            </div>
          )}

          {activeView === 'dashboard' && (
            <div className="absolute inset-0 z-50 bg-[var(--bg-main)]">
              <Dashboard
                hosts={hostManager.hosts}
                groups={hostManager.groups}
                proxies={hostManager.proxies}
                onConnect={handleConnect}
                onLocalConnect={() => tabManager.handleLocalConnect()}
                onDelete={hostManager.deleteHost}
                onAdd={hostManager.addHost}
                onUpdate={hostManager.updateHost}
                onAddGroup={hostManager.addGroup}
                onDeleteGroup={hostManager.deleteGroup}
                onUpdateGroup={hostManager.updateGroup}
                onAddProxy={hostManager.addProxy}
                onUpdateProxy={hostManager.updateProxy}
                onDeleteProxy={hostManager.deleteProxy}
                language={language}
                isGuest={!userAuth.user}
                storageMode={userAuth.user ? hostManager.storageMode : undefined}
                onStorageModeChange={userAuth.user ? hostManager.handleStorageModeChange : undefined}
              />
            </div>
          )}

          {activeView === 'settings' && (
            <div className="absolute inset-0 z-50 bg-[var(--bg-main)]">
              <React.Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" size={24} /></div>}>
                <SettingsView
                user={userAuth.user}
                updateUserState={userAuth.updateUserState}
                handleLogout={userAuth.handleLogout}
                setShowLogin={userAuth.setShowLogin}
                language={language}
                setLanguage={setLanguage}
                theme={settings.theme}
                setTheme={settings.setTheme}
                terminalTheme={settings.terminalTheme}
                setTerminalTheme={settings.setTerminalTheme}
                terminalFontSize={settings.terminalFontSize}
                setTerminalFontSize={settings.setTerminalFontSize}
                terminalFontFamily={settings.terminalFontFamily}
                setTerminalFontFamily={settings.setTerminalFontFamily}
                defaultFocusTarget={settings.defaultFocusTarget}
                setDefaultFocusTarget={settings.setDefaultFocusTarget}
                onOpenPayment={handleOpenPayment}
                initialTab={settingsInitialTab as any}
                />
              </React.Suspense>
            </div>
          )}

          {activeView === 'extensions' && (
            <div className="absolute inset-0 z-50 bg-[var(--bg-main)]">
              <React.Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" size={24} /></div>}>
                <ExtensionsView />
              </React.Suspense>
            </div>
          )}
        </div>
      </main>

      {/* Host config modal (triggered from Tab context menu) */}
      {hostConfigSession && (
        <React.Suspense fallback={null}>
        <HostConfigModal
          host={hostConfigSession.host}
          groups={hostManager.groups}
          proxies={hostManager.proxies}
          onClose={() => setHostConfigSession(null)}
          onSave={(updatedHost) => {
            hostManager.updateHost(updatedHost);
            tabManager.setActiveSessions(prev => prev.map(s =>
              s.host.id === updatedHost.id ? { ...s, host: updatedHost } : s
            ));
            setHostConfigSession(null);
          }}
          onAddProxy={hostManager.addProxy}
          onUpdateProxy={hostManager.updateProxy}
          onDeleteProxy={hostManager.deleteProxy}
        />
        </React.Suspense>
      )}

      {/* Pre-connection prompt: hosts with empty username need config first */}
      {pendingConnectHost && !editingPendingHost && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-[var(--bg-card)] rounded-[2rem] border border-[var(--border-color)] p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
                <KeyRound className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-base font-black text-[var(--text-main)] mb-2">{t.dashboard.hostNeedCredentials}</h3>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-8">{t.dashboard.hostNeedCredentialsDesc}</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setPendingConnectHost(null)}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors rounded-xl hover:bg-black/5"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={() => setEditingPendingHost(pendingConnectHost)}
                  className="flex-1 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors"
                >
                  {t.dashboard.goToEdit}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pre-connection edit modal: auto-connect after config */}
      {editingPendingHost && (
        <React.Suspense fallback={null}>
        <HostConfigModal
          host={editingPendingHost}
          groups={hostManager.groups}
          proxies={hostManager.proxies}
          onClose={() => { setEditingPendingHost(null); setPendingConnectHost(null); }}
          onSave={(updatedHost) => {
            hostManager.updateHost(updatedHost);
            setEditingPendingHost(null);
            setPendingConnectHost(null);
            if (updatedHost.username) {
              handleConnect(updatedHost);
            }
          }}
          onAddProxy={hostManager.addProxy}
          onUpdateProxy={hostManager.updateProxy}
          onDeleteProxy={hostManager.deleteProxy}
        />
        </React.Suspense>
      )}

      {showPaymentModal && (
        <React.Suspense fallback={null}>
        <PaymentModalNew
          show={showPaymentModal}
          type={paymentType === 'bones' ? 'gems' : paymentType as 'gems' | 'vip_month' | 'vip_year' | 'agent_pack'}
          amount={paymentAmount}
          tierId={paymentTierId}
          onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={userAuth.handlePaymentSuccess}
        />
        </React.Suspense>
      )}

      {/* Version update modal */}
      {showUpdateModal && updateInfo && (
        <React.Suspense fallback={null}>
        <UpdateModal
          versionInfo={updateInfo}
          onClose={() => setShowUpdateModal(false)}
          onSkipVersion={(v) => {
            localStorage.setItem('termcat_skip_version', v);
            setShowUpdateModal(false);
          }}
        />
        </React.Suspense>
      )}

      {/* First login cloud sync prompt */}
      {userAuth.showCloudSyncPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-[var(--bg-card)] rounded-[2rem] border border-[var(--border-color)] p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                <Cloud className="w-7 h-7 text-indigo-500" />
              </div>
              <h3 className="text-base font-black text-[var(--text-main)] mb-2">{t.dashboard.cloudSyncPromptTitle}</h3>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-8">{t.dashboard.cloudSyncPromptDesc}</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => userAuth.setShowCloudSyncPrompt(false)}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors rounded-xl hover:bg-black/5"
                >
                  {t.dashboard.cloudSyncLater}
                </button>
                <button
                  onClick={() => {
                    hostManager.handleStorageModeChange('server');
                    userAuth.setShowCloudSyncPrompt(false);
                  }}
                  className="flex-1 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors"
                >
                  {t.dashboard.cloudSyncEnable}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PluginStatusBar />
      <PluginNotifications />
    </div>
    </AIServiceProvider>
  );
};

export default App;
