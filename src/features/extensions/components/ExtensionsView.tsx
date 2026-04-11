import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Blocks, Search, Download, Check, Star, Settings, ShieldCheck, FolderUp, Power, PowerOff, Loader2, AlertCircle, CheckCircle, RefreshCw, Heart, Package, ArrowLeft, Lock, ShoppingCart, Monitor, KeyRound } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';

/** Resolve a potentially i18n-ized field: string or { zh, en, es } object */
function resolveI18nText(value: string | Record<string, string> | undefined, lang: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en || value.zh || Object.values(value)[0] || '';
}
import { usePluginList } from '@/features/terminal/hooks/usePlugins';
import { apiService } from '@/base/http/api';
import type { PluginInfo } from '@/plugins/types';
import { licenseService } from '@/core/license/licenseService';
import { builtinPluginManager } from '@/plugins/builtin';
import { AI_OPS_EVENTS } from '@/plugins/builtin/events';
import { logger, LOG_MODULE } from '@/base/logger/logger';

// Server plugin store data
interface StorePlugin {
  id: string;
  name: string;
  display_name: string;
  description: string;
  author: string;
  version: string;
  icon_url: string;
  package_url: string;
  category: string;
  tags: string[];
  permissions: string[];
  downloads: number;
  stars: number;
  rating: number;
  status: number;
  featured: boolean;
}

// User's installed server plugins
interface UserServerPlugin {
  id: number;
  user_id: number;
  plugin_id: string;
  version: string;
  enabled: boolean;
  starred: boolean;
  plugin: StorePlugin;
}

const CATEGORY_COLORS: Record<string, string> = {
  monitor: 'text-purple-500',
  security: 'text-red-500',
  devops: 'text-blue-500',
  other: 'text-green-500',
};

// ==================== 插件详情面板 ====================

import { PluginSettingsForm } from './PluginSettingsForm';

