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
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-8 text-indigo-400">
          <Layout className="w-5 h-5" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px]">{t.settings.uiThemes}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.entries(THEME_CONFIG).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => setTheme(id as ThemeType)}
              className={`group flex flex-col items-center gap-4 p-4 rounded-3xl border transition-all relative overflow-hidden ${theme === id ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_10px_30px_rgba(99,102,241,0.2)]' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 hover:bg-[var(--bg-main)] hover:border-indigo-500/30'}`}
            >
              {theme === id && <div className="absolute top-0 right-0 p-2 bg-indigo-600 rounded-bl-xl"><Check className="w-3 h-3 text-white" /></div>}
              <div className="w-full h-16 rounded-2xl mb-1 p-2 flex flex-col gap-1 overflow-hidden border border-[var(--border-color)]" style={{ backgroundColor: cfg.colors['bg-main'] }}>
                <div className="flex gap-1 h-full">
                  <div className="w-2.5 h-full rounded-md" style={{ backgroundColor: cfg.colors['bg-sidebar'] }} />
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="h-3 rounded-md" style={{ backgroundColor: cfg.colors['bg-card'] }} />
                    <div className="h-2 w-2/3 rounded-md" style={{ backgroundColor: cfg.colors['bg-tab'] }} />
                    <div className="h-6 mt-auto rounded-md opacity-20" style={{ backgroundColor: cfg.colors['text-main'] }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase tracking-widest ${theme === id ? 'text-indigo-400' : 'text-[var(--text-main)]'}`}>
                  {language === 'zh' ? cfg.name.zh : cfg.name.en}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-6 opacity-40 text-[var(--text-dim)]">{t.settings.systemLanguage}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={() => setLanguage('en')} className={`py-4 rounded-3xl border font-black uppercase tracking-[0.3em] text-[10px] transition-all ${language === 'en' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-xl shadow-indigo-500/5' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 text-[var(--text-dim)]'}`}>ENGLISH</button>
          <button onClick={() => setLanguage('zh')} className={`py-4 rounded-3xl border font-black uppercase tracking-[0.3em] text-[10px] transition-all ${language === 'zh' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-xl shadow-indigo-500/5' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40 text-[var(--text-dim)]'}`}>简体中文</button>
        </div>
      </section>

      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-8"><Palette className="w-5 h-5 text-indigo-400" /><h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-indigo-400">{t.settings.terminalColorScheme}</h3></div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Object.entries(TERMINAL_THEMES).map(([id, cfg]) => (
            <button key={id} onClick={() => setTerminalTheme(id as TerminalThemeType)} className={`group p-4 rounded-3xl border transition-all ${terminalTheme === id ? 'border-indigo-500 ring-4 ring-indigo-500/10 bg-indigo-500/5 shadow-2xl shadow-indigo-500/10' : 'border-[var(--border-color)] bg-[var(--bg-main)]/40'}`}>
              <div className="h-20 rounded-2xl mb-4 p-3 flex flex-col gap-2 overflow-hidden shadow-inner border border-[var(--border-color)]" style={{ backgroundColor: cfg.bg }}><div className="h-1.5 w-full rounded-full" style={{ backgroundColor: cfg.accent }} /><div className="h-1.5 w-2/3 rounded-full opacity-30" style={{ backgroundColor: cfg.fg }} /><div className="h-1.5 w-1/2 rounded-full opacity-10" style={{ backgroundColor: cfg.fg }} /></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-center text-[var(--text-main)]">{language === 'zh' ? cfg.name.zh : cfg.name.en}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
        <h3 className="font-black uppercase tracking-[0.2em] text-[10px] mb-8 opacity-40 text-[var(--text-dim)]">{t.settings.consoleTypography}</h3>
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <div className="flex justify-between items-baseline px-1"><label className="text-[11px] font-black uppercase tracking-widest text-[var(--text-main)]">{t.settings.fontSize}</label><span className="text-xs font-black text-indigo-500 italic">{terminalFontSize}PX</span></div>
              <input type="range" min="8" max="30" step="1" value={terminalFontSize} onChange={(e) => setTerminalFontSize(parseInt(e.target.value))} className="w-full accent-indigo-500 h-1.5 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-full appearance-none cursor-pointer hover:accent-indigo-400 transition-all" />
            </div>
            <div className="space-y-4">
              <label className="text-[11px] font-black uppercase tracking-widest block px-1 text-[var(--text-main)]">{t.settings.fontFamily}</label>
              <select value={terminalFontFamily} onChange={(e) => setTerminalFontFamily(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl px-5 py-3.5 text-xs font-mono text-[var(--text-main)] outline-none cursor-pointer focus:border-indigo-500"><option value="'Fira Code', monospace">Fira Code (Ligatures)</option><option value="'JetBrains Mono', monospace">JetBrains Mono</option><option value="'Source Code Pro', monospace">Source Code Pro</option><option value="monospace">System Default Mono</option></select>
            </div>
          </div>
          <div className="p-8 rounded-[2rem] font-mono shadow-2xl border border-[var(--border-color)] overflow-hidden relative" style={{ backgroundColor: activeTermTheme.bg, color: activeTermTheme.fg, fontFamily: terminalFontFamily }}><div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Cat className="w-32 h-32" /></div><div className="flex items-center gap-3 mb-3"><div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" /><div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" /><div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" /></div><span className="text-[10px] font-black opacity-30 uppercase tracking-[0.3em] text-[var(--text-main)]">{t.settings.terminalPreview}</span></div><div className="space-y-1"><div className="flex items-center gap-3"><span className="text-emerald-500 font-bold">termcat@dev:~$</span><span className="animate-pulse" style={{ fontSize: `${terminalFontSize}px` }}>neofetch</span></div><div className="opacity-50 leading-relaxed font-medium" style={{ fontSize: `${terminalFontSize - 2}px` }}>OS: TermCat Feline v2.5.0-Preview-RC<br/>Uptime: 4 days, 12 hours, 45 mins<br/>Shell: zsh 5.9 (x86_64-apple-darwin22.0)<br/>Theme: {terminalTheme.toUpperCase()}</div></div></div>
        </div>
      </section>

      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <span className="text-xs font-bold text-[var(--text-main)] shrink-0">{t.settings.defaultFocusTarget}</span>
        <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl overflow-hidden ml-auto">
          <button
            onClick={() => setDefaultFocusTarget('input')}
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${defaultFocusTarget === 'input' ? 'bg-indigo-500 text-white shadow-md' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
          >
            {t.settings.focusCommandInput}
          </button>
          <button
            onClick={() => setDefaultFocusTarget('terminal')}
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${defaultFocusTarget === 'terminal' ? 'bg-indigo-500 text-white shadow-md' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
          >
            {t.settings.focusTerminal}
          </button>
        </div>
      </div>
    </div>
  );
};
