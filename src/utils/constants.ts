
import { ThemeType, TerminalThemeType } from './types';

/**
 * Theme configuration synchronized with AITerm
 */
export const THEME_CONFIG: Record<ThemeType, {
  name: { zh: string; en: string };
  primary: string;
  rgb: string;
  colors: Record<string, string>;
}> = {
  // Deep Dark (Cyberpunk Black)
  dark: {
    name: { zh: '极暗模式', en: 'Deep Dark' },
    primary: '#6366f1',
    rgb: '99, 102, 241',
    colors: {
      'bg-main': '#090c15',
      'bg-sidebar': '#0d111d',
      'bg-card': '#111827',
      'bg-tab': '#1a1f2e',
      'text-main': '#f1f5f9',
      'text-dim': '#94a3b8',
      'border': '#1e293b',
      'input-bg': '#0f172a',
      'terminal-bg': '#000000',
      'glass-bg': 'rgba(15, 20, 35, 0.4)',
    },
  },
  // Regular Dark (Midnight Blue)
  regular: {
    name: { zh: '常规深色', en: 'Regular Dark' },
    primary: '#6366f1',
    rgb: '99, 102, 241',
    colors: {
      'bg-main': '#1a1c23',
      'bg-sidebar': '#22252e',
      'bg-card': '#2b2f3a',
      'bg-tab': '#373c4a',
      'text-main': '#e2e8f0',
      'text-dim': '#94a3b8',
      'border': 'rgba(255, 255, 255, 0.08)',
      'input-bg': '#14161b',
      'terminal-bg': '#1e1e1e',
      'glass-bg': 'rgba(34, 39, 51, 0.5)',
    },
  },
  // Dim Slate
  dim: {
    name: { zh: '优雅灰色', en: 'Dim Slate' },
    primary: '#6366f1',
    rgb: '99, 102, 241',
    colors: {
      'bg-main': '#334155',
      'bg-sidebar': '#1e293b',
      'bg-card': '#475569',
      'bg-tab': '#64748b',
      'text-main': '#f8fafc',
      'text-dim': '#cbd5e1',
      'border': 'rgba(255, 255, 255, 0.12)',
      'input-bg': '#1e293b',
      'terminal-bg': '#2d3748',
      'glass-bg': 'rgba(30, 41, 59, 0.6)',
    },
  },
  // Urban Grey
  urban: {
    name: { zh: '工业灰色', en: 'Urban Grey' },
    primary: '#6366f1',
    rgb: '99, 102, 241',
    colors: {
      'bg-main': '#cbd5e1',
      'bg-sidebar': '#94a3b8',
      'bg-card': '#e2e8f0',
      'bg-tab': '#94a3b8',
      'text-main': '#0f172a',
      'text-dim': '#475569',
      'border': 'rgba(15, 23, 42, 0.1)',
      'input-bg': '#f1f5f9',
      'terminal-bg': '#334155',
      'glass-bg': 'rgba(203, 213, 225, 0.5)',
    },
  },
  // Light Mode
  light: {
    name: { zh: '浅色模式', en: 'Light Mode' },
    primary: '#6366f1',
    rgb: '99, 102, 241',
    colors: {
      'bg-main': '#f1f5f9',
      'bg-sidebar': '#ffffff',
      'bg-card': '#ffffff',
      'bg-tab': '#e2e8f0',
      'text-main': '#0f172a',
      'text-dim': '#475569',
      'border': 'rgba(15, 23, 42, 0.08)',
      'input-bg': '#ffffff',
      'terminal-bg': '#ffffff',
      'glass-bg': 'rgba(255, 255, 255, 0.4)',
    },
  },
};

export const TERMINAL_THEMES: Record<TerminalThemeType, {
  name: { zh: string; en: string };
  bg: string;
  fg: string;
  input: string;
  accent: string;
}> = {
  classic: { name: { zh: '经典', en: 'Classic' }, bg: '#010409', fg: '#e6edf3', input: '#6366f1', accent: '#22c55e' },
  solarized: { name: { zh: '日光', en: 'Solarized' }, bg: '#002b36', fg: '#839496', input: '#268bd2', accent: '#859900' },
  monokai: { name: { zh: '莫诺凯', en: 'Monokai' }, bg: '#272822', fg: '#f8f8f2', input: '#f92672', accent: '#a6e22e' },
  dracula: { name: { zh: '德古拉', en: 'Dracula' }, bg: '#282a36', fg: '#f8f8f2', input: '#bd93f9', accent: '#50fa7b' },
  matrix: { name: { zh: '黑客', en: 'Matrix' }, bg: '#000000', fg: '#00ff41', input: '#00ff41', accent: '#00ff41' },
};

// Payment mode configuration
export type PaymentMode = 'real';
//'simulated' | 'real';

export const PAYMENT_CONFIG: {
  mode: PaymentMode;
  description: { zh: string; en: string };
} = {
  // Modify here to switch payment mode: 'simulated' = simulated payment, 'real' = real payment
  mode: 'real',
  description: {
    zh: '模拟支付用于测试，真实支付需要后端 API 支持',
    en: 'Simulated payment for testing, real payment requires backend API support'
  }
};
