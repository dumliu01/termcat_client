import React, { useState, useEffect, useRef } from 'react';
import { useT } from '../i18n';

interface InputDialogProps {
  title: string;
  defaultValue: string;
  placeholder?: string;
  selectAll?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const InputDialog: React.FC<InputDialogProps> = ({
  title, defaultValue, placeholder, selectAll = true, onConfirm, onCancel
}) => {
  const t = useT();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    if (selectAll) {
      // For rename: select name part without extension
      const dotIndex = defaultValue.lastIndexOf('.');
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    } else {
      inputRef.current.select();
    }
  }, []);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-80 bg-[var(--bg-card)] border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="h-10 px-4 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}>
          <div className="flex gap-2">
            <div onClick={onCancel} className="w-3 h-3 rounded-full bg-[#ff5f56] hover:shadow-[0_0_8px_rgba(255,95,86,0.5)] cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>{title}</span>
          <div className="w-10" />
        </div>
        <div className="p-6">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            className="w-full px-3 py-2.5 text-sm font-mono border rounded-xl outline-none transition-colors focus:border-primary"
            style={{
              backgroundColor: 'var(--bg-main)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-main)',
            }}
          />
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleConfirm}
              disabled={!value.trim()}
              className="flex-1 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.confirm}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 hover:bg-[var(--bg-tab)] rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all border"
              style={{ color: 'var(--text-dim)', borderColor: 'var(--border-color)' }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
