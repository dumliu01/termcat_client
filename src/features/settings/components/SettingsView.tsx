
import React, { useState, useEffect } from 'react';
import {
  User as UserType, ThemeType, TerminalThemeType
} from '@/utils/types';
import {
  Settings, Palette, UserCircle, Crown, Keyboard,
  HelpCircle, Cat, Hash, Puzzle
} from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { VERSION_STRING } from '@/utils/version';
import { PersonalCenter } from './SettingPersonalCenter';
import { MembershipCenter } from './SettingMembershipCenter';
import { SettingAppearance } from './SettingAppearance';
import { SettingSupport } from './SettingSupport';
import { SettingPlugins } from './SettingPlugins';

interface SettingsViewProps {
  user: UserType | null;
  updateUserState: (updates: Partial<UserType>) => void;
  handleLogout: (clearServerCache?: boolean) => void;
  setShowLogin: (show: boolean) => void;
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
  onOpenPayment: (type: 'bones' | 'vip_month' | 'vip_year', amount: number, tierId?: string) => void;
  initialTab?: 'personal' | 'membership' | 'appearance' | 'operation' | 'plugins' | 'help';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user, updateUserState, handleLogout, setShowLogin,
  language, setLanguage, theme, setTheme,
  terminalTheme, setTerminalTheme, terminalFontSize, setTerminalFontSize,
  terminalFontFamily, setTerminalFontFamily, defaultFocusTarget, setDefaultFocusTarget, onOpenPayment,
  initialTab
}) => {
  const { t } = useI18n();
  const [settingsTab, setSettingsTab] = useState<'personal' | 'membership' | 'appearance' | 'operation' | 'plugins' | 'help'>(initialTab || 'personal');

  useEffect(() => {
    if (initialTab) setSettingsTab(initialTab);
  }, [initialTab]);

  const renderContent = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 bg-indigo-600/10 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner border border-indigo-500/20">
            <Cat className="w-12 h-12 text-indigo-500" />
          </div>
          <h2 className="text-2xl font-black mb-3 text-[var(--text-main)]">{t.settings.signInRequired}</h2>
          <p className="text-sm text-[var(--text-dim)] mb-8 max-w-xs">{t.settings.loginToManage}</p>
          <button onClick={() => setShowLogin(true)} className="bg-indigo-600 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all shadow-[0_15px_40px_rgba(99,102,241,0.3)] active:scale-95" data-testid="settings-login-btn">
            {t.settings.loginNow}
          </button>
        </div>
      );
    }

    switch (settingsTab) {
      case 'personal':
        return (
          <PersonalCenter user={user} updateUserState={updateUserState} handleLogout={handleLogout} onOpenPayment={onOpenPayment} />
        );

      case 'membership':
        return (
          <MembershipCenter user={user} updateUserState={updateUserState} onOpenPayment={onOpenPayment} />
        );

      case 'appearance':
        return (
          <SettingAppearance
            language={language} setLanguage={setLanguage}
            theme={theme} setTheme={setTheme}
            terminalTheme={terminalTheme} setTerminalTheme={setTerminalTheme}
            terminalFontSize={terminalFontSize} setTerminalFontSize={setTerminalFontSize}
            terminalFontFamily={terminalFontFamily} setTerminalFontFamily={setTerminalFontFamily}
            defaultFocusTarget={defaultFocusTarget} setDefaultFocusTarget={setDefaultFocusTarget}
          />
        );

      case 'operation':
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="bg-[var(--bg-card)] p-8 rounded-[2rem] border border-[var(--border-color)] shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-3 mb-10"><Keyboard className="w-5 h-5 text-indigo-400" /><h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-indigo-400">{t.settings.keyboardMapping}</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[{ key: 'Ctrl + L', desc: t.settings.clearConsole },{ key: 'Ctrl + F', desc: t.settings.globalSearch },{ key: 'Alt + 1~9', desc: t.settings.jumpSession },{ key: 'Ctrl + Shift + P', desc: t.settings.omniPalette },{ key: 'Ctrl + Tab', desc: t.settings.cycleSession },{ key: 'Esc', desc: t.settings.blurPanels }].map((item, i) => (<div key={i} className="flex items-center justify-between p-5 bg-[var(--bg-tab)]/40 border border-[var(--border-color)] rounded-3xl hover:border-indigo-500/40 transition-all hover:shadow-xl hover:shadow-indigo-500/5 group"><span className="text-xs font-bold opacity-60 group-hover:opacity-100 transition-opacity text-[var(--text-main)]">{item.desc}</span><span className="px-4 py-1.5 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl text-[10px] font-black text-indigo-400 font-mono shadow-xl shadow-indigo-500/5 ring-1 ring-indigo-500/20">{item.key}</span></div>))}</div>
            </section>
          </div>
        );

      case 'plugins':
        return <SettingPlugins />;

      case 'help':
        return <SettingSupport />;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-500 bg-[var(--bg-main)]">
      <div className="px-8 py-5 border-b shrink-0 flex items-center justify-between bg-[var(--bg-sidebar)]/40 backdrop-blur-xl" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--text-main)] tracking-tight">{t.settings.pageTitle}</h1>
            <p className="text-xs text-[var(--text-dim)] font-medium">{t.settings.pageSubtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 border-r shrink-0 flex flex-col p-4 gap-1 bg-[var(--bg-sidebar)]/20 backdrop-blur-xl" style={{ borderColor: 'var(--border-color)' }}>
          {[
            // v2: membership tab hidden (code preserved for future re-enable)
            // { id: 'membership', icon: Crown, label: t.commerce.membershipCenter },
            { id: 'personal', icon: UserCircle, label: t.settings.tabAccount },
            { id: 'appearance', icon: Palette, label: t.settings.tabAppearance },
            // { id: 'operation', icon: Keyboard, label: t.settings.tabShortcuts },
            { id: 'plugins', icon: Puzzle, label: t.settings.tabPlugins },
            { id: 'help', icon: HelpCircle, label: t.settings.tabSupport }
          ].map(tab => (
            <button key={tab.id} onClick={() => setSettingsTab(tab.id as any)} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${settingsTab === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'}`} data-testid={`settings-tab-${tab.id}`}><tab.icon className={`w-4 h-4 ${settingsTab === tab.id ? 'text-white' : ''}`} />{tab.label}</button>
          ))}
          <div className="mt-auto pt-6 border-t border-[var(--border-color)]"><div className="flex items-center gap-4 px-6 py-2 opacity-20 hover:opacity-40 transition-opacity"><Hash className="w-4 h-4 text-[var(--text-main)]" /><span className="text-[10px] font-black uppercase tracking-[0.3em] italic text-[var(--text-main)]">{VERSION_STRING}</span></div></div>
        </aside>
        <div key={settingsTab} className="flex-1 overflow-y-auto no-scrollbar p-6" data-testid="settings-content">
          <div className="max-w-4xl mx-auto pb-10">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
};
