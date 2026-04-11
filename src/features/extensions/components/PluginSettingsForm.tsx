/**
 * 插件设置表单 — 共享组件
 *
 * 用于：
 * 1. 插件详情页（ExtensionsView）— 嵌入详情面板
 * 2. 设置页插件 tab（SettingPlugins）— 复用同一组件
 *
 * 支持通过 setting.group 字段将配置项按模块分组显示。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Loader2, Save } from 'lucide-react';
import { pluginService } from '@/core/plugin/pluginService';
import type { PluginInfo } from '@/plugins/types';
import { useI18n } from '@/base/i18n/I18nContext';

/** Resolve a potentially i18n-ized field: string or { zh, en, es } object */
function resolveI18nText(value: string | Record<string, string> | undefined, language: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.en || value.zh || Object.values(value)[0] || '';
}

interface PluginSettingField {
  key: string;
  type: 'string' | 'boolean' | 'number' | 'select';
  default: unknown;
  description: string | Record<string, string>;
  options?: { label: string | Record<string, string>; value: unknown }[];
  group?: string | Record<string, string>;
}

/** Group settings by their `group` field (resolved by language). Ungrouped items go under '' key. */
function groupSettings(fields: PluginSettingField[], language: string): Map<string, PluginSettingField[]> {
  const groups = new Map<string, PluginSettingField[]>();
  for (const field of fields) {
    const g = resolveI18nText(field.group as any, language) || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(field);
  }
  return groups;
}

/** Render a single setting field */
const SettingField: React.FC<{
  field: PluginSettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  language: string;
}> = ({ field, value, onChange, language }) => {
  const displayValue = value ?? field.default ?? '';
  const description = resolveI18nText(field.description as any, language);

  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-primary)] block mb-1">
        {field.key}
      </label>
      <p className="text-[11px] text-[var(--text-tertiary)] mb-2">
        {description}
      </p>

      {field.type === 'select' && field.options ? (
        <select
          value={String(displayValue)}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
        >
          {field.options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {resolveI18nText(opt.label as any, language)}
            </option>
          ))}
        </select>
      ) : field.type === 'boolean' ? (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <button
            onClick={() => onChange(field.key, !value)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              value ? 'bg-indigo-500' : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                value ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-xs text-[var(--text-secondary)]">
            {value ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={String(displayValue)}
          onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
          step={field.key.includes('temperature') ? '0.1' : '1'}
          className="w-full max-w-md px-3 py-2 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
        />
      ) : (
        <input
          type={field.key.toLowerCase().includes('key') || field.key.toLowerCase().includes('password') || field.key.toLowerCase().includes('token') ? 'password' : 'text'}
          value={String(displayValue)}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={String(field.default ?? '')}
          className="w-full max-w-md px-3 py-2 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
        />
      )}
    </div>
  );
};

export const PluginSettingsForm: React.FC<{
  plugin: PluginInfo;
  /** 是否显示插件名和描述头部 */
  showHeader?: boolean;
}> = ({ plugin, showHeader = false }) => {
  const { language } = useI18n();
  const [settings, setSettings] = useState<PluginSettingField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await pluginService.getPluginSettings(plugin.manifest.id);
        if (!cancelled && result.success && result.settings) {
          const fields: PluginSettingField[] = Object.entries(result.settings).map(
            ([key, def]: [string, any]) => ({ key, ...def })
          );
          setSettings(fields);
          setValues(result.values || {});
          setOriginalValues(result.values || {});
        }
      } catch (e) {
        console.error('Failed to load plugin settings:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plugin.manifest.id]);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(originalValues);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      for (const [key, value] of Object.entries(values)) {
        if (value !== originalValues[key]) {
          await pluginService.setPluginSetting(plugin.manifest.id, key, value);
        }
      }
      setOriginalValues({ ...values });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setSaving(false);
    }
  }, [plugin.manifest.id, values, originalValues]);

  const updateValue = (key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (settings.length === 0) {
    return (
      <div className="text-center py-8">
        <Settings className="w-8 h-8 mx-auto mb-3 text-[var(--text-tertiary)] opacity-30" />
        <p className="text-xs text-[var(--text-tertiary)]">此插件没有可配置的设置项</p>
      </div>
    );
  }

  const grouped = groupSettings(settings, language);

  return (
    <div className="space-y-5">
      {showHeader && (
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {resolveI18nText(plugin.manifest.displayName as any, language)}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-relaxed">
            {resolveI18nText(plugin.manifest.description as any, language)}
          </p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([groupName, fields]) => (
        <div key={groupName || '__ungrouped'}>
          {/* Group header (skip for ungrouped) */}
          {groupName && (
            <div className="mt-4 mb-4 px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-indigo-400">
                {groupName}
              </span>
            </div>
          )}
          <div className="space-y-5">
            {fields.map((field) => (
              <SettingField
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={updateValue}
                language={language}
              />
            ))}
          </div>
        </div>
      ))}

      {/* 保存按钮 */}
      <div className="flex items-center gap-3 pt-3 border-t border-[var(--border-color)]">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            hasChanges
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
          } disabled:opacity-50`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        {saveSuccess && (
          <span className="text-xs text-green-400 animate-in fade-in duration-200">Saved</span>
        )}
      </div>
    </div>
  );
};
