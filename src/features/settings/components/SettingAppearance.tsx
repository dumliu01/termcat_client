import React from 'react';
import { ThemeType, TerminalThemeType } from '@/utils/types';
import { THEME_CONFIG, TERMINAL_THEMES } from '@/utils/constants';
import { Check, Palette, Cat, Layout } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';

interface SettingAppearanceProps {
  language: 'zh' | 'en';
  setLanguage: (lang: 'zh' | 'en') => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  terminalTheme: TerminalThemeType;
  setTerminalTheme: (theme: TerminalThemeType) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (font: string) => void;
  defaultFocusTarget: 'input' | 'terminal';
  setDefaultFocusTarget: (target: 'input' | 'terminal') => void;
}

export const SettingAppearance: React.FC<SettingAppearanceProps> = ({
  language, setLanguage, theme, setTheme,
  terminalTheme, setTerminalTheme, terminalFontSize, setTerminalFontSize,
  terminalFontFamily, setTerminalFontFamily,
  defaultFocusTarget, setDefaultFocusTarget
}) => {
  const { t } = useI18n();
  const activeTermTheme = TERMINAL_THEMES[terminalTheme];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* UI Themes */}
      <section className="bg-[var(--bg-card)] px-6 py-5 rounded-2xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-indigo-400">
          <Layout className="w-4 h-4" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">{t.settings.uiThemes}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(THEME_CONFIG).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => setTheme(id as ThemeType)}
              className={`group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all relative overflow-hidden ${theme === id ? 'border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 hover:border-indigo-500/30'}`}
            >
              {theme === id && <div className="absolute top-0 right-0 p-1.5 bg-indigo-600 rounded-bl-lg"><Check className="w-2.5 h-2.5 text-white" /></div>}
              <div className="w-full h-12 rounded-lg p-1.5 flex flex-col gap-0.5 overflow-hidden border border-[var(--border-color)]" style={{ backgroundColor: cfg.colors['bg-main'] }}>
                <div className="flex gap-0.5 h-full">
                  <div className="w-2 h-full rounded-sm" style={{ backgroundColor: cfg.colors['bg-sidebar'] }} />
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="h-2 rounded-sm" style={{ backgroundColor: cfg.colors['bg-card'] }} />
                    <div className="h-1.5 w-2/3 rounded-sm" style={{ backgroundColor: cfg.colors['bg-tab'] }} />
                    <div className="h-4 mt-auto rounded-sm opacity-20" style={{ backgroundColor: cfg.colors['text-main'] }} />
                  </div>
                </div>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${theme === id ? 'text-indigo-400' : 'text-[var(--text-main)]'}`}>
                {language === 'zh' ? cfg.name.zh : cfg.name.en}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="bg-[var(--bg-card)] px-6 py-5 rounded-2xl border border-[var(--border-color)] shadow-sm">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-3 opacity-40 text-[var(--text-dim)]">{t.settings.systemLanguage}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setLanguage('en')} className={`py-2.5 rounded-xl border font-black uppercase tracking-[0.3em] text-[10px] transition-all ${language === 'en' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 text-[var(--text-dim)]'}`}>ENGLISH</button>
          <button onClick={() => setLanguage('zh')} className={`py-2.5 rounded-xl border font-black uppercase tracking-[0.3em] text-[10px] transition-all ${language === 'zh' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 text-[var(--text-dim)]'}`}>简体中文</button>
        </div>
      </section>

      {/* Terminal Theme */}
      <section className="bg-[var(--bg-card)] px-6 py-5 rounded-2xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-indigo-400">
          <Palette className="w-4 h-4" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">{t.settings.terminalColorScheme}</h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Object.entries(TERMINAL_THEMES).map(([id, cfg]) => (
            <button key={id} onClick={() => setTerminalTheme(id as TerminalThemeType)} className={`group p-3 rounded-xl border transition-all ${terminalTheme === id ? 'border-indigo-500 ring-2 ring-indigo-500/10 bg-indigo-500/5' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40'}`}>
              <div className="h-12 rounded-lg mb-2 p-2 flex flex-col gap-1 overflow-hidden border border-[var(--border-color)]" style={{ backgroundColor: cfg.bg }}><div className="h-1 w-full rounded-full" style={{ backgroundColor: cfg.accent }} /><div className="h-1 w-2/3 rounded-full opacity-30" style={{ backgroundColor: cfg.fg }} /><div className="h-1 w-1/2 rounded-full opacity-10" style={{ backgroundColor: cfg.fg }} /></div>
              <p className="text-[9px] font-black uppercase tracking-widest text-center text-[var(--text-main)]">{language === 'zh' ? cfg.name.zh : cfg.name.en}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Font Settings + Preview */}
      <section className="bg-[var(--bg-card)] px-6 py-5 rounded-2xl border border-[var(--border-color)] shadow-sm">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-4 opacity-40 text-[var(--text-dim)]">{t.settings.consoleTypography}</h3>
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="space-y-2">
            <div className="flex justify-between items-baseline px-1"><label className="text-[11px] font-black uppercase tracking-widest text-[var(--text-main)]">{t.settings.fontSize}</label><span className="text-xs font-black text-indigo-500 italic">{terminalFontSize}PX</span></div>
            <input type="range" min="8" max="30" step="1" value={terminalFontSize} onChange={(e) => setTerminalFontSize(parseInt(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-full appearance-none cursor-pointer" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest block px-1 text-[var(--text-main)]">{t.settings.fontFamily}</label>
            <select value={terminalFontFamily} onChange={(e) => setTerminalFontFamily(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-xs font-mono text-[var(--text-main)] outline-none cursor-pointer focus:border-indigo-500"><option value="'Fira Code', monospace">Fira Code (Ligatures)</option><option value="'JetBrains Mono', monospace">JetBrains Mono</option><option value="'Source Code Pro', monospace">Source Code Pro</option><option value="monospace">System Default Mono</option></select>
          </div>
        </div>
        <div className="p-5 rounded-xl font-mono shadow-inner border border-[var(--border-color)] overflow-hidden relative" style={{ backgroundColor: activeTermTheme.bg, color: activeTermTheme.fg, fontFamily: terminalFontFamily }}><div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none"><Cat className="w-20 h-20" /></div><div className="flex items-center gap-2 mb-2"><div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-rose-500/50" /><div className="w-2 h-2 rounded-full bg-amber-500/50" /><div className="w-2 h-2 rounded-full bg-emerald-500/50" /></div><span className="text-[9px] font-black opacity-30 uppercase tracking-[0.3em] text-[var(--text-main)]">{t.settings.terminalPreview}</span></div><div className="space-y-0.5"><div className="flex items-center gap-2"><span className="text-emerald-500 font-bold text-xs">termcat@dev:~$</span><span style={{ fontSize: `${terminalFontSize}px` }}>neofetch</span></div><div className="opacity-50 leading-relaxed font-medium" style={{ fontSize: `${Math.max(terminalFontSize - 2, 10)}px` }}>OS: TermCat Feline v2.5.0<br/>Shell: zsh 5.9<br/>Theme: {terminalTheme.toUpperCase()}</div></div></div>
      </section>

      {/* Focus Target */}
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <span className="text-xs font-bold text-[var(--text-main)] shrink-0">{t.settings.defaultFocusTarget}</span>
        <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg overflow-hidden ml-auto">
          <button
            onClick={() => setDefaultFocusTarget('input')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${defaultFocusTarget === 'input' ? 'bg-indigo-500 text-white' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
          >
            {t.settings.focusCommandInput}
          </button>
          <button
            onClick={() => setDefaultFocusTarget('terminal')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${defaultFocusTarget === 'terminal' ? 'bg-indigo-500 text-white' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
          >
            {t.settings.focusTerminal}
          </button>
        </div>
      </div>
    </div>
  );
};
