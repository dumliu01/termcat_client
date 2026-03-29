/**
 * Internationalization Configuration Index
 */

// Only import the type + default language synchronously
import { zh, TranslationKeys } from './zh';

export type Language = 'zh' | 'en' | 'es';
export type { TranslationKeys };

// Default language loaded synchronously for instant startup
const defaultTranslations: TranslationKeys = zh;

// Lazy loaders for non-default languages
const lazyLoaders: Record<Language, () => Promise<TranslationKeys>> = {
  zh: () => Promise.resolve(zh),
  en: () => import('./en').then(m => m.en),
  es: () => import('./es').then(m => m.es),
};

/**
 * Get translation synchronously (only for initializing default language)
 */
export function getTranslationSync(lang: Language): TranslationKeys {
  if (lang === 'zh') return zh;
  // Fallback to zh for non-default languages (async load needed)
  return zh;
}

/**
 * Get translation for specified language asynchronously
 */
export async function getTranslationAsync(lang: Language): Promise<TranslationKeys> {
  const loader = lazyLoaders[lang] || lazyLoaders.zh;
  return await loader();
}

// Keep backward compatibility - synchronous version returns zh for non-zh
export function getTranslation(lang: Language): TranslationKeys {
  return getTranslationSync(lang);
}

/**
 * Supported language list
 */
export const supportedLanguages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

/**
 * Default language
 */
export const defaultLanguage: Language = 'zh';
