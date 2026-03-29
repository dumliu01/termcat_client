import React, { useEffect, useState } from 'react';
import { ViewState, User } from '@/utils/types';
import { useTranslation } from '@/base/i18n/I18nContext';
import termcatIcon from '@/assets/termcat_icon.png';
import {
  PanelLeft, PanelRight, PanelBottom,
  Minimize2, Maximize2,
  LayoutDashboard, Terminal, Settings, Blocks,
  Languages, LogOut, LogIn, UserCircle, User as UserIcon, Crown, Check,
  Minus, Square, X
} from 'lucide-react';
import { HoverPopupMenu } from './HoverPopupMenu';

export interface MinimalPanelStates {
  sidebar: boolean;
  ai: boolean;
  bottom: boolean;
}

interface HeaderProps {
  activeSessionName?: string;
  activeView: ViewState;
  minimalPanelStates: MinimalPanelStates;
  setMinimalPanelStates: (states: MinimalPanelStates) => void;
  // Minimal mode props
  isMinimalMode?: boolean;
  setIsMinimalMode?: (mode: boolean) => void;
  setActiveView?: (view: ViewState) => void;
  user?: User | null;
  onLoginRequest?: () => void;
  onLogout?: () => void;
  language?: 'zh' | 'en' | 'es';
  setLanguage?: (lang: 'zh' | 'en' | 'es') => void;
  terminalSessionCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeSessionName,
  activeView,
  minimalPanelStates,
  setMinimalPanelStates,
  isMinimalMode = false,
  setIsMinimalMode,
  setActiveView,
  user,
  onLoginRequest,
  onLogout,
  language,
  setLanguage,
  terminalSessionCount = 0
}) => {
  const t = useTranslation();
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    window.electron.getPlatform().then(setPlatform);
  }, []);

  const isWindows = platform === 'win32';

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t.sidebar.fleet },
    { id: 'terminal', icon: Terminal, label: t.sidebar.shell },
    { id: 'extensions', icon: Blocks, label: t.sidebar.extensions },
    { id: 'settings', icon: Settings, label: t.sidebar.setup },
  ];

  const languages: { id: 'zh' | 'en' | 'es'; label: string }[] = [
    { id: 'en', label: 'English' },
    { id: 'zh', label: '中文' },
    { id: 'es', label: 'Español' },
  ];

  return (
    <div
      className={`flex items-center justify-between px-2 drag-region select-none absolute top-0 left-0 right-0 z-[1000] transition-all ${
        isMinimalMode
          ? 'h-10 bg-[var(--bg-main)] border-b border-[var(--border-color)]'
          : 'h-8 bg-transparent border-none'
      }`}
    >
      {/* Left: Window controls / Traffic lights spacer + Navigation (minimal mode) */}
      <div className="flex items-center gap-4 no-drag">
        {isWindows ? (
          /* Windows: custom traffic light buttons */
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <button
              onClick={() => window.electron.windowClose()}
              className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 flex items-center justify-center group transition-colors"
              title="close"
            >
              <X className="w-2 h-2 text-[#4a0002] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
            </button>
            <button
              onClick={() => window.electron.windowMinimize()}
              className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 flex items-center justify-center group transition-colors"
              title="minimize"
            >
              <Minus className="w-2 h-2 text-[#985712] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
            </button>
            <button
              onClick={() => window.electron.windowMaximize()}
              className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 flex items-center justify-center group transition-colors"
              title="maximize"
            >
              <Square className="w-1.5 h-1.5 text-[#0b6518] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={3} />
            </button>
          </div>
        ) : (
          /* macOS: native traffic lights occupy ~70px, reserve space */
          <div className="w-16 shrink-0" />
        )}

        {isMinimalMode && setActiveView && (
          <div className="flex items-center gap-1 ml-2 border-l pl-4" style={{ borderColor: 'var(--border-color)' }}>
            {/* Logo */}
            <div
              className="w-6 h-6 rounded-lg overflow-hidden shadow-[0_0_10px_rgba(99,102,241,0.4)] mr-2 cursor-pointer"
              onClick={() => setActiveView('dashboard')}
            >
              <img src={termcatIcon} alt="TermCat" className="w-full h-full object-cover" />
            </div>

            {/* Nav buttons */}
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as ViewState)}
                  className={`px-3 h-7 flex items-center gap-2 rounded-md transition-all duration-300 relative group ${
                    isActive
                      ? 'bg-[rgba(var(--primary-rgb),0.1)] text-[var(--primary-color)]'
                      : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'
                  }`}
                  title={item.label}
                >
                  <div className="relative">
                    <Icon className={`w-3.5 h-3.5 transition-transform group-hover:scale-110 ${isActive ? 'text-[var(--primary-color)]' : ''}`} />
                    {item.id === 'terminal' && terminalSessionCount > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 min-w-[12px] h-3 bg-slate-700 text-slate-300 text-[8px] font-black rounded-full flex items-center justify-center px-0.5 border border-white/5 pointer-events-none opacity-80">
                        {terminalSessionCount > 99 ? '99+' : terminalSessionCount}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Center: Title + Session Name */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
        <div className="bg-black/20 backdrop-blur-md px-3 py-0.5 rounded-full border border-white/5 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {activeSessionName ? `TERMCAT-AI (${activeSessionName})` : 'TERMCAT-AI'}
          </span>
        </div>
      </div>

      {/* Right: Minimal mode menus + Panel Controls + Toggle */}
      <div className="flex items-center gap-3 no-drag">
        {/* Language & User menus (minimal mode only) */}
        {isMinimalMode && setLanguage && language && (
          <div className="flex items-center gap-2 border-r border-[var(--border-color)] pr-4 mr-1">
            {/* Language menu */}
            <HoverPopupMenu
              contentClassName="rounded-xl p-2 min-w-[144px]"
              trigger={(isOpen) => (
                <button
                  className={`w-7 h-7 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--primary-color)] hover:bg-black/5 rounded-lg transition-all ${isOpen ? 'text-[var(--primary-color)] bg-black/5' : ''}`}
                >
                  <Languages className="w-3.5 h-3.5" />
                </button>
              )}
            >
              {(close) => languages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => { setLanguage(lang.id); close(); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === lang.id ? 'bg-[rgba(var(--primary-rgb),0.1)] text-[var(--primary-color)]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                  {lang.label}
                  {language === lang.id && <Check className="w-3 h-3" />}
                </button>
              ))}
            </HoverPopupMenu>

            {/* User menu */}
            <HoverPopupMenu
              contentClassName="rounded-2xl p-4 min-w-[192px]"
              trigger={(isOpen) => (
                <button
                  onClick={() => setActiveView?.('settings')}
                  className={`w-7 h-7 rounded-lg overflow-hidden border transition-all flex flex-col items-center justify-center shadow-lg ${
                    user
                      ? 'border-indigo-500/20 bg-indigo-500/5'
                      : 'bg-black/5 border-[var(--border-color)] text-[var(--text-dim)] hover:text-[var(--primary-color)] hover:border-[var(--primary-color)]/30'
                  } hover:border-[var(--primary-color)] group`}
                  data-testid="header-user-btn"
                >
                  {user ? (
                    <UserIcon className="w-3 h-3 text-slate-400" />
                  ) : (
                    <UserCircle className="w-4 h-4" />
                  )}
                </button>
              )}
            >
              {(close) => (
                <>
                  <div className="px-3 py-3 border-b border-[var(--border-color)] mb-2 text-center">
                    <p className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-[0.2em] truncate" data-testid="header-user-name">
                      {user ? user.name : t.sidebar.anonymous}
                    </p>
                    {/* v2: tier badge hidden */}
                  </div>
                  {user ? (
                    <button
                      onClick={() => { onLogout?.(); close(); }}
                      className="w-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-all py-3 px-3 rounded-xl"
                    >
                      <LogOut className="w-4 h-4" />
                      {t.sidebar.logout}
                    </button>
                  ) : (
                    <button
                      onClick={() => { onLoginRequest?.(); close(); }}
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
        )}

        {/* Panel toggle buttons (terminal view only) */}
        {activeView === 'terminal' && (
          <div className="flex items-center gap-1 border-r border-[var(--border-color)] pr-4 mr-1">
            <button
              onClick={() => setMinimalPanelStates({...minimalPanelStates, sidebar: !minimalPanelStates.sidebar})}
              className={`p-1.5 rounded-lg transition-colors ${minimalPanelStates.sidebar ? 'bg-[rgba(var(--primary-rgb),0.1)] text-primary' : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
              title={t.header.monitorPanel}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMinimalPanelStates({...minimalPanelStates, bottom: !minimalPanelStates.bottom})}
              className={`p-1.5 rounded-lg transition-colors ${minimalPanelStates.bottom ? 'bg-[rgba(var(--primary-rgb),0.1)] text-primary' : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
              title={t.header.bottomPanel}
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMinimalPanelStates({...minimalPanelStates, ai: !minimalPanelStates.ai})}
              className={`p-1.5 rounded-lg transition-colors ${minimalPanelStates.ai ? 'bg-[rgba(var(--primary-rgb),0.1)] text-primary' : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
              title={t.header.aiAssistant}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Minimal mode toggle (always visible) */}
        {setIsMinimalMode && (
          <button
            onClick={() => setIsMinimalMode(!isMinimalMode)}
            className={`p-1.5 rounded-lg transition-colors ${isMinimalMode ? 'bg-[rgba(var(--primary-rgb),0.1)] text-primary' : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
            title={isMinimalMode ? t.header.exitMinimalMode : t.header.enterMinimalMode}
          >
            {isMinimalMode ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Bottom border: full width in minimal mode, skip sidebar in normal mode */}
      {!isMinimalMode && (
        <div className="absolute bottom-0 left-12 right-0 h-[1px] bg-[var(--border-color)]" />
      )}
    </div>
  );
};
