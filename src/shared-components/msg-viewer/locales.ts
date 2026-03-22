/**
 * msg-viewer 多语言映射
 *
 * msg-viewer 是宿主共享组件，通过 language prop 获取当前语言。
 * 所有用户可见文本集中在此文件，禁止在组件中硬编码。
 */

const zh = {
  // token 统计
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
