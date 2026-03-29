/**
 * msg-viewer i18n mapping
 *
 * msg-viewer is a host shared component, gets current language via language prop.
 * All user-visible text centralized in this file, hardcoding in components is prohibited.
 */

const zh = {
  // Token statistics
  statsInputTokens: '输入',
  statsOutputTokens: '输出',
  statsCostGems: '消耗',
  statsTokenUnit: 'tokens',
  statsGemsUnit: '积分',
};

const en: typeof zh = {
  statsInputTokens: 'In',
  statsOutputTokens: 'Out',
  statsCostGems: 'Cost',
  statsTokenUnit: 'tokens',
  statsGemsUnit: 'gems',
};

const locales: Record<string, typeof zh> = { zh, en };

export function getMsgViewerLocale(language: string): typeof zh {
  return locales[language] ?? zh;
}
