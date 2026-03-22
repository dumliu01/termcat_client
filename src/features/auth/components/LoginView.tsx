
import React, { useState, useEffect } from 'react';
import { User, ThemeType } from '@/utils/types';
import { Shield, ArrowRight, ArrowLeft, Loader2, UserCircle } from 'lucide-react';
import termcatIcon from '@/assets/termcat_icon.png';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { useTranslation } from '@/base/i18n/I18nContext';

interface LoginViewProps {
  onLogin: (user: User | null) => void;
  language: 'zh' | 'en';
  theme: ThemeType;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, language, theme }) => {
  const [isWaitingForBrowser, setIsWaitingForBrowser] = useState(false);
  const [authUrl, setAuthUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslation();

  // 监听 termcat:// 协议回调
  useEffect(() => {
    const cleanup = window.electron?.onAuthCallback?.((data: { token: string; user: string }) => {
      try {
        const userObj = JSON.parse(atob(data.user));
        const user: User = {
          id: userObj.id || Math.random().toString(36).substr(2, 9),
          email: userObj.email || '',
          name: userObj.username || userObj.name || 'User',
          token: data.token,
          avatar: userObj.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userObj.email || 'user'}`,
          gems: userObj.gems ?? 10,
          tier: userObj.tier || 'Standard',
          tierExpiry: userObj.tier_expiry || undefined,
        };

        logger.info(LOG_MODULE.AUTH, 'auth.protocol.login_success', 'User logged in via browser auth', {
          user_id: user.id,
        });

        // 所有数据同步由 App.tsx handleLogin 统一处理
        onLogin(user);
      } catch (err) {
        logger.error(LOG_MODULE.AUTH, 'auth.protocol.parse_failed', 'Failed to parse auth callback', {
          error: 1,
          msg: String(err),
        });
      }
    });
    return () => { cleanup?.(); };
  }, [onLogin]);

  const handleBrowserLogin = () => {
    const baseAuthUrl = import.meta.env.VITE_AUTH_URL || 'http://localhost:5174';
    const url = `${baseAuthUrl}/login?from=client&lang=${language}`;
    setAuthUrl(url);
    setIsWaitingForBrowser(true);
    window.electron?.openExternal?.(url);

    logger.info(LOG_MODULE.AUTH, 'auth.browser.opened', 'Opened browser for login', {
      auth_url: baseAuthUrl,
    });
  };

  const handleDebugLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      const mockUser: User = {
        id: 'debug-admin',
        email: 'admin@termcat.com',
        name: 'Admin',
        token: 'mock-jwt-token-' + Date.now(),
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=admin@termcat.com`,
        gems: 10,
        tier: 'Standard'
      };
      setIsLoading(false);
      onLogin(mockUser);
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#020617]">
      {/* 返回按钮 */}
      <button
        onClick={() => onLogin(null)}
        className="absolute top-12 left-10 z-20 flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm font-bold"
      >
        <ArrowLeft size={18} />
        {t.common.back}
      </button>

      {/* 动态背景光效 */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] opacity-20 blur-[150px] rounded-full bg-violet-600 animate-pulse delay-700" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.03)_0%,transparent_70%)]" />

      <div className="w-full max-w-md p-8 z-10 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-700">
        {/* 标志与标题 */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-[1.25rem] flex items-center justify-center mb-6 group cursor-pointer active:scale-90 transition-all overflow-hidden">
            <img src={termcatIcon} alt="TermCat" className="w-18 h-18 group-hover:scale-110 transition-transform" />
          </div>
          <h1 className="text-4xl font-black mb-2 text-white tracking-tight">{t.login.welcome}</h1>
          <p className="text-center text-sm font-medium text-slate-400 opacity-80 px-4">{t.login.accessRemote}</p>
        </div>

        {/* 登录卡片 */}
        <div className="backdrop-blur-2xl bg-slate-900/40 border border-white/5 p-8 rounded-[2.5rem] shadow-[0_25px_100px_rgba(0,0,0,0.5)]">
          {!isWaitingForBrowser ? (
            <div className="space-y-4">
              <button
                onClick={handleBrowserLogin}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs uppercase tracking-[0.2em] py-4 rounded-2xl transition-all shadow-[0_15px_40px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2 group active:scale-[0.97]"
              >
                {t.login.buttonLogin}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => onLogin(null)}
                className="w-full bg-white/5 border border-white/5 text-slate-400 font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-white/10 hover:text-white active:scale-[0.97]"
              >
                <UserCircle className="w-4 h-4" />
                {t.login.skipContinue}
              </button>

              {import.meta.env.DEV && (
                <button
                  onClick={handleDebugLogin}
                  disabled={isLoading}
                  className="w-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-amber-500/20 active:scale-[0.97] disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {t.login.debugLogin}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300">
              <h3 className="text-lg font-medium text-white mb-8 leading-relaxed max-w-sm">
                {t.login.waitingDesc}
              </h3>

              <p className="text-sm text-slate-400 mb-3">{t.login.waitingFallback}</p>

              <div className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-4 mb-8">
                <p className="break-all text-left text-[11px] text-indigo-400 font-mono select-all leading-relaxed opacity-80">
                  {authUrl}
                </p>
              </div>

              <button
                onClick={() => setIsWaitingForBrowser(false)}
                className="px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_30px_rgba(79,70,229,0.3)] active:scale-95"
              >
                {t.login.cancel}
              </button>

              <div className="mt-8 text-[11px] text-slate-500 font-medium">
                {t.login.terms}{' '}
                <a href="#" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">{t.login.termsLink}</a>
                {' '}{t.login.termsAnd}{' '}
                <a href="#" className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">{t.login.privacyLink}</a>.
              </div>
            </div>
          )}
        </div>

        {/* 底部安全徽章 */}
        <div className="mt-12 flex items-center justify-center">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white/5 rounded-full border border-white/5">
            <Shield className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{t.login.enterpriseSecured}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
