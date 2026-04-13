/**
 * 设置页 → 插件 tab
 *
 * 左侧树状列表，右侧复用 PluginSettingsForm 共享组件。
 * 设置表单与插件详情页（ExtensionsView）完全一致。
 */
import React, { useState, useEffect } from 'react';
import { Puzzle, Settings, Loader2 } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { usePluginList } from '@/features/terminal/hooks/usePlugins';
import { PluginSettingsForm } from '@/features/extensions/components/PluginSettingsForm';
import type { PluginInfo } from '@/plugins/types';

function resolveI18nText(value: string | Record<string, string> | undefined, lang: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en || value.zh || Object.values(value)[0] || '';
}

// ==================== 左侧：插件树列表项 ====================

const PluginTreeItem: React.FC<{
  plugin: PluginInfo;
  selected: boolean;
  language: string;
  onClick: () => void;
}> = ({ plugin, selected, language, onClick }) => {
  const hasSettings = plugin.manifest.contributes?.settings
    && Object.keys(plugin.manifest.contributes.settings).length > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
        selected
          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
        plugin.state === 'activated' ? 'bg-green-400' :
        plugin.state === 'error' ? 'bg-red-400' :
        'bg-[var(--text-tertiary)] opacity-40'
      }`} />
      <span className="text-xs truncate flex-1">{resolveI18nText(plugin.manifest.displayName as any, language)}</span>
      {hasSettings && (
        <Settings className={`w-3 h-3 flex-shrink-0 ${
          selected ? 'text-indigo-400' : 'text-[var(--text-tertiary)] opacity-50'
        }`} />
      )}
    </button>
  );
};

// ==================== 主组件：左右分栏 ====================

export const SettingPlugins: React.FC = () => {
  const { language } = useI18n();
  const { plugins, loading } = usePluginList(language);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  // 有设置项的插件排前面
  const sortedPlugins = [...plugins].sort((a, b) => {
    const aHas = Object.keys(a.manifest.contributes?.settings || {}).length > 0 ? 0 : 1;
    const bHas = Object.keys(b.manifest.contributes?.settings || {}).length > 0 ? 0 : 1;
    return aHas - bHas;
  });

  // 默认选中第一个有设置的插件
  useEffect(() => {
    if (!selectedPluginId && sortedPlugins.length > 0) {
      const withSettings = sortedPlugins.find(
        p => Object.keys(p.manifest.contributes?.settings || {}).length > 0
      );
      setSelectedPluginId(withSettings?.manifest.id || sortedPlugins[0].manifest.id);
    }
  }, [sortedPlugins.length]);

  const selectedPlugin = selectedPluginId
    ? plugins.find(p => p.manifest.id === selectedPluginId)
    : null;

  return (
    <div data-testid="plugins-settings" className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section data-testid="plugins-list" className="bg-[var(--bg-card)] p-6 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 text-indigo-400 mb-6">
          <Puzzle className="w-5 h-5" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">Plugin Settings</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="text-center py-12">
            <Puzzle className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)] opacity-30" />
            <p className="text-xs text-[var(--text-tertiary)]">No plugins installed</p>
          </div>
        ) : (
          <div className="flex gap-6 min-h-[300px]">
            {/* 左侧：插件树 */}
            <div className="w-[200px] flex-shrink-0 space-y-1 border-r border-[var(--border-color)] pr-4">
              {sortedPlugins.map((plugin) => (
                <PluginTreeItem
                  key={plugin.manifest.id}
                  plugin={plugin}
                  selected={selectedPluginId === plugin.manifest.id}
                  language={language}
                  onClick={() => setSelectedPluginId(plugin.manifest.id)}
                />
              ))}
            </div>

            {/* 右侧：复用 PluginSettingsForm */}
            <div className="flex-1 min-w-0">
              {selectedPlugin ? (
                <PluginSettingsForm
                  key={selectedPlugin.manifest.id}
                  plugin={selectedPlugin}
                  showHeader
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-[var(--text-tertiary)]">Select a plugin to configure</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
