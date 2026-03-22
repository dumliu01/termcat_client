import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Blocks, Search, Download, Check, Star, Settings, ShieldCheck, FolderUp, Power, PowerOff, Loader2, AlertCircle, CheckCircle, RefreshCw, Heart, Package } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { usePluginList } from '@/features/terminal/hooks/usePlugins';
import { apiService } from '@/base/http/api';
import type { PluginInfo } from '@/plugins/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

// 服务端插件商店数据
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

// 用户已安装的服务端插件
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

export const ExtensionsView: React.FC = () => {
  const { language, t } = useI18n();
  const { plugins, loading, refresh, enablePlugin, disablePlugin } = usePluginList(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'recommended'>('installed');
  const [operating, setOperating] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 服务端商店数据
  const [storePlugins, setStorePlugins] = useState<StorePlugin[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [userServerPlugins, setUserServerPlugins] = useState<UserServerPlugin[]>([]);
  const [sortBy, setSortBy] = useState<string>('downloads');

  // 使用本地已安装插件列表判断安装状态（VS Code 风格）
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

  // VS Code 风格：从商店下载 .tgz 到本地安装
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
      // 刷新本地插件列表
      await refresh();
      // 同时在服务端记录安装（增加下载量等）
      try { await apiService.installServerPlugin(pluginName); } catch {}
    } catch (err: any) {
      logger.error(LOG_MODULE.PLUGIN, 'plugin.install.error', 'Plugin install error', { plugin: pluginName, error: err?.message });
    } finally {
      setOperating(null);
    }
  };

  // VS Code 风格：删除本地插件目录
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

  // 过滤已安装插件（本地）
  const filteredInstalled = plugins.filter(p =>
    !searchQuery ||
    p.manifest.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.manifest.description || '').toLowerCase().includes(searchQuery.toLowerCase())
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
            {activeTab === 'installed' ? (
              /* 已安装插件列表 */
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
                      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 hover:border-indigo-500/30 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {getStateIcon(plugin)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--text-main)] truncate">
                              {plugin.manifest.displayName}
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
                            {plugin.manifest.description}
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
                          onClick={() => handleToggle(plugin)}
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
              /* 插件商店列表 */
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