const PluginDetailView: React.FC<{
  plugin: PluginInfo;
  onBack: () => void;
  onToggle: (plugin: PluginInfo) => void;
  operating: boolean;
  t: any;
  language: string;
}> = ({ plugin, onBack, onToggle, operating, t, language }) => {
  const hasSettings = plugin.manifest.contributes?.settings
    && Object.keys(plugin.manifest.contributes.settings).length > 0;

  const getStateLabel = (state: string): string => {
    switch (state) {
      case 'activated': return t.extensions.running;
      case 'error': return t.extensions.error;
      case 'deactivated': return t.extensions.stopped;
      default: return t.extensions.installedState;
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {/* 顶部：返回 + 插件头信息 */}
      <div className="flex items-start gap-4 mb-8">
        <button
          onClick={onBack}
          className="mt-1 p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold text-[var(--text-main)]">{resolveI18nText(plugin.manifest.displayName as any, language)}</h2>
            <span className="text-xs text-[var(--text-dim)] px-2 py-0.5 rounded bg-black/20">v{plugin.manifest.version}</span>
            {plugin.builtin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium">
                {t.extensions.builtin}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              plugin.state === 'activated' ? 'bg-green-500/10 text-green-400' :
              plugin.state === 'error' ? 'bg-red-500/10 text-red-400' :
              'bg-black/20 text-[var(--text-dim)]'
            }`}>
              {getStateLabel(plugin.state)}
            </span>
          </div>
          <p className="text-sm text-[var(--text-dim)] leading-relaxed">{resolveI18nText(plugin.manifest.description as any, language)}</p>
          {plugin.error && (
            <p className="text-xs text-red-400 mt-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">{plugin.error}</p>
          )}
        </div>
        {/* 启用/禁用按钮 */}
        {plugin.disableable !== false && (
          <button
            onClick={() => onToggle(plugin)}
            disabled={operating}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              plugin.enabled
                ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            } disabled:opacity-50`}
          >
            {plugin.enabled ? (
              <><PowerOff className="w-3.5 h-3.5" />{t.extensions.disable}</>
            ) : (
              <><Power className="w-3.5 h-3.5" />{t.extensions.enable}</>
            )}
          </button>
        )}
      </div>

      {/* License 授权状态（通用：检测插件是否有需要 License 的模式） */}
      {(() => {
        // Find modes registered by this plugin that require license
        const pluginModes = builtinPluginManager.getExtraModes()
          .filter(m => m.pluginData?.licenseFeature);
        if (pluginModes.length === 0) return null;

        const cache = licenseService.getCache();
        const unlocked = cache?.hasLicense && cache?.activated;
        const firstLicensed = pluginModes[0];
        const price = firstLicensed.pluginData?.licensePrice;
        const product = firstLicensed.pluginData?.licenseProduct;
        const lockedModeNames = pluginModes.map(m => m.name).join(' + ');

        return (
          <div className={`mb-8 rounded-xl border p-5 ${
            unlocked
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {unlocked ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <Lock className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-main)]">
                    {unlocked ? `${lockedModeNames} — ${t.extensions.licenseActivated}` : `${lockedModeNames} — ${t.extensions.licenseNotPurchased}`}
                  </h4>
                  <p className="text-xs text-[var(--text-dim)] mt-0.5">
                    {unlocked
                      ? t.extensions.licenseUnlocked(lockedModeNames)
                      : t.extensions.licensePurchaseToUnlock(lockedModeNames)
                    }
                  </p>
                </div>
              </div>
              {unlocked ? (
                <div className="flex items-center gap-3 text-xs text-[var(--text-dim)]">
                  <div className="flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    <span>{cache?.machinesUsed || 0}/{cache?.machinesMax || 3} {t.extensions.licenseDevices}</span>
                  </div>
                  <span className="font-mono text-[10px]">{cache?.licenseKeyMasked}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      licenseService.activateDevice().catch(() => {
                        alert(t.extensions.licenseActivateFailed);
                      });
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {t.extensions.licenseActivate}
                  </button>
                  <button
                    onClick={() => {
                      builtinPluginManager.emit(AI_OPS_EVENTS.OPEN_PAYMENT, {
                        type: product,
                        amount: price,
                      });
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {price ? t.extensions.licenseBuyWithPrice(price) : t.extensions.licenseBuy}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 信息卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-2">Permissions</h4>
          {plugin.manifest.permissions.length > 0 ? (
            <div className="flex gap-1.5 flex-wrap">
              {plugin.manifest.permissions.map((perm) => (
                <span key={perm} className="text-[10px] px-2 py-1 rounded-lg bg-black/20 border border-[var(--border-color)] text-[var(--text-dim)]">
                  {perm}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-dim)] opacity-50">No permissions required</p>
          )}
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-2">Activation</h4>
          <div className="flex gap-1.5 flex-wrap">
            {(plugin.manifest.activationEvents || []).map((evt) => (
              <span key={evt} className="text-[10px] px-2 py-1 rounded-lg bg-black/20 border border-[var(--border-color)] text-[var(--text-dim)] font-mono">
                {evt}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 设置区域 — 复用共享组件 */}
      {hasSettings && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Settings className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">Settings</h4>
          </div>
          <PluginSettingsForm plugin={plugin} />
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================

export const ExtensionsView: React.FC = () => {
  const { language, t } = useI18n();
  const { plugins, loading, refresh, enablePlugin, disablePlugin } = usePluginList(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'recommended'>('installed');
  const [operating, setOperating] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server store data
  const [storePlugins, setStorePlugins] = useState<StorePlugin[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [userServerPlugins, setUserServerPlugins] = useState<UserServerPlugin[]>([]);
  const [sortBy, setSortBy] = useState<string>('downloads');

  // Use local installed plugin list to determine installation status (VS Code style)
  const localInstalledIds = new Set(plugins.map(p => p.manifest.id));
  const installedPluginIds = localInstalledIds;

  const fetchStorePlugins = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await apiService.getPluginStoreList({ search: searchQuery, sort: sortBy, page_size: 50 });
      setStorePlugins(data.items || []);
    } catch {
      setStorePlugins([]);
    } finally {
      setStoreLoading(false);
    }
  }, [searchQuery, sortBy]);

  const fetchUserPlugins = useCallback(async () => {
    try {
      const data = await apiService.getUserPluginList();
      setUserServerPlugins(data || []);
    } catch {
      setUserServerPlugins([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'recommended') {
      fetchStorePlugins();
    }
  }, [activeTab, fetchStorePlugins]);

  useEffect(() => {
    fetchUserPlugins();
  }, [fetchUserPlugins]);

  // VS Code style: Download .tgz from store to local install
  const handleInstallServerPlugin = async (pluginName: string, packageUrl: string) => {
    if (!packageUrl) return;
    setOperating(pluginName);
    try {
      const result = await window.electron.plugin.installFromUrl(packageUrl, pluginName);
      if (!result.success) {
        logger.error(LOG_MODULE.PLUGIN, 'plugin.install.failed', 'Plugin install failed', { plugin: pluginName, error: result.error });
      } else {
        logger.info(LOG_MODULE.PLUGIN, 'plugin.install.success', 'Plugin installed', { plugin: pluginName });
      }
      // Refresh local plugin list
      await refresh();
      // Also record installation on server (increment download count etc.)
      try { await apiService.installServerPlugin(pluginName); } catch {}
    } catch (err: any) {
      logger.error(LOG_MODULE.PLUGIN, 'plugin.install.error', 'Plugin install error', { plugin: pluginName, error: err?.message });
    } finally {
      setOperating(null);
    }
  };

  // VS Code style: Delete local plugin directory
  const handleUninstallServerPlugin = async (pluginName: string) => {
    setOperating(pluginName);
    try {
      const result = await window.electron.plugin.uninstall(pluginName);
      if (!result.success) {
        logger.error(LOG_MODULE.PLUGIN, 'plugin.uninstall.failed', 'Plugin uninstall failed', { plugin: pluginName, error: result.error });
      } else {
        logger.info(LOG_MODULE.PLUGIN, 'plugin.uninstall.success', 'Plugin uninstalled', { plugin: pluginName });
      }
      await refresh();
      try { await apiService.uninstallServerPlugin(pluginName); } catch {}
    } catch {
      // ignore
    } finally {
      setOperating(null);
    }
  };

  const handleStarPlugin = async (pluginId: string) => {
    try {
      await apiService.starServerPlugin(pluginId);
      await fetchUserPlugins();
      await fetchStorePlugins();
    } catch {
      // ignore
    }
  };

  const handleToggle = async (plugin: PluginInfo) => {
    setOperating(plugin.manifest.id);
    try {
      if (plugin.enabled) {
        await disablePlugin(plugin.manifest.id);
      } else {
        await enablePlugin(plugin.manifest.id);
      }
    } finally {
      setOperating(null);
    }
  };

  const getStateIcon = (plugin: PluginInfo) => {
    if (operating === plugin.manifest.id) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
    }
    switch (plugin.state) {
      case 'activated':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-[var(--text-dim)]" />;
    }
  };

  const getStateLabel = (plugin: PluginInfo): string => {
    switch (plugin.state) {
      case 'activated': return t.extensions.running;
      case 'error': return t.extensions.error;
      case 'deactivated': return t.extensions.stopped;
      default: return t.extensions.installedState;
    }
  };

  const formatDownloads = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
  };

  // Filter installed plugins (local)
  const filteredInstalled = plugins.filter(p =>
    !searchQuery ||
    resolveI18nText(p.manifest.displayName as any, language).toLowerCase().includes(searchQuery.toLowerCase()) ||
    resolveI18nText(p.manifest.description as any, language).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLocalInstall = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] overflow-hidden">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[var(--border-color)] bg-[var(--bg-card)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-500">
            <Blocks className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold text-[var(--text-main)] tracking-tight">{t.extensions.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={handleLocalInstall}
            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-main)] hover:bg-indigo-500/10 text-[var(--text-main)] hover:text-indigo-500 border border-[var(--border-color)] hover:border-indigo-500/30 rounded-lg text-xs font-medium transition-all"
          >
            <FolderUp className="w-3.5 h-3.5" />
            {t.extensions.installLocal}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col shrink-0">
          <div className="p-4 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.extensions.search}
                className="w-full bg-black/20 border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          <div className="p-2 space-y-1">
            <button
              onClick={() => setActiveTab('installed')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'installed' ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-dim)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'}`}
            >
              <Check className="w-4 h-4" />
              {t.extensions.installed}
              <span className="ml-auto bg-black/20 px-2 py-0.5 rounded-full text-xs">
                {plugins.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('recommended')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'recommended' ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-dim)] hover:bg-[var(--bg-card)] hover:text-[var(--text-main)]'}`}
            >
              <Star className="w-4 h-4" />
              {t.extensions.recommended}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            {/* 插件详情视图 */}
            {selectedPluginId && plugins.find(p => p.manifest.id === selectedPluginId) ? (
              <PluginDetailView
                plugin={plugins.find(p => p.manifest.id === selectedPluginId)!}
                onBack={() => setSelectedPluginId(null)}
                onToggle={handleToggle}
                operating={operating === selectedPluginId}
                t={t}
                language={language}
              />
            ) : activeTab === 'installed' ? (
              /* Installed Plugins List */
              loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--text-dim)]" />
                </div>
              ) : filteredInstalled.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-[var(--text-dim)]">
                  <Blocks className="w-16 h-16 mb-4 opacity-20" />
                  <p>{searchQuery ? t.extensions.noResults : t.extensions.noPlugins}</p>
                  {!searchQuery && (
                    <p className="text-xs mt-2 opacity-60">{t.extensions.noPluginsHint}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-end gap-2 mb-4">
                    <button
                      onClick={() => {
                        (window as any).electron?.openExternal?.(`file://${getPluginsDir()}`);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
                    >
                      <FolderUp className="w-3.5 h-3.5" />
                      {t.extensions.pluginDir}
                    </button>
                    <button
                      onClick={refresh}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t.extensions.refresh}
                    </button>
                  </div>
                  {filteredInstalled.map((plugin) => (
                    <div
                      key={plugin.manifest.id}
                      onClick={() => setSelectedPluginId(plugin.manifest.id)}
                      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 hover:border-indigo-500/30 transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {getStateIcon(plugin)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--text-main)] truncate">
                              {resolveI18nText(plugin.manifest.displayName as any, language)}
                            </span>
                            <span className="text-[10px] text-[var(--text-dim)] px-1.5 py-0.5 rounded bg-black/20">
                              v{plugin.manifest.version}
                            </span>
                            {plugin.builtin && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-medium">
                                {t.extensions.builtin}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              plugin.state === 'activated' ? 'bg-green-500/10 text-green-400' :
                              plugin.state === 'error' ? 'bg-red-500/10 text-red-400' :
                              'bg-black/20 text-[var(--text-dim)]'
                            }`}>
                              {getStateLabel(plugin)}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-dim)] mt-0.5 truncate">
                            {resolveI18nText(plugin.manifest.description as any, language)}
                          </p>
                          {plugin.error && (
                            <p className="text-xs text-red-400 mt-1 truncate">{plugin.error}</p>
                          )}
                          {plugin.manifest.permissions.length > 0 && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {plugin.manifest.permissions.map((perm) => (
                                <span
                                  key={perm}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-black/20 border border-[var(--border-color)] text-[var(--text-dim)]"
                                >
                                  {perm}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {plugin.disableable !== false && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggle(plugin); }}
                          disabled={operating === plugin.manifest.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                            plugin.enabled
                              ? 'text-orange-400 hover:bg-orange-500/10'
                              : 'text-green-400 hover:bg-green-500/10'
                          } disabled:opacity-50`}
                        >
                          {plugin.enabled ? (
                            <>
                              <PowerOff className="w-3.5 h-3.5" />
                              {t.extensions.disable}
                            </>
                          ) : (
                            <>
                              <Power className="w-3.5 h-3.5" />
                              {t.extensions.enable}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Plugin Store List */
              <>
                <div className="flex items-center justify-end gap-2 mb-4">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-main)] focus:outline-none focus:border-indigo-500/50"
                  >
                    <option value="downloads">{t.extensions.sortDownloads}</option>
                    <option value="stars">{t.extensions.sortStars}</option>
                    <option value="rating">{t.extensions.sortRating}</option>
                    <option value="newest">{t.extensions.sortNewest}</option>
                  </select>
                </div>
                {storeLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--text-dim)]" />
                  </div>
                ) : storePlugins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-[var(--text-dim)]">
                    <Blocks className="w-16 h-16 mb-4 opacity-20" />
                    <p>{t.extensions.noResults}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {storePlugins.map(ext => {
                      const isInstalled = installedPluginIds.has(ext.name);
                      const userPlugin = userServerPlugins.find(up => up.plugin_id === ext.id);
                      return (
                        <div key={ext.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 hover:border-indigo-500/30 transition-colors group flex flex-col">
                          <div className="flex items-start gap-4">
                            <div className="w-16 h-16 rounded-xl bg-black/20 flex items-center justify-center shrink-0 border border-[var(--border-color)]">
                              {ext.icon_url ? (
                                <img src={ext.icon_url} alt={ext.display_name} className="w-10 h-10 rounded-lg" />
                              ) : (
                                <Blocks className={`w-8 h-8 ${CATEGORY_COLORS[ext.category] || 'text-indigo-500'}`} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-base font-bold text-[var(--text-main)] truncate">{ext.display_name}</h3>
                                  {ext.featured && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase tracking-wider">
                                      {t.extensions.featured}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {userPlugin && (
                                    <button
                                      onClick={() => handleStarPlugin(ext.id)}
                                      className={`p-1.5 rounded-lg transition-colors ${userPlugin.starred ? 'text-amber-500' : 'text-[var(--text-dim)] hover:text-amber-500'}`}
                                    >
                                      <Heart className="w-4 h-4" fill={userPlugin.starred ? 'currentColor' : 'none'} />
                                    </button>
                                  )}
                                  {isInstalled ? (
                                    <button
                                      onClick={() => handleUninstallServerPlugin(ext.name)}
                                      disabled={operating === ext.name}
                                      className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {operating === ext.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.extensions.uninstall}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleInstallServerPlugin(ext.name, ext.package_url)}
                                      disabled={operating === ext.name || !ext.package_url}
                                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {operating === ext.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.extensions.install}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-[var(--text-dim)] mt-1 line-clamp-2 min-h-[40px]">{ext.description}</p>

                              <div className="flex items-center gap-4 mt-4 text-xs text-[var(--text-dim)]">
                                <div className="flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  {ext.author}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Download className="w-3.5 h-3.5" />
                                  {formatDownloads(ext.downloads)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Heart className="w-3.5 h-3.5" />
                                  {ext.stars}
                                </div>
                                {ext.rating > 0 && (
                                  <div className="flex items-center gap-1 text-amber-500">
                                    <Star className="w-3.5 h-3.5 fill-current" />
                                    {ext.rating}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center gap-2">
                            {(ext.tags || []).map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-black/20 border border-[var(--border-color)] rounded-md text-[10px] font-medium text-[var(--text-dim)] uppercase tracking-wider">
                                {tag}
                              </span>
                            ))}
                            <span className="ml-auto text-xs text-[var(--text-dim)] font-mono">v{ext.version}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

function getPluginsDir(): string {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac') || platform.includes('darwin')) {
    return `~/Library/Application Support/termcat-client/plugins`;
  } else if (platform.includes('win')) {
    return `%APPDATA%/termcat-client/plugins`;
  }
  return `~/.config/termcat-client/plugins`;
}
