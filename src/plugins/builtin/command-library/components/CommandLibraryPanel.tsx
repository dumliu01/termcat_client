import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, Terminal as TerminalIcon, Trash2, Code, ListFilter, Pencil } from 'lucide-react';
import { useI18n } from '@/base/i18n/I18nContext';
import { useT } from '../i18n';
import { builtinPluginManager } from '../../builtin-plugin-manager';
import { COMMAND_LIBRARY_EVENTS } from '../index';

interface CustomCommand {
  title: string;
  command: string;
}

const STORAGE_KEY = 'termcat_custom_commands_v2';

const DEFAULT_COMMANDS_ZH: CustomCommand[] = [
  { title: '进程监控', command: 'top' },
  { title: '磁盘占用', command: 'df -h' },
  { title: '列出文件', command: 'ls -alh' },
  { title: '目录大小', command: 'du -sh' },
  { title: '网络连接', command: 'netstat -tuln' },
  { title: '容器列表', command: 'docker ps' },
  { title: 'SSH状态', command: 'systemctl status sshd' },
  { title: '网络配置', command: 'ifconfig' },
];

const DEFAULT_COMMANDS_EN: CustomCommand[] = [
  { title: 'Process Monitor', command: 'top' },
  { title: 'Disk Usage', command: 'df -h' },
  { title: 'List Files', command: 'ls -alh' },
  { title: 'Directory Size', command: 'du -sh' },
  { title: 'Network Connections', command: 'netstat -tuln' },
  { title: 'Docker Containers', command: 'docker ps' },
  { title: 'SSH Status', command: 'systemctl status sshd' },
  { title: 'Network Config', command: 'ifconfig' },
];

function loadCommands(language: string): CustomCommand[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch { /* fall through */ }
  }
  return language === 'zh' ? DEFAULT_COMMANDS_ZH : DEFAULT_COMMANDS_EN;
}

