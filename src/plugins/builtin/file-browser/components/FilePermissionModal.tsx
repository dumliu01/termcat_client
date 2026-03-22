import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { FileItem } from '@/utils/types';
import { useT } from '../i18n';

interface PermissionState {
  owner: { r: boolean; w: boolean; x: boolean };
  group: { r: boolean; w: boolean; x: boolean };
  other: { r: boolean; w: boolean; x: boolean };
}

interface FilePermissionModalProps {
  file: FileItem;
  onClose: () => void;
  onConfirm: (octal: string) => void;
}

export const FilePermissionModal: React.FC<FilePermissionModalProps> = ({ file, onClose, onConfirm }) => {
  const t = useT();
  const pm = t.permissionModal;

  const initialPerms = useMemo(() => {
    const p = file.permission || '---------';
    const str = p.startsWith('d') || p.startsWith('-') || p.startsWith('l') ? p.slice(1) : p;
    return {
      owner: { r: str[0] === 'r', w: str[1] === 'w', x: str[2] === 'x' },
      group: { r: str[3] === 'r', w: str[4] === 'w', x: str[5] === 'x' },
      other: { r: str[6] === 'r', w: str[7] === 'w', x: str[8] === 'x' },
    };
  }, [file.permission]);

  const [perms, setPerms] = useState<PermissionState>(initialPerms);

  const toggle = (target: keyof PermissionState, bit: 'r' | 'w' | 'x') => {
    setPerms(prev => ({
      ...prev,
      [target]: { ...prev[target], [bit]: !prev[target][bit] }
    }));
  };

  const calculateOctal = () => {
    const bitToNum = (p: { r: boolean; w: boolean; x: boolean }) =>
      (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
    return `${bitToNum(perms.owner)}${bitToNum(perms.group)}${bitToNum(perms.other)}`;
  };

  const sectionLabels: Record<string, string> = {
    owner: pm.owner,
    group: pm.group,
    other: pm.other,
  };

  const bitLabels: Record<string, string> = {
    r: pm.read,
    w: pm.write,
    x: pm.execute,
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-80 bg-[var(--bg-card)] border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" style={{ borderColor: 'var(--border-color)' }}>
        <div className="h-10 px-4 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}>
          <div className="flex gap-2">
            <div onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f56] hover:shadow-[0_0_8px_rgba(255,95,86,0.5)] cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>{pm.title}</span>
          <div className="w-10" />
        </div>
        <div className="p-6">
          <div className="mb-6 text-center">
            <h4 className="text-xl font-bold truncate px-2 font-mono" style={{ color: 'var(--text-main)' }}>{file.name}</h4>
            <p className="text-[10px] font-bold text-primary mt-1 uppercase tracking-[0.2em] opacity-60">Octal: {calculateOctal()}</p>
          </div>
          <div className="space-y-6">
            {(['owner', 'group', 'other'] as const).map(section => (
              <div key={section} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>{sectionLabels[section]}</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-color)' }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['r', 'w', 'x'] as const).map(bit => (
                    <label key={bit} className="flex items-center gap-2 group cursor-pointer select-none">
                      <div
                        onClick={() => toggle(section, bit)}
                        className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                          perms[section][bit]
                            ? 'bg-primary border-primary shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                            : 'border-[var(--border-color)] group-hover:border-[var(--text-dim)]'
                        }`}
                      >
                        {perms[section][bit] && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                      </div>
                      <span className={`text-[11px] font-bold transition-colors ${
                        perms[section][bit] ? 'text-[var(--text-main)]' : 'text-[var(--text-dim)]'
                      }`}>
                        {bitLabels[bit]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-10">
            <button
              onClick={() => onConfirm(calculateOctal())}
              className="flex-1 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              {pm.ok}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 hover:bg-[var(--bg-tab)] rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all border"
              style={{ color: 'var(--text-dim)', borderColor: 'var(--border-color)' }}
            >
              {pm.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
