
import React, { useState } from 'react';
import { Host, OSType, Proxy, HostGroup } from '@/utils/types';
import { Plus, Server, Trash2, Power, Search, Monitor, Laptop, Globe, Shield, Terminal, Pencil, FileCode, HardDrive, Network, Settings2, CheckSquare, Square, X, Folder, Layers, MoreHorizontal, ChevronRight, Hash, Move, ExternalLink } from 'lucide-react';
import { HostConfigModal } from './HostConfigModal';
import { useTranslation } from '@/base/i18n/I18nContext';

interface DashboardProps {
  hosts: Host[];
  groups: HostGroup[];
  proxies?: Proxy[];
  onConnect: (host: Host) => void;
  onDelete: (id: string) => void;
  onAdd: (host: Host) => void;
  onUpdate: (host: Host) => void;
  onAddGroup: (group: HostGroup) => void;
  onDeleteGroup: (id: string) => void;
  onUpdateGroup: (group: HostGroup) => void;
  onAddProxy?: (proxy: Proxy) => void;
  onUpdateProxy?: (proxy: Proxy) => void;
  onDeleteProxy?: (id: string) => void;
  onLocalConnect?: () => void;
  language: 'zh' | 'en';
  isGuest?: boolean;
  storageMode?: 'local' | 'server';
  onStorageModeChange?: (mode: 'local' | 'server') => void;
}

