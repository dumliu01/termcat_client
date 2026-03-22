import React, { useState } from 'react';
import { Puzzle, Power, PowerOff, AlertCircle, CheckCircle, Loader2, FolderOpen, RefreshCw } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { usePluginList } from '@/features/terminal/hooks/usePlugins';
import type { PluginInfo } from '@/plugins/types';

export const SettingPlugins: React.FC = () => {
  const { t } = useI18n();
  const { plugins, loading, refresh, enablePlugin, disablePlugin } = usePluginList();
  const [operating, setOperating] = useState<string | null>(null);

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
        return <div className="w-4 h-4 rounded-full border-2 border-[var(--text-tertiary)]" />;
    }
  };

  const getStateLabel = (plugin: PluginInfo): string => {
    switch (plugin.state) {
      case 'activated': return '运行中';
      case 'error': return '错误';
      case 'deactivated': return '已停用';
      default: return '已安装';
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 text-indigo-400">
            <Puzzle className="w-5 h-5" />
            <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">插件管理</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // 打开插件目录
                (window as any).electron?.openExternal?.(`file://${getPluginsDir()}`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              插件目录
            </button>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="text-center py-12">
            <Puzzle className="w-12 h-12 mx-auto mb-4 text-[var(--text-tertiary)] opacity-30" />
            <p className="text-sm text-[var(--text-tertiary)]">暂无已安装的插件</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2 opacity-60">
              将插件放入 ~/.termcat/plugins/ 目录后刷新
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plugins.map((plugin) => (
              <div
                key={plugin.manifest.id}
                className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-indigo-500/30 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {getStateIcon(plugin)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {plugin.manifest.displayName}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">
                        v{plugin.manifest.version}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        plugin.state === 'activated' ? 'bg-green-500/10 text-green-400' :
                        plugin.state === 'error' ? 'bg-red-500/10 text-red-400' :
                        'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                      }`}>
                        {getStateLabel(plugin)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                      {plugin.manifest.description}
                    </p>
                    {plugin.error && (
                      <p className="text-xs text-red-400 mt-1 truncate">
                        {plugin.error}
                      </p>
                    )}
                    {plugin.manifest.permissions.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {plugin.manifest.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(plugin)}
                  disabled={operating === plugin.manifest.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    plugin.enabled
                      ? 'text-orange-400 hover:bg-orange-500/10'
                      : 'text-green-400 hover:bg-green-500/10'
                  } disabled:opacity-50`}
                >
                  {plugin.enabled ? (
                    <>
                      <PowerOff className="w-3.5 h-3.5" />
                      禁用
                    </>
                  ) : (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      启用
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

function getPluginsDir(): string {
  // 简单推断路径，实际路径由 Main 进程管理
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac') || platform.includes('darwin')) {
    return `~/Library/Application Support/termcat-client/plugins`;
  } else if (platform.includes('win')) {
    return `%APPDATA%/termcat-client/plugins`;
  }
  return `~/.config/termcat-client/plugins`;
}