/** 单个命令项 */
const CommandItem: React.FC<{
  cmd: CustomCommand;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}> = ({ cmd, onSelect, onDelete, onEdit }) => {
  const tipRef = useRef<HTMLDivElement>(null);

  const adjustTipPosition = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.left = '0px';
    requestAnimationFrame(() => {
      const tipRect = tip.getBoundingClientRect();
      let containerRight = window.innerWidth;
      let el: HTMLElement | null = tip.parentElement;
      while (el) {
        const style = getComputedStyle(el);
        if (style.overflow === 'hidden' || style.overflowX === 'hidden') {
          containerRight = el.getBoundingClientRect().right;
          break;
        }
        el = el.parentElement;
      }
      const overflowRight = tipRect.right - containerRight + 8;
      if (overflowRight > 0) {
        const shift = Math.min(overflowRight, tipRect.left - 8);
        tip.style.left = `${-shift}px`;
      }
    });
  }, []);

  return (
    <div className="relative group" onMouseEnter={adjustTipPosition}>
      <div
        onClick={onSelect}
        className="w-fit min-w-[100px] max-w-[200px] h-10 flex items-center gap-2.5 px-3 border rounded-xl hover:border-primary hover:bg-primary/5 transition-all cursor-pointer shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}
      >
        <TerminalIcon className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all" />
        <span className="text-[11px] font-bold truncate flex-1 text-left" style={{ color: 'var(--text-main)' }}>{cmd.title}</span>
      </div>

      <div
        ref={tipRef}
        className="absolute top-full pt-1 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 z-[100] origin-top-left"
      >
        <div className="max-w-[min(500px,80vw)] bg-slate-900 border border-primary/40 rounded-xl px-4 py-2.5 shadow-2xl shadow-primary/40 backdrop-blur-xl flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0 border-r border-white/10 pr-3 mr-1">
            <TerminalIcon className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-tight text-white whitespace-nowrap">{cmd.title}</span>
          </div>
          <Code className="w-3 h-3 text-slate-500 shrink-0" />
          <code className="text-[10px] font-mono text-emerald-400 truncate min-w-0">
            {cmd.command}
          </code>
          <div className="ml-2 pl-2 border-l border-white/10 flex items-center gap-1">
            {onEdit && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white/10 transition-all">
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white/10 transition-all">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CommandLibraryPanelProps {
  theme: string;
  isVisible: boolean;
}

export const CommandLibraryPanel: React.FC<CommandLibraryPanelProps> = ({ theme, isVisible }) => {
  const { language } = useI18n();
  const t = useT();

  const [commands, setCommands] = useState<CustomCommand[]>(() => loadCommands(language));
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const headerBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)';
  const subHeaderBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)';

  const filteredCommands = useMemo(() =>
    commands.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.command.toLowerCase().includes(searchQuery.toLowerCase())
    ), [commands, searchQuery]);

  const persist = (updated: CustomCommand[]) => {
    setCommands(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleSelect = (cmd: string) => {
    builtinPluginManager.emit(COMMAND_LIBRARY_EVENTS.COMMAND_SELECTED, cmd);
  };

  const handleDelete = (title: string) => {
    persist(commands.filter(c => c.title !== title));
  };

  const handleEdit = (cmd: CustomCommand) => {
    setEditingTitle(cmd.title);
    setNewTitle(cmd.title);
    setNewContent(cmd.command);
    setShowModal(true);
  };

  const handleAdd = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    let updated: CustomCommand[];
    if (editingTitle) {
      updated = commands.map(c =>
        c.title === editingTitle
          ? { title: newTitle.trim(), command: newContent.trim() }
          : c
      );
    } else {
      updated = [...commands, { title: newTitle.trim(), command: newContent.trim() }];
    }
    persist(updated);
    setNewTitle('');
    setNewContent('');
    setEditingTitle(null);
    setShowModal(false);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setNewTitle('');
    setNewContent('');
    setEditingTitle(null);
  };

  return (
    <>
      <div data-testid="command-library-panel" className="flex flex-col h-full animate-in fade-in duration-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b flex items-center justify-between gap-4" style={{ backgroundColor: subHeaderBg, borderColor: 'var(--border-color)' }}>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
            <input
              data-testid="command-library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="w-full bg-black/5 border-none outline-none pl-9 pr-4 py-1.5 rounded-xl text-[11px] font-bold transition-all focus:bg-black/10"
              style={{ color: 'var(--text-main)' }}
            />
          </div>
          <button
            data-testid="command-library-add"
            onClick={() => { setEditingTitle(null); setNewTitle(''); setNewContent(''); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t.addCommand}
          </button>
        </div>

        <div data-testid="command-library-list" className="flex-1 overflow-y-auto no-scrollbar py-4 px-4 overflow-visible">
          <div className="flex flex-wrap gap-3">
            {filteredCommands.length > 0 ? filteredCommands.map((cmd) => (
              <CommandItem
                key={cmd.title}
                cmd={cmd}
                onSelect={() => handleSelect(cmd.command)}
                onDelete={() => handleDelete(cmd.title)}
                onEdit={() => handleEdit(cmd)}
              />
            )) : (
              <div className="w-full flex flex-col items-center justify-center py-20 opacity-20">
                <ListFilter className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">
                  {t.search}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 添加/编辑命令弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in duration-300" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}>
            <div className="p-6 border-b" style={{ backgroundColor: headerBg, borderColor: 'var(--border-color)' }}>
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                <Plus className="w-5 h-5 text-primary" />
                {editingTitle ? t.editCommand : t.addCommand}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  {t.commandName}
                </label>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder={t.commandNamePlaceholder}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                  style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  {t.commandContent}
                </label>
                <input
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTitle.trim() && newContent.trim()) {
                      handleAdd();
                    }
                  }}
                  placeholder={t.commandContentPlaceholder}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                  style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3" style={{ backgroundColor: headerBg, borderColor: 'var(--border-color)' }}>
              <button
                onClick={handleModalClose}
                className="flex-1 border rounded-lg py-2.5 text-sm font-bold hover:bg-black/5 transition-all"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-dim)' }}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleAdd}
                disabled={!newTitle.trim() || !newContent.trim()}
                className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTitle ? t.save : t.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