export const Dashboard: React.FC<DashboardProps> = React.memo(({
  hosts, groups, proxies, onConnect, onDelete, onAdd, onUpdate,
  onAddGroup, onDeleteGroup, onUpdateGroup,
  onAddProxy, onUpdateProxy, onDeleteProxy,
  onLocalConnect,
  language, isGuest, storageMode, onStorageModeChange
}) => {
  const t = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dragHostId, setDragHostId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, hostId: string) => {
    setDragHostId(hostId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', hostId);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetGroupId !== groupId) setDropTargetGroupId(groupId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropTargetGroupId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetGroupId: string | undefined) => {
    e.preventDefault();
    setDropTargetGroupId(null);
    setDragHostId(null);
    const hostId = e.dataTransfer.getData('text/plain');
    const host = hosts.find(h => h.id === hostId);
    if (!host || host.groupId === targetGroupId) return;
    onUpdate({ ...host, groupId: targetGroupId });
  };

  const handleDragEnd = () => {
    setDragHostId(null);
    setDropTargetGroupId(null);
  };

  const filteredHosts = hosts.filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          h.hostname.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeGroupId === 'all') return matchesSearch;
    if (activeGroupId === 'none') return matchesSearch && !h.groupId;
    return matchesSearch && h.groupId === activeGroupId;
  });

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in duration-700 bg-[var(--bg-main)]">
      {/* Group Sidebar */}
      <aside className="w-72 overflow-y-auto flex flex-col px-6 py-10 shrink-0 bg-[var(--bg-sidebar)]/40 backdrop-blur-xl relative">
        {/* Right border: starts below title bar to avoid bleeding into header */}
        <div className="absolute top-8 bottom-0 right-0 w-[1px] bg-[var(--border-color)]" />
        <div className="flex items-center justify-between mb-8 px-2">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-dim)]">
            {t.dashboard.group}
          </h2>
          <button
            onClick={() => setShowGroupModal(true)}
            className="p-1.5 hover:bg-black/5 rounded-lg text-indigo-400 transition-all active:scale-90"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-2">
          <button
            onClick={() => setActiveGroupId('all')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-xs font-black transition-all ${activeGroupId === 'all' ? 'bg-indigo-600 text-white shadow-[0_10px_30px_rgba(99,102,241,0.3)]' : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'}`}
          >
            <Layers className="w-4 h-4" />
            {t.dashboard.allHosts}
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-lg ${activeGroupId === 'all' ? 'bg-white/20' : 'bg-[var(--bg-tab)]'}`}>
              {hosts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveGroupId('none')}
            onDragOver={(e) => handleDragOver(e, 'none')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, undefined)}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-xs font-black transition-all ${dropTargetGroupId === 'none' ? 'ring-2 ring-indigo-400 bg-indigo-500/10' : ''} ${activeGroupId === 'none' ? 'bg-indigo-600 text-white shadow-[0_10px_30px_rgba(99,102,241,0.3)]' : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'}`}
          >
            <Hash className="w-4 h-4" />
            {t.dashboard.uncategorized}
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-lg ${activeGroupId === 'none' ? 'bg-white/20' : 'bg-[var(--bg-tab)]'}`}>
              {hosts.filter(h => !h.groupId).length}
            </span>
          </button>

          <div className="my-6 border-t border-[var(--border-color)] mx-2" />

          {groups.map(group => (
            <div
              key={group.id}
              className="group relative"
              onDragOver={(e) => handleDragOver(e, group.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, group.id)}
            >
              <button
                onClick={() => setActiveGroupId(group.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-xs font-black transition-all ${dropTargetGroupId === group.id ? 'ring-2 ring-indigo-400 bg-indigo-500/10' : ''} ${activeGroupId === group.id ? 'bg-indigo-600 text-white shadow-[0_10px_30px_rgba(99,102,241,0.3)]' : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'}`}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color || '#6366f1' }} />
                <span className="truncate">{group.name}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-lg ${activeGroupId === group.id ? 'bg-white/20' : 'bg-[var(--bg-tab)]'}`}>
                  {hosts.filter(h => h.groupId === group.id).length}
                </span>
              </button>
              <button onClick={() => onDeleteGroup(group.id)} className="absolute right-[-4px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 hover:text-rose-500 transition-all p-2">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Grid */}
      <div className="flex-1 p-10 h-full overflow-y-auto no-scrollbar relative">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Layers className="text-indigo-500 w-7 h-7" />
            <div>
              <h1 className="text-2xl font-black text-[var(--text-main)] tracking-tight">{t.dashboard.title}</h1>
              <p className="text-[12px] text-[var(--text-dim)] font-medium opacity-60">{t.dashboard.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {storageMode && onStorageModeChange && (
              <div className="flex items-center bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl p-1 gap-0.5">
                <button
                  onClick={() => onStorageModeChange('local')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    storageMode === 'local'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-black/5'
                  }`}
                >
                  <HardDrive className="w-3 h-3" />
                  {t.dashboard.localStorage}
                </button>
                <button
                  onClick={() => onStorageModeChange('server')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    storageMode === 'server'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-black/5'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  {t.dashboard.serverSync}
                </button>
              </div>
            )}
            {isGuest && hosts.length >= 2 && (
              <span className="text-[11px] text-amber-400/80 font-medium">
                {t.dashboard.guestHostLimit}，
                <span className="text-indigo-400 cursor-pointer hover:underline">{t.dashboard.loginForMore}</span>
              </span>
            )}
            <button
              onClick={() => { if (isGuest && hosts.length >= 2) return; setEditingHost(null); setShowAddModal(true); }}
              disabled={isGuest && hosts.length >= 2}
              className={`px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-3 transition-all shadow-xl ${
                isGuest && hosts.length >= 2
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-indigo-600/20'
              }`}
            >
              <Plus className="w-4 h-4" />
              {t.dashboard.addHost}
            </button>
          </div>
        </div>

        {/* Search Input Area */}
        <div className="relative mb-8">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)] opacity-40" />
          <input
            type="text"
            placeholder={t.dashboard.searchPlaceholder}
            className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl py-4 pl-12 pr-6 transition-all outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 text-[var(--text-main)] text-sm font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Compact Host Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
          {/* Local Terminal Card — Fixed first position, cannot be deleted */}
          {onLocalConnect && (
            <div className="group relative border border-emerald-500/30 bg-[var(--bg-card)] rounded-[1.25rem] p-5 transition-all hover:border-emerald-500/60 hover:-translate-y-1 shadow-lg hover:shadow-2xl">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-sm font-black text-[var(--text-main)] truncate tracking-tight mb-0.5">{t.dashboard.localTerminal}</h3>
                  <p className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest truncate opacity-50">localhost</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-5 px-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-tighter opacity-70">PTY</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-slate-500" />
                  <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-tighter opacity-70">Local</span>
                </div>
              </div>
              <button
                onClick={onLocalConnect}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-transparent text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600 hover:text-white hover:border-transparent hover:shadow-[0_8px_20px_rgba(16,185,129,0.2)] active:scale-95"
              >
                <Power className="w-3.5 h-3.5" />
                {t.dashboard.launch}
              </button>
            </div>
          )}
          {filteredHosts.length > 0 ? (
            filteredHosts.map(host => (
              <div
                key={host.id}
                draggable
                onDragStart={(e) => handleDragStart(e, host.id)}
                onDragEnd={handleDragEnd}
                className={`group relative border border-[var(--border-color)] bg-[var(--bg-card)] rounded-[1.25rem] p-5 transition-all hover:border-indigo-500/40 hover:-translate-y-1 shadow-lg hover:shadow-2xl cursor-grab active:cursor-grabbing ${dragHostId === host.id ? 'opacity-50' : ''}`}
              >

                {/* Actions: Top-Right Tiny Buttons */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => { setEditingHost(host); setShowAddModal(true); }} className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-dim)] hover:text-indigo-400"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(host.id)} className="p-1.5 hover:bg-rose-500/10 text-[var(--text-dim)] hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                {/* Primary Info: Horizontal Layout */}
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-500/5 flex items-center justify-center text-indigo-400 border border-white/5 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                    {host.os === 'linux' ? <Server className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-sm font-black text-[var(--text-main)] truncate tracking-tight mb-0.5">{host.name}</h3>
                    <p className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest truncate opacity-50">{host.username}@{host.hostname}</p>
                  </div>
                </div>

                {/* Secondary Info: Micro Dot Labels */}
                <div className="flex items-center gap-3 mb-5 px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-indigo-500" />
                    <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-tighter opacity-70">SSH V2</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-slate-500" />
                    <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-tighter opacity-70">Remote</span>
                  </div>
                  {host.groupId && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: groups.find(g => g.id === host.groupId)?.color || '#6366f1' }} />
                      <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-tighter opacity-70 truncate max-w-[60px]">
                        {groups.find(g => g.id === host.groupId)?.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action: Compact Connect Button */}
                <button
                  onClick={() => onConnect(host)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-transparent text-indigo-400 border border-indigo-500/40 hover:bg-indigo-600 hover:text-white hover:border-transparent hover:shadow-[0_8px_20px_rgba(99,102,241,0.2)] active:scale-95"
                >
                  <Power className="w-3.5 h-3.5" />
                  {t.dashboard.launch}
                </button>
              </div>
            ))
          ) : !onLocalConnect ? (
            <div className="col-span-full py-24 flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-tab)]/5">
              <Monitor className="w-12 h-12 text-[var(--text-dim)] opacity-10 mb-5" />
              <p className="text-[11px] font-black text-[var(--text-dim)] opacity-40 uppercase tracking-[0.2em]">{t.dashboard.noInfrastructure}</p>
            </div>
          ) : null}
        </div>
      </div>

      {showAddModal && (
        <HostConfigModal
          host={editingHost || undefined}
          groups={groups}
          proxies={proxies}
          onClose={() => { setShowAddModal(false); setEditingHost(null); }}
          onSave={(h) => { editingHost ? onUpdate(h) : onAdd(h); setShowAddModal(false); setEditingHost(null); }}
          onAddProxy={onAddProxy}
          onUpdateProxy={onUpdateProxy}
          onDeleteProxy={onDeleteProxy}
        />
      )}

      {showGroupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-[var(--bg-card)] rounded-[2rem] border border-[var(--border-color)] p-8 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-[var(--text-main)] mb-6">{t.dashboard.createHostGroup}</h3>
            <div className="space-y-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] px-1 opacity-50">{t.dashboard.groupName}</label>
                <input
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const name = (e.target as HTMLInputElement).value;
                      if (name) {
                        onAddGroup({ id: '', name, color: '#6366f1' });
                        setShowGroupModal(false);
                      }
                    }
                  }}
                  className="w-full bg-[var(--bg-tab)] border border-[var(--border-color)] rounded-xl py-3.5 px-5 outline-none focus:border-indigo-500 transition-all text-[var(--text-main)] text-sm"
                  placeholder={t.dashboard.groupNamePlaceholder}
                />
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowGroupModal(false)} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors">{t.common.cancel}</button>
                <button
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement);
                    if (input.value) {
                      onAddGroup({ id: '', name: input.value, color: '#6366f1' });
                      setShowGroupModal(false);
                    }
                  }}
                  className="flex-1 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-indigo-600/20"
                >
                  {t.common.add}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
