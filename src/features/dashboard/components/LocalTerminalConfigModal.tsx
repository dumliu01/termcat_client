/**
 * LocalTerminalConfigModal — edit window for the synthetic "Local Terminal" card.
 *
 * Lets the user pick which shell the local terminal launches (PowerShell / CMD /
 * Git Bash / WSL / system default) and the start directory. The choice is
 * persisted via localTerminalConfig and applied by useTabManager.handleLocalConnect().
 */

import React, { useEffect, useState } from 'react';
import { X, Terminal } from 'lucide-react';
import { useTranslation } from '@/base/i18n/I18nContext';
import {
  loadLocalTerminalConfig,
  saveLocalTerminalConfig,
} from '@/core/terminal/localTerminalConfig';

interface ShellInfo {
  name: string;
  path: string;
  args?: string[];
}

interface LocalTerminalConfigModalProps {
  onClose: () => void;
}

// Sentinel value for the "system default" dropdown option.
const DEFAULT_VALUE = '__default__';

export const LocalTerminalConfigModal: React.FC<LocalTerminalConfigModalProps> = ({ onClose }) => {
  const t = useTranslation();
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [defaultShell, setDefaultShell] = useState<ShellInfo | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>(DEFAULT_VALUE);
  const [cwd, setCwd] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadLocalTerminalConfig();
      setCwd(saved.cwd || '');
      try {
        const api = (window as any).electron?.localTerminal;
        const [detected, def] = await Promise.all([
          api?.getShells?.() as Promise<ShellInfo[]>,
          api?.getDefaultShell?.() as Promise<ShellInfo>,
        ]);
        if (cancelled) return;
        const list = Array.isArray(detected) ? detected : [];
        setShells(list);
        setDefaultShell(def || null);
        // Restore selection if the saved shell is still available.
        if (saved.shellPath && list.some(s => s.path === saved.shellPath)) {
          setSelectedPath(saved.shellPath);
        } else {
          setSelectedPath(DEFAULT_VALUE);
        }
      } catch {
        if (!cancelled) setShells([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = () => {
    const trimmedCwd = cwd.trim();
    if (selectedPath === DEFAULT_VALUE) {
      saveLocalTerminalConfig({ cwd: trimmedCwd || undefined });
    } else {
      const shell = shells.find(s => s.path === selectedPath);
      saveLocalTerminalConfig({
        shellPath: shell?.path,
        shellArgs: shell?.args,
        shellName: shell?.name,
        cwd: trimmedCwd || undefined,
      });
    }
    onClose();
  };

  const defaultLabel = defaultShell
    ? `${t.dashboard.localTerminalConfig.systemDefault} (${defaultShell.name})`
    : t.dashboard.localTerminalConfig.systemDefault;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[var(--bg-card)] rounded-[2rem] border border-[var(--border-color)] p-8 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-[var(--text-main)] flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-emerald-400" />
            {t.dashboard.localTerminalConfig.title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] px-1 opacity-50">
              {t.dashboard.localTerminalConfig.shellType}
            </label>
            <select
              value={selectedPath}
              disabled={loading}
              onChange={e => setSelectedPath(e.target.value)}
              className="w-full bg-[var(--bg-tab)] border border-[var(--border-color)] rounded-xl py-3.5 px-5 outline-none focus:border-indigo-500 transition-all text-[var(--text-main)] text-sm disabled:opacity-50"
            >
              <option value={DEFAULT_VALUE}>{defaultLabel}</option>
              {shells.map(s => (
                <option key={s.path} value={s.path}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] px-1 opacity-50">
              {t.dashboard.localTerminalConfig.startDir}
            </label>
            <input
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              className="w-full bg-[var(--bg-tab)] border border-[var(--border-color)] rounded-xl py-3.5 px-5 outline-none focus:border-indigo-500 transition-all text-[var(--text-main)] text-sm"
              placeholder={t.dashboard.localTerminalConfig.startDirPlaceholder}
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-colors"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
