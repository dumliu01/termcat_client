import { useI18n } from '@/base/i18n/I18nContext';

/**
 * 创建插件级别的 useT hook（VS Code 风格）。
 *
 * 插件只从全局 I18nContext 获取当前语言，
 * 翻译数据完全来自插件自身的 locales。
 */
export function createPluginI18n<T>(locales: Record<string, T>, fallback: T) {
  /** 获取指定语言的翻译（非 hook，可在 activate 等非组件上下文使用） */
  function getLocale(language: string): T {
    return (locales[language] ?? fallback) as T;
  }

  /** React hook：在组件中获取当前语言对应的翻译 */
  function useT(): T {
    const { language } = useI18n();
    return getLocale(language);
  }

  return { useT, getLocale };
}
