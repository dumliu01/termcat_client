/**
 * 多语言 Context 和 Hook
 * Internationalization Context and Hook
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, getTranslation, getTranslationAsync, TranslationKeys } from './locales';

/**
 * 根据系统语言和时区自动检测默认语言
 * 如果系统语言为中文或时区为中国时区，返回 'zh'，否则返回 'en'
 */
function detectSystemLanguage(): Language {
  try {
    // 检查系统语言是否为中文
    const lang = navigator.language || '';
    if (lang.startsWith('zh')) {
      return 'zh';
    }

    // 检查时区是否为中国时区
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const chineseTimeZones = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi'];
    if (chineseTimeZones.includes(timeZone)) {
      return 'zh';
    }

    return 'en';
  } catch {
    return 'en';
  }
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKeys;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

/**
 * 多语言 Provider 组件
 */
export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLanguage
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // 优先使用传入的初始语言
    if (initialLanguage) return initialLanguage;

    // 从 localStorage 读取保存的语言设置
    const savedLanguage = localStorage.getItem('termcat_language') as Language;
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en' || savedLanguage === 'es')) {
      return savedLanguage;
    }

    // 首次启动：根据系统语言和时区自动检测
    return detectSystemLanguage();
  });

  const [t, setT] = useState<TranslationKeys>(() => getTranslation(language));

  // Load the correct language pack asynchronously on mount
  useEffect(() => {
    getTranslationAsync(language).then(translation => {
      setT(translation);
    });
  }, [language]);

  // 切换语言
  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('termcat_language', lang);
    const translation = await getTranslationAsync(lang);
    setT(translation);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

/**
 * 使用多语言的 Hook
 * @returns { language, setLanguage, t }
 *
 * @example
 * const { t, language, setLanguage } = useI18n();
 *
 * // 使用翻译
 * <button>{t.common.save}</button>
 *
 * // 切换语言
 * <button onClick={() => setLanguage('en')}>English</button>
 */
export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};

/**
 * 仅获取翻译对象的 Hook（不包含语言切换功能）
 * @returns 翻译对象
 *
 * @example
 * const t = useTranslation();
 * <button>{t.common.save}</button>
 */
export const useTranslation = (): TranslationKeys => {
  const context = useContext(I18nContext);
  //console.log('useTranslation - context:', context);
  //console.log('useTranslation - t:', context?.t);
  if (!context) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  return context.t;
};
