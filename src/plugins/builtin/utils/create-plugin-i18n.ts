import { useI18n } from '@/base/i18n/I18nContext';

/**
 * Create plugin-level useT hook (VS Code style).
 *
 * Plugin only gets current language from global I18nContext,
 * translation data comes entirely from the plugin's own locales.
 */
export function createPluginI18n<T>(locales: Record<string, T>, fallback: T) {
  /** Get translation for specified language (not a hook, can be used in non-component contexts like activate) */
  function getLocale(language: string): T {
    return (locales[language] ?? fallback) as T;
  }

  /** React hook: get current language translation in component */
  function useT(): T {
    const { language } = useI18n();
    return getLocale(language);
  }

  return { useT, getLocale };
}
