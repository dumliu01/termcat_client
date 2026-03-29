
import React from 'react';
import { ViewState, User } from '@/utils/types';
import { Terminal, Settings, LayoutDashboard, Languages, LogOut, UserCircle, LogIn, User as UserIcon, Crown, Check, Blocks } from 'lucide-react';
import { useTranslation } from '@/base/i18n/I18nContext';
import { HoverPopupMenu } from './HoverPopupMenu';
import termcatIcon from '@/assets/termcat_icon.png';

interface SidebarProps {
  activeView: ViewState;
  setActiveView: (view: ViewState) => void;
  language: 'zh' | 'en' | 'es';
  setLanguage: (lang: 'zh' | 'en' | 'es') => void;
  user: User | null;
  onLogout: () => void;
  onLoginRequest: () => void;
  terminalCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  language,
  setLanguage,
  user,
  onLogout,
  onLoginRequest,
  terminalCount = 0
}) => {
  const t = useTranslation();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t.sidebar.fleet },
    { id: 'terminal', icon: Terminal, label: t.sidebar.shell },
    { id: 'extensions', icon: Blocks, label: t.sidebar.extensions },
    { id: 'settings', icon: Settings, label: t.sidebar.setup },
  ];

  const languages: { id: 'zh' | 'en' | 'es', label: string }[] = [
    { id: 'en', label: 'English' },
    { id: 'zh', label: '中文' },
    { id: 'es', label: 'Español' },
  ];

  return (
    <aside className="w-12 pt-10 flex flex-col shrink-0 relative z-[100] transition-all bg-[var(--bg-sidebar)]/80 backdrop-blur-xl drag-region">
      {/* Windows: prevent sidebar drag-region from covering Header's custom traffic light buttons */}
      <div className="absolute top-0 left-0 right-0 h-8 no-drag" />
      {/* Right border: starts below title bar (top-8 = 32px) to avoid bleeding into traffic lights area */}
      <div className="absolute top-8 bottom-0 right-0 w-[1px] bg-[var(--border-color)]" />
      {/* Top Logo */}
      <div className="h-16 flex flex-col items-center justify-center border-b border-[var(--border-color)] group no-drag cursor-pointer" onClick={() => setActiveView('dashboard')}>
        <div className="w-8 h-8 flex items-center justify-center transition-transform group-hover:rotate-6 active:scale-90">
          <img src={termcatIcon} alt="TermCat" className="w-8 h-8 rounded-xl" style={{ backgroundColor: 'transparent' }} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-1 space-y-2 py-2 no-drag">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const isTerminal = item.id === 'terminal';
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as ViewState)}
              className={`w-10 h-10 mx-auto flex flex-col items-center justify-center rounded-2xl transition-all duration-300 relative group ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]'
                  : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'
              }`}
            >
              {isActive && (
                <div className="absolute left-[-4px] w-1 h-8 bg-indigo-500 rounded-r-full shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
              )}
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-indigo-400' : ''}`} />
                {/* Terminal count badge */}
                {isTerminal && terminalCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-slate-700 text-slate-300 text-[8px] font-black rounded-full flex items-center justify-center px-1 border border-white/5 pointer-events-none opacity-80">
                    {terminalCount > 99 ? '99+' : terminalCount}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer Tools */}
      <div className="p-3 border-t border-[var(--border-color)] flex flex-col items-center gap-4 pb-4 no-drag">
        {/* Language menu */}
        <HoverPopupMenu
          placement="right-end"
          closeDelay={150}
          contentClassName="rounded-[1.5rem] p-2"
          trigger={(isOpen) => (
            <button
              className={`w-10 h-10 flex items-center justify-center text-[var(--text-dim)] hover:text-indigo-400 hover:bg-black/5 rounded-xl transition-all ${isOpen ? 'text-indigo-400 bg-black/5' : ''}`}
            >
              <Languages className="w-5 h-5" />
            </button>
          )}
        >
          {(close) => languages.map((lang) => (
            <button
              key={lang.id}
              onClick={() => { setLanguage(lang.id); close(); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${language === lang.id ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              {lang.label}
              {language === lang.id && <Check className="w-3 h-3" />}
            </button>
          ))}
        </HoverPopupMenu>

        {/* User menu */}
        <HoverPopupMenu
          placement="right-end"
          closeDelay={150}
          contentClassName="rounded-[2rem] p-4 w-48"
          trigger={(isOpen) => (
            <button
              onClick={() => setActiveView('settings')}
              className={`w-8 h-8 rounded-xl overflow-hidden border transition-all flex flex-col items-center justify-center shadow-lg shrink-0 ${
                user
                  ? 'border-indigo-500/20 bg-indigo-500/5'
                  : 'bg-black/5 border-[var(--border-color)] text-[var(--text-dim)] hover:text-indigo-400 hover:border-indigo-500/30'
              } hover:border-indigo-500 group`}
              data-testid="sidebar-user-btn"
            >
              {user ? (
                <div className="flex flex-col items-center">
                  <UserIcon className="w-3 h-3 text-slate-400" />
                </div>
              ) : (
                <UserCircle className="w-5 h-5" />
              )}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-3 py-3 border-b border-[var(--border-color)] mb-2 text-center">
                <p className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.2em] truncate" data-testid="sidebar-user-name">
                  {user ? user.name : t.sidebar.anonymous}
                </p>
                {/* v2: tier badge hidden */}
              </div>
              {user ? (
                <button
                  onClick={() => { onLogout(); close(); }}
                  className="w-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-all py-3 px-3 rounded-xl"
                >
                  <LogOut className="w-4 h-4" />
                  {t.sidebar.logout}
                </button>
              ) : (
                <button
                  onClick={() => { onLoginRequest(); close(); }}
                  className="w-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all py-3 px-3 rounded-xl"
                >
                  <LogIn className="w-4 h-4" />
                  {t.sidebar.login}
                </button>
              )}
            </>
          )}
        </HoverPopupMenu>
      </div>
    </aside>
  );
};
