
import React, { useState } from 'react';
import { Host, HostGroup, Tunnel, Proxy } from '@/utils/types';
import {
  X, Terminal, Globe2, Network,
  Lock, FileKey, Globe, Trash2, Pencil, Plus, Check, Info, ChevronRight, Server,
  ArrowRightLeft, Radio, ShieldCheck, User as UserIcon
} from 'lucide-react';
import { useI18n, useTranslation } from '@/base/i18n/I18nContext';

interface HostConfigModalProps {
  host?: Host;
  groups: HostGroup[];
  proxies?: Proxy[];
  onClose: () => void;
  onSave: (host: Host) => void;
  onAddProxy?: (p: Proxy) => void;
  onUpdateProxy?: (p: Proxy) => void;
  onDeleteProxy?: (id: string) => void;
}

type ConfigTab = 'ssh' | 'terminal' | 'proxy' | 'tunnel';

export const HostConfigModal: React.FC<HostConfigModalProps> = ({
  host, groups, proxies: externalProxies, onClose, onSave,
  onAddProxy, onUpdateProxy, onDeleteProxy
}) => {
  const { language } = useI18n();
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState<ConfigTab>('ssh');
  const [formData, setFormData] = useState<Host>(host || {
    id: Math.random().toString(36).substr(2, 9),
    name: '', hostname: '', username: '', port: 22,
    authType: 'password', password: '', sshKey: '',
    os: 'linux', tags: [], notes: '',
    connectionType: 'direct',
    advanced: { smartAccel: false, execChannel: true },
    terminal: { encoding: 'UTF-8', backspaceSeq: 'ASCII', deleteSeq: 'VT220' },
    tunnels: []
  });

  // 当 host prop 变化时，同步更新 formData（处理编辑现有主机的情况）
  React.useEffect(() => {
    if (host) {
      setFormData(host);
    }
  }, [host]);

  // Local proxy management (when external props not provided)
  const [localProxies, setLocalProxies] = useState<Proxy[]>([]);
  const proxies = externalProxies || localProxies;

  // Proxy Edit Form State
  const [isProxyFormOpen, setIsProxyFormOpen] = useState(false);
  const [proxyEditData, setProxyEditData] = useState<Proxy | null>(null);

  // Tunnel Edit Form State
  const [isTunnelFormOpen, setIsTunnelFormOpen] = useState(false);
  const [tunnelEditData, setTunnelEditData] = useState<Tunnel | null>(null);

  const handleOpenProxyForm = (p?: Proxy) => {
    setProxyEditData(p || {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      type: 'SOCKS5',
      hostname: '',
      port: 1080,
      username: '',
      password: ''
    });
    setIsProxyFormOpen(true);
  };

  const handleSaveProxy = () => {
    if (!proxyEditData || !proxyEditData.name || !proxyEditData.hostname) return;
    
    // 确保端口有有效的默认值
    const proxyToSave = {
      ...proxyEditData,
      port: proxyEditData.port || 1080
    };
    
    const isNew = !proxies.find(p => p.id === proxyToSave.id);
    if (onAddProxy && onUpdateProxy) {
      if (isNew) onAddProxy(proxyToSave);
      else onUpdateProxy(proxyToSave);
    } else {
      if (isNew) setLocalProxies([...localProxies, proxyToSave]);
      else setLocalProxies(localProxies.map(p => p.id === proxyToSave.id ? proxyToSave : p));
    }
    setIsProxyFormOpen(false);
    setProxyEditData(null);
  };

  const handleDeleteProxyItem = (id: string) => {
    if (onDeleteProxy) {
      onDeleteProxy(id);
    } else {
      setLocalProxies(localProxies.filter(p => p.id !== id));
    }
    // 清除 proxyId 和 proxy 字段
    if (formData.proxyId === id) {
      setFormData({...formData, proxyId: undefined, proxy: undefined});
    }
  };

  const handleOpenTunnelForm = (tun?: Tunnel) => {
    setTunnelEditData(tun || {
      id: Math.random().toString(36).substr(2, 9),
      name: '', type: 'L', listenPort: 8080, targetAddress: '127.0.0.1', targetPort: 80
    });
    setIsTunnelFormOpen(true);
  };

  const handleSaveTunnel = () => {
    if (!tunnelEditData || !tunnelEditData.name) return;
    
    // 确保端口有有效的默认值
    const tunnelToSave = {
      ...tunnelEditData,
      listenPort: tunnelEditData.listenPort || 8080,
      targetPort: tunnelEditData.targetPort || 80
    };
    
    const currentTunnels = formData.tunnels || [];
    const exists = currentTunnels.find(item => item.id === tunnelEditData.id);
    let newTunnels;
    if (exists) {
      newTunnels = currentTunnels.map(item => item.id === tunnelEditData.id ? tunnelToSave : item);
    } else {
      newTunnels = [...currentTunnels, tunnelToSave];
    }
    setFormData({ ...formData, tunnels: newTunnels });
    setIsTunnelFormOpen(false);
    setTunnelEditData(null);
  };

  const handleDeleteTunnel = (id: string) => {
    const newTunnels = (formData.tunnels || []).filter(item => item.id !== id);
    setFormData({ ...formData, tunnels: newTunnels });
  };

  // Process form data for submission
  const processSubmitData = (): Host => {
    const isJump = formData.connectionType === 'jump';
    return {
      ...formData,
      tags: formData.tags?.length ? formData.tags : ['remote'],
      password: formData.authType === 'password' ? formData.password : '',
      sshKey: formData.authType === 'ssh_key' ? formData.sshKey : '',
      proxyId: formData.proxyId,
      connectionType: formData.connectionType || 'direct',
      targetHost: isJump ? formData.targetHost : undefined,
      // 隧道随 host 一起保存，新建隧道 id 传空（后端分配）
      tunnels: (formData.tunnels || []).map(t => ({
        ...t,
        id: t.id && !t.id.match(/^[a-z0-9]{9}$/) ? t.id : '',
      })),
      proxy: undefined,
    };
  };

  const handleApply = () => {
    onSave(processSubmitData());
  };

  const handleSaveAndClose = () => {
    const isLocal = formData.connectionType === 'local';
    if (formData.name && (isLocal || (formData.hostname && formData.username))) {
      onSave(processSubmitData());
      onClose();
    }
  };

  const tunnelTypeLabel = (type: string) => {
    switch (type) {
      case 'L': return 'Local';
      case 'R': return 'Remote';
      case 'D': return 'Dynamic';
      default: return type;
    }
  };

  const tunnelTypeClass = (type: string) => {
    switch (type) {
      case 'L': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'R': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  const renderSSHConfig = () => (
    <div className="pt-4 pb-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="relative border border-[var(--border-color)] rounded-2xl p-6 bg-black/5">
        <span className="absolute -top-3 left-4 px-2 bg-[var(--bg-card)] text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest z-10">{t.hostConfig.ssh.general}</span>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:flex-[2] space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.name}</label>
              <input
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
                placeholder={language === 'zh' ? '例如: Web 服务器 01' : 'e.g. Web Server 01'}
              />
            </div>
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.group}</label>
              <div className="relative">
                <select
                  value={formData.groupId || ''}
                  onChange={e => setFormData({...formData, groupId: e.target.value || undefined})}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none appearance-none cursor-pointer pr-10"
                >
                  <option value="">{t.hostConfig.ssh.ungroup}</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-90 opacity-40 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.connType}</label>
              <div className="relative">
                <select
                  value={formData.connectionType || 'direct'}
                  onChange={e => setFormData({...formData, connectionType: e.target.value as any})}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none appearance-none cursor-pointer pr-10"
                >
                  <option value="direct">{t.hostConfig.ssh.direct}</option>
                  <option value="jump">{t.hostConfig.ssh.jump}</option>
                  <option value="local">{t.hostConfig.ssh.local}</option>
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-90 opacity-40 pointer-events-none" />
              </div>
            </div>
            {formData.connectionType === 'jump' && (
              <div className="w-full md:flex-1 space-y-2 animate-in fade-in duration-300">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.targetHost}</label>
                <input
                  value={formData.targetHost || ''}
                  onChange={e => setFormData({...formData, targetHost: e.target.value})}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
                  placeholder="10.0.0.1"
                />
              </div>
            )}
          </div>
          {formData.connectionType !== 'local' && (
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">
                {formData.connectionType === 'jump' ? t.hostConfig.ssh.jumpHostLabel : t.hostConfig.ssh.host}
              </label>
              <input
                value={formData.hostname}
                onChange={e => setFormData({...formData, hostname: e.target.value})}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
                placeholder="192.168.1.100"
              />
            </div>
            <div className="w-full md:w-32 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.port}</label>
              <input
                type="number"
                value={formData.port}
                onChange={e => setFormData({...formData, port: parseInt(e.target.value) || 22})}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          )}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.notes}</label>
            <textarea
              value={formData.notes || ''}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={2}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all resize-none"
              placeholder={language === 'zh' ? '添加关于该主机的备注信息...' : 'Add some notes about this host...'}
            />
          </div>
        </div>
      </div>

      {formData.connectionType !== 'local' && (
      <div className="relative border border-[var(--border-color)] rounded-2xl p-6 bg-black/5">
        <span className="absolute -top-3 left-4 px-2 bg-[var(--bg-card)] text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest z-10">{t.hostConfig.ssh.auth}</span>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.method}</label>
              <select
                value={formData.authType}
                onChange={e => setFormData({...formData, authType: e.target.value as any})}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none appearance-none cursor-pointer"
              >
                <option value="password">{t.hostConfig.ssh.passwordAuth}</option>
                <option value="ssh_key">{t.hostConfig.ssh.privateKey}</option>
              </select>
            </div>
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.username}</label>
              <input
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
                placeholder="root"
              />
            </div>
          </div>
          {formData.authType === 'password' ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.password}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in duration-300">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.sshKey}</label>
              <div className="relative">
                <FileKey className="absolute left-4 top-4 w-3.5 h-3.5 opacity-40" />
                <textarea
                  value={formData.sshKey || ''}
                  onChange={e => setFormData({...formData, sshKey: e.target.value})}
                  rows={4}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-mono text-[var(--text-main)] focus:border-indigo-500 outline-none resize-none"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {formData.connectionType === 'local' && (
      <div className="relative border border-[var(--border-color)] rounded-2xl p-6 bg-black/5">
        <span className="absolute -top-3 left-4 px-2 bg-[var(--bg-card)] text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest z-10">{t.hostConfig.ssh.local}</span>
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.shellType}</label>
            <input
              value={formData.localConfig?.shell || ''}
              onChange={e => setFormData({
                ...formData,
                localConfig: { ...formData.localConfig, shell: e.target.value },
              })}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
              placeholder={t.hostConfig.ssh.shellPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.ssh.startDir}</label>
            <input
              value={formData.localConfig?.cwd || ''}
              onChange={e => setFormData({
                ...formData,
                localConfig: { ...formData.localConfig, cwd: e.target.value },
              })}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none transition-all"
              placeholder="~"
            />
          </div>
        </div>
      </div>
      )}

      {formData.connectionType !== 'local' && (
      <div className="relative border border-[var(--border-color)] rounded-2xl p-6 bg-black/5">
        <span className="absolute -top-3 left-4 px-2 bg-[var(--bg-card)] text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest z-10">{t.hostConfig.ssh.advanced}</span>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${formData.advanced?.smartAccel ? 'bg-indigo-600 border-indigo-500' : 'border-[var(--border-color)] group-hover:border-[var(--text-dim)]'}`}>
              {formData.advanced?.smartAccel && <ShieldCheck className="w-3.5 h-3.5 text-white" />}
            </div>
            <input type="checkbox" className="hidden" checked={formData.advanced?.smartAccel} onChange={e => setFormData({...formData, advanced: {...formData.advanced!, smartAccel: e.target.checked}})} />
            <span className="text-xs font-bold text-[var(--text-dim)]">{t.hostConfig.ssh.smartAccel}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${formData.advanced?.execChannel ? 'bg-indigo-600 border-indigo-500' : 'border-[var(--border-color)] group-hover:border-[var(--text-dim)]'}`}>
              {formData.advanced?.execChannel && <ShieldCheck className="w-3.5 h-3.5 text-white" />}
            </div>
            <input type="checkbox" className="hidden" checked={formData.advanced?.execChannel} onChange={e => setFormData({...formData, advanced: {...formData.advanced!, execChannel: e.target.checked}})} />
            <span className="text-xs font-bold text-[var(--text-dim)]">{t.hostConfig.ssh.execChannel}</span>
          </label>
        </div>
      </div>
      )}
    </div>
  );

  const renderProxyTab = () => (
    <div className="pt-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col relative">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">{t.hostConfig.proxy.title}</h3>
          <p className="text-[10px] text-amber-500 font-bold mt-1.5 flex items-center gap-2">
             <Info className="w-3.5 h-3.5" /> {t.hostConfig.proxy.disclaimer}
          </p>
        </div>
        <button
          onClick={() => handleOpenProxyForm()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          {t.hostConfig.actions.add}
        </button>
      </div>

      <div className="flex-1 border border-[var(--border-color)] rounded-[2rem] overflow-hidden bg-black/10 flex flex-col shadow-inner">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-black/40 backdrop-blur-md text-[var(--text-dim)] font-black uppercase tracking-[0.2em] text-[9px]">
              <tr>
                <th className="px-6 py-4 border-b border-[var(--border-color)] w-16 text-center">{t.hostConfig.proxy.header.sel}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.proxy.header.name}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.proxy.header.type}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.proxy.header.host}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.proxy.header.port}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)] text-right">{t.hostConfig.proxy.header.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              <tr
                onClick={() => setFormData({...formData, proxyId: undefined})}
                className={`hover:bg-white/5 transition-colors cursor-pointer group ${!formData.proxyId ? 'bg-indigo-600/10' : ''}`}
              >
                <td className="px-6 py-4 text-center">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mx-auto transition-all ${!formData.proxyId ? 'border-indigo-500 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'border-[var(--border-color)]'}`}>
                    {!formData.proxyId && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}
                  </div>
                </td>
                <td className="px-6 py-4 text-[var(--text-main)] font-black italic">{t.hostConfig.terminal.noProxy}</td>
                <td className="px-6 py-4 text-[var(--text-dim)] opacity-40">-</td>
                <td className="px-6 py-4 text-[var(--text-dim)] opacity-40">-</td>
                <td className="px-6 py-4 text-[var(--text-dim)] opacity-40">-</td>
                <td className="px-6 py-4"></td>
              </tr>
              {proxies.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setFormData({...formData, proxyId: p.id})}
                  className={`hover:bg-white/5 transition-colors cursor-pointer group ${formData.proxyId === p.id ? 'bg-indigo-600/10' : ''}`}
                >
                  <td className="px-6 py-4 text-center">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mx-auto transition-all ${formData.proxyId === p.id ? 'border-indigo-500 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'border-[var(--border-color)]'}`}>
                      {formData.proxyId === p.id && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[var(--text-main)] font-black truncate max-w-[120px]">{p.name}</td>
                  <td className="px-6 py-4"><span className="px-2 py-0.5 bg-indigo-500/10 rounded text-[9px] font-black uppercase text-indigo-400 border border-indigo-500/20">{p.type}</span></td>
                  <td className="px-6 py-4 text-[var(--text-dim)] font-mono font-medium">{p.hostname}</td>
                  <td className="px-6 py-4 text-[var(--text-dim)] font-mono font-medium">{p.port}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleOpenProxyForm(p); }} className="p-2 hover:bg-white/10 text-[var(--text-dim)] hover:text-indigo-400 rounded-lg transition-all"><Pencil className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteProxyItem(p.id); }} className="p-2 hover:bg-rose-500/10 text-[var(--text-dim)] hover:text-rose-500 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {proxies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20">
              <Globe className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">{t.hostConfig.proxy.empty}</p>
            </div>
          )}
        </div>
      </div>

      {isProxyFormOpen && proxyEditData && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 rounded-[2rem]">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-indigo-500/30 rounded-[2rem] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">{proxies.find(p => p.id === proxyEditData.id) ? t.hostConfig.proxy.form.titleEdit : t.hostConfig.proxy.form.titleAdd}</h4>
              <button onClick={() => setIsProxyFormOpen(false)} className="text-[var(--text-dim)] hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.name}</label>
                <input value={proxyEditData.name} onChange={e => setProxyEditData({...proxyEditData, name: e.target.value})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none" placeholder={language === 'zh' ? '例如: 办公网络 SOCKS5' : 'e.g. Office SOCKS5'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.type}</label>
                  <select value={proxyEditData.type} onChange={e => setProxyEditData({...proxyEditData, type: e.target.value as any})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none appearance-none cursor-pointer">
                    <option value="SOCKS5">SOCKS5</option>
                    <option value="HTTP">HTTP</option>
                    <option value="HTTPS">HTTPS</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.port}</label>
                  <input 
                    type="number" 
                    value={proxyEditData.port} 
                    onChange={e => {
                      const val = e.target.value;
                      // 允许清空，在保存时设置默认值
                      if (val === '' || val === '-') {
                        setProxyEditData({...proxyEditData, port: val as any});
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          setProxyEditData({...proxyEditData, port: num});
                        }
                      }
                    }} 
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.host}</label>
                <input value={proxyEditData.hostname} onChange={e => setProxyEditData({...proxyEditData, hostname: e.target.value})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none" placeholder="127.0.0.1" />
              </div>

              {/* Added Username and Password fields */}
              <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4 mt-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.user}</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40 text-slate-500" />
                    <input
                      value={proxyEditData.username || ''}
                      onChange={e => setProxyEditData({...proxyEditData, username: e.target.value})}
                      className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                      placeholder="admin"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.proxy.form.pass}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40 text-slate-500" />
                    <input
                      type="password"
                      value={proxyEditData.password || ''}
                      onChange={e => setProxyEditData({...proxyEditData, password: e.target.value})}
                      className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button onClick={handleSaveProxy} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all">{t.hostConfig.proxy.form.save}</button>
                <button onClick={() => setIsProxyFormOpen(false)} className="flex-1 py-3.5 bg-white/5 text-[var(--text-dim)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">{t.hostConfig.proxy.form.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTunnelTab = () => (
    <div className="pt-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col relative">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">{t.hostConfig.tunnel.title}</h3>
          <p className="text-[10px] text-[var(--text-dim)] font-bold mt-1.5 flex items-center gap-2 opacity-60">
             <Radio className="w-3.5 h-3.5 text-indigo-400" /> {t.hostConfig.tunnel.description}
          </p>
        </div>
        <button
          onClick={() => handleOpenTunnelForm()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          {t.hostConfig.tunnel.add}
        </button>
      </div>

      <div className="flex-1 border border-[var(--border-color)] rounded-[2rem] overflow-hidden bg-black/10 flex flex-col shadow-inner">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-black/40 backdrop-blur-md text-[var(--text-dim)] font-black uppercase tracking-[0.2em] text-[9px]">
              <tr>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.tunnel.header.name}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.tunnel.header.type}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.tunnel.header.listen}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)]">{t.hostConfig.tunnel.header.target}</th>
                <th className="px-6 py-4 border-b border-[var(--border-color)] text-right">{t.hostConfig.tunnel.header.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {(formData.tunnels || []).map(tunnel => (
                <tr key={tunnel.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4 text-[var(--text-main)] font-black truncate max-w-[150px]">{tunnel.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${tunnelTypeClass(tunnel.type)}`}>
                      {tunnelTypeLabel(tunnel.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[var(--text-dim)] font-mono font-bold">{tunnel.listenPort}</td>
                  <td className="px-6 py-4 text-[var(--text-dim)] font-mono opacity-80">
                    {tunnel.type === 'D' ? '-' : `${tunnel.targetAddress}:${tunnel.targetPort}`}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenTunnelForm(tunnel)} className="p-2 hover:bg-white/10 text-[var(--text-dim)] hover:text-indigo-400 rounded-lg transition-all"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteTunnel(tunnel.id)} className="p-2 hover:bg-rose-500/10 text-[var(--text-dim)] hover:text-rose-500 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!formData.tunnels || formData.tunnels.length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20">
              <ArrowRightLeft className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">{t.hostConfig.tunnel.empty}</p>
            </div>
          )}
        </div>
      </div>

      {isTunnelFormOpen && tunnelEditData && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 rounded-[2rem]">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-indigo-500/30 rounded-[2rem] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">
                {(formData.tunnels || []).find(item => item.id === tunnelEditData.id) ? t.hostConfig.tunnel.form.titleEdit : t.hostConfig.tunnel.form.titleAdd}
              </h4>
              <button onClick={() => setIsTunnelFormOpen(false)} className="text-[var(--text-dim)] hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.tunnel.form.name}</label>
                <input
                  value={tunnelEditData.name}
                  onChange={e => setTunnelEditData({...tunnelEditData, name: e.target.value})}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                  placeholder={language === 'zh' ? '例如: MySQL 转发' : 'e.g. MySQL Forward'}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.tunnel.form.type}</label>
                  <select
                    value={tunnelEditData.type}
                    onChange={e => setTunnelEditData({...tunnelEditData, type: e.target.value as any})}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none appearance-none cursor-pointer"
                  >
                    <option value="L">{t.hostConfig.tunnel.types.local}</option>
                    <option value="R">{t.hostConfig.tunnel.types.remote}</option>
                    <option value="D">{t.hostConfig.tunnel.types.dynamic}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.tunnel.form.listen}</label>
                  <input
                    type="number"
                    value={tunnelEditData.listenPort}
                    onChange={e => {
                      const val = e.target.value;
                      // 允许空字符串，让用户可以清空或重新输入
                      if (val === '' || val === '-') {
                        setTunnelEditData({...tunnelEditData, listenPort: val as any});
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          setTunnelEditData({...tunnelEditData, listenPort: num});
                        }
                      }
                    }}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
              {tunnelEditData.type !== 'D' && (
                <div className="grid grid-cols-3 gap-4 animate-in fade-in duration-300">
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.tunnel.form.targetHost}</label>
                    <input
                      value={tunnelEditData.targetAddress}
                      onChange={e => setTunnelEditData({...tunnelEditData, targetAddress: e.target.value})}
                      className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.tunnel.form.targetPort}</label>
                  <input
                    type="number"
                    value={tunnelEditData.targetPort}
                    onChange={e => {
                      const val = e.target.value;
                      // 允许空字符串，让用户可以清空或重新输入
                      if (val === '' || val === '-') {
                        setTunnelEditData({...tunnelEditData, targetPort: val as any});
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          setTunnelEditData({...tunnelEditData, targetPort: num});
                        }
                      }
                    }}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-indigo-500 outline-none"
                  />
                  </div>
                </div>
              )}
              <div className="pt-4 flex gap-3">
                <button onClick={handleSaveTunnel} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all">{t.hostConfig.tunnel.form.save}</button>
                <button onClick={() => setIsTunnelFormOpen(false)} className="flex-1 py-3.5 bg-white/5 text-[var(--text-dim)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">{t.hostConfig.tunnel.form.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="w-full max-w-4xl h-[700px] bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
        <div className="h-14 flex items-center justify-between px-8 border-b border-[var(--border-color)] shrink-0 bg-black/10">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
            <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-dim)]">
             {host ? t.hostConfig.editAsset : t.hostConfig.addAsset}: {formData.name || 'UNNAMED'}
          </span>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-64 border-r border-[var(--border-color)] flex flex-col p-4 gap-2 shrink-0 bg-black/5">
            {[
              { id: 'ssh', icon: Network, label: t.hostConfig.tabs.ssh },
              { id: 'terminal', icon: Terminal, label: t.hostConfig.tabs.terminal },
              { id: 'proxy', icon: Globe2, label: t.hostConfig.tabs.proxy },
              { id: 'tunnel', icon: Server, label: t.hostConfig.tabs.tunnel }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ConfigTab)}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-[var(--text-dim)] hover:bg-black/5 hover:text-[var(--text-main)]'}`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-slate-500'}`} />
                {tab.label}
              </button>
            ))}
          </aside>

          <main className="flex-1 overflow-hidden relative bg-[var(--bg-main)]/20">
            <div className="h-full overflow-y-auto no-scrollbar px-10 pb-10">
               {activeTab === 'ssh' && renderSSHConfig()}
               {activeTab === 'proxy' && renderProxyTab()}
               {activeTab === 'tunnel' && renderTunnelTab()}
               {activeTab === 'terminal' && (
                 <div className="pt-4 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.terminal.encoding}</label>
                       <select value={formData.terminal?.encoding} onChange={e => setFormData({...formData, terminal: {...formData.terminal!, encoding: e.target.value}})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] outline-none">
                          <option value="UTF-8">UTF-8 (International)</option>
                          <option value="GBK">GBK (Chinese Standard)</option>
                          <option value="ASCII">ASCII</option>
                       </select>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.terminal.backspace}</label>
                          <select value={formData.terminal?.backspaceSeq} onChange={e => setFormData({...formData, terminal: {...formData.terminal!, backspaceSeq: e.target.value}})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] outline-none">
                             <option value="ASCII">ASCII (Delete 127)</option>
                             <option value="Control-H">Control-H (BS 8)</option>
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] ml-1">{t.hostConfig.terminal.delete}</label>
                          <select value={formData.terminal?.deleteSeq} onChange={e => setFormData({...formData, terminal: {...formData.terminal!, deleteSeq: e.target.value}})} className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] outline-none">
                             <option value="VT220">VT220 (ESC[3~)</option>
                             <option value="ASCII">ASCII (Delete 127)</option>
                          </select>
                       </div>
                    </div>
                 </div>
               )}
            </div>
          </main>
        </div>

        <div className="h-20 px-10 border-t border-[var(--border-color)] flex items-center justify-between bg-black/10 shrink-0">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${formData.name && formData.hostname && formData.username ? 'bg-emerald-500' : 'bg-slate-500 opacity-20'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)]">{t.hostConfig.readyToDeploy}</span>
             </div>
          </div>
          <div className="flex gap-4">
            <button onClick={handleSaveAndClose} className="px-10 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all">{t.hostConfig.footer.ok}</button>
            <button onClick={handleApply} className="px-8 py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-black uppercase tracking-widest text-[11px] rounded-2xl hover:bg-indigo-500/20 active:scale-95 transition-all">{t.hostConfig.footer.apply}</button>
            <button onClick={onClose} className="px-6 py-3 bg-white/5 text-[var(--text-dim)] font-black uppercase tracking-widest text-[11px] rounded-2xl hover:bg-white/10 active:scale-95 transition-all">{t.hostConfig.footer.cancel}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
