/**
 * App Settings Hook
 *
 * Manages persisted settings like theme, terminal theme, font size, minimal mode, etc.
 */

import { useState, useEffect, useMemo } from 'react';
import { ThemeType, TerminalThemeType } from '@/utils/types';
import { THEME_CONFIG, TERMINAL_THEMES } from '@/utils/constants';
import { MinimalPanelStates } from '@/features/shared/components/Header';

export function useAppSettings() {
  const [theme, setTheme] = useState<ThemeType>('dark');
  const [terminalTheme, setTerminalTheme] = useState<TerminalThemeType>('classic');
  const [terminalFontSize, setTerminalFontSize] = useState<number>(12);
  const [terminalFontFamily, setTerminalFontFamily] = useState<string>(() => {
    return localStorage.getItem('termcat_terminal_fontfamily') || "'Fira Code', monospace";
  });
  const [defaultFocusTarget, setDefaultFocusTarget] = useState<'input' | 'terminal'>(() => {
    const saved = localStorage.getItem('termcat_default_focus_target');
    return saved === 'input' ? 'input' : 'terminal';
  });

  // Panel states (AI panel visible by default)
  const [minimalPanelStates, setMinimalPanelStates] = useState<MinimalPanelStates>(() => {
    const saved = localStorage.getItem('termcat_minimal_panel_states');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return { sidebar: false, ai: true, bottom: false };
  });

  // Minimal mode: hide sidebar, move navigation to top title bar (enabled by default on first run)
  const [isMinimalMode, setIsMinimalMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('termcat_minimal_mode');
    if (saved === null) return true;
    return saved === 'true';
  });

  // Load theme settings from localStorage on initialization
  const loadSavedSettings = () => {
    const savedTheme = localStorage.getItem('termcat_theme') as ThemeType;
    if (savedTheme && THEME_CONFIG[savedTheme]) setTheme(savedTheme);

    const savedTerminalTheme = localStorage.getItem('termcat_terminal_theme') as TerminalThemeType;
    if (savedTerminalTheme && TERMINAL_THEMES[savedTerminalTheme]) {
      setTerminalTheme(savedTerminalTheme);
    }

    const savedFontSize = localStorage.getItem('termcat_terminal_fontsize');
    if (savedFontSize) {
      setTerminalFontSize(parseInt(savedFontSize));
    }
  };

  // Consolidated localStorage persistence with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('termcat_theme', theme);
      localStorage.setItem('termcat_terminal_theme', terminalTheme);
      localStorage.setItem('termcat_terminal_fontsize', terminalFontSize.toString());
      localStorage.setItem('termcat_default_focus_target', defaultFocusTarget);
      localStorage.setItem('termcat_minimal_panel_states', JSON.stringify(minimalPanelStates));
      localStorage.setItem('termcat_minimal_mode', isMinimalMode.toString());
      localStorage.setItem('termcat_terminal_fontfamily', terminalFontFamily);
    }, 300);
    return () => clearTimeout(timer);
  }, [theme, terminalTheme, terminalFontSize, defaultFocusTarget, minimalPanelStates, isMinimalMode, terminalFontFamily]);

  const currentTheme = THEME_CONFIG[theme];
  const activeTermTheme = TERMINAL_THEMES[terminalTheme];

  const themeStyles = useMemo(() => `
    :root {
      --primary-color: ${currentTheme.primary};
      --primary-rgb: ${currentTheme.rgb};
      --bg-main: ${currentTheme.colors['bg-main']};
      --bg-sidebar: ${currentTheme.colors['bg-sidebar']};
      --bg-card: ${currentTheme.colors['bg-card']};
      --bg-tab: ${currentTheme.colors['bg-tab']};
      --text-main: ${currentTheme.colors['text-main']};
      --text-dim: ${currentTheme.colors['text-dim']};
      --border-color: ${currentTheme.colors['border']};
      --input-bg: ${currentTheme.colors['input-bg']};
      --terminal-bg: ${currentTheme.colors['terminal-bg']};
      --terminal-fg: ${activeTermTheme.fg};
      --terminal-input: ${activeTermTheme.input};
      --terminal-accent: ${activeTermTheme.accent};
      --terminal-fs: ${terminalFontSize}px;
    }
    body { background-color: var(--bg-main); color: var(--text-main); }
    .text-primary { color: var(--primary-color) !important; }
    .bg-primary { background-color: var(--primary-color) !important; }
    .border-primary { border-color: var(--primary-color) !important; }
    .shadow-primary { box-shadow: 0 10px 15px -3px rgba(var(--primary-rgb), 0.3) !important; }
    .shadow-custom { box-shadow: ${theme === 'light' ? '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)' : 'none'}; }

    .bg-slate-950, .bg-slate-900 { background-color: var(--bg-main) !important; }
    .bg-slate-800\\/40, .bg-slate-800\\/50 { background-color: var(--bg-sidebar) !important; }
    .bg-slate-800 { background-color: var(--input-bg) !important; }
    .bg-slate-700 { background-color: ${theme === 'light' ? 'var(--bg-tab)' : 'var(--border-color)'} !important; }

    .text-slate-100, .text-slate-200, .text-white { color: var(--text-main) !important; }
    .text-slate-400, .text-slate-500 { color: var(--text-dim) !important; }
    .border-slate-800, .border-slate-700 { border-color: var(--border-color) !important; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-up { animation: fadeUp 0.3s ease-out forwards; }
  `, [currentTheme, theme, activeTermTheme, terminalFontSize]);

  return {
    theme,
    setTheme,
    terminalTheme,
    setTerminalTheme,
    terminalFontSize,
    setTerminalFontSize,
    terminalFontFamily,
    setTerminalFontFamily,
    defaultFocusTarget,
    setDefaultFocusTarget,
    minimalPanelStates,
    setMinimalPanelStates,
    isMinimalMode,
    setIsMinimalMode,
    themeStyles,
    loadSavedSettings,
  };
}
