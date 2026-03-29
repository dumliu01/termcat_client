/**
 * AI Ops Input Area Component
 *
 * Displays the input area, including:
 * - File attachment preview
 * - Multi-line text input
 * - Attachment button
 * - Send/Stop button
 * - Mode toggle button (Ask/Agent)
 * - Model selector
 * - Cost hint
 */

import React, { useRef, useState, useEffect } from 'react';
import { Send, X, Paperclip, FileText, Zap, BrainCircuit, Code2, ChevronDown, Link, ExternalLink, Cpu, Lock } from 'lucide-react';
import { AttachedFile, SshMode } from '@/features/terminal/types';
import { AIModelType, AIModelInfo, AIModeInfo } from '@/utils/types';
import { useT } from '../i18n';

export interface AIOpsInputProps {
  input: string;
  isLoading: boolean;
  mode: string;
  selectedModel: AIModelType;
  availableModels: AIModelInfo[];
  attachedFiles: AttachedFile[];
  isComposing: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (index: number) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onModeChange: (mode: string) => void;
  onModelChange: (model: AIModelType) => void;
  sshMode: SshMode;
  onSshModeChange: (mode: SshMode) => void;
  /** Available mode infos (server + plugin merged) */
  availableModeInfos: AIModeInfo[];
  /** Whether input is disabled (guest mode) */
  guestDisabled?: boolean;
  /** Guest disabled hint text */
  guestDisabledText?: string;
  /** Callback when user clicks a locked mode */
  onPurchase?: () => void;
}

export const AIOpsInput: React.FC<AIOpsInputProps> = ({
  input,
  isLoading,
  mode,
  selectedModel,
  availableModels,
  attachedFiles,
  isComposing,
  onInputChange,
  onSend,
  onStop,
  onFileChange,
  onRemoveAttachment,
  onCompositionStart,
  onCompositionEnd,
  onModeChange,
  onModelChange,
  sshMode,
  onSshModeChange,
  availableModeInfos,
  guestDisabled = false,
  guestDisabledText,
  onPurchase,
}) => {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const modeSelectorRef = useRef<HTMLDivElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('top');
  const [modeMenuPosition, setModeMenuPosition] = useState<'top' | 'bottom'>('top');

  // Calculate menu display position
  const calculateMenuPosition = () => {
    if (!modelSelectorRef.current) return;
    const rect = modelSelectorRef.current.getBoundingClientRect();
    const menuHeight = Math.min(availableModels.length * 32 + 16, 240); // Estimate menu height
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // Prefer expanding upward, if insufficient space above then expand downward
    if (spaceAbove >= menuHeight || spaceAbove > spaceBelow) {
      setMenuPosition('top');
    } else {
      setMenuPosition('bottom');
    }
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };

    if (isModelMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModelMenuOpen]);

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsModelMenuOpen(false);
  };

  const toggleModelMenu = () => {
    if (!isModelMenuOpen) {
      calculateMenuPosition();
    }
    setIsModelMenuOpen(!isModelMenuOpen);
  };

  // Get current selected model's display name
  const getSelectedModelName = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model?.name || selectedModel;
  };

  // Icon name → React component mapping
  const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
    'zap': Zap, 'brain-circuit': BrainCircuit, 'code-2': Code2, 'cpu': Cpu,
  };

  // Mode style mapping (built-in modes get specific colors, plugin modes get a generic style)
  const MODE_STYLES: Record<string, string> = {
    'agent': 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20',
    'code': 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20',
    'x-agent': 'bg-orange-600 text-white shadow-lg shadow-orange-600/20',
  };

  // Mode menu position calculation
  const calculateModeMenuPosition = () => {
    if (!modeSelectorRef.current) return;
    const rect = modeSelectorRef.current.getBoundingClientRect();
    const menuHeight = Math.min(availableModeInfos.length * 32 + 8, 200);
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setModeMenuPosition(spaceAbove >= menuHeight || spaceAbove > spaceBelow ? 'top' : 'bottom');
  };

  const toggleModeMenu = () => {
    if (!isModeMenuOpen) calculateModeMenuPosition();
    setIsModeMenuOpen(!isModeMenuOpen);
  };

  const handleModeSelect = (newMode: string) => {
    onModeChange(newMode);
    setIsModeMenuOpen(false);
  };

  // Click outside to close mode menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeSelectorRef.current && !modeSelectorRef.current.contains(event.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    if (isModeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeMenuOpen]);

  // Get mode button style
  const getModeButtonClass = () => {
    const baseClass = 'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase transition-all';
    const modeStyle = MODE_STYLES[mode];
    if (modeStyle) return `${baseClass} ${modeStyle}`;
    // Plugin modes get a generic teal style
    const currentInfo = availableModeInfos.find(m => m.id === mode);
    if (currentInfo?.source === 'plugin') return `${baseClass} bg-teal-600 text-white shadow-lg shadow-teal-600/20`;
    return `${baseClass} bg-white/5 text-slate-400 hover:bg-white/10`;
  };

  // Get mode icon component
  const getModeIcon = () => {
    const currentInfo = availableModeInfos.find(m => m.id === mode);
    const IconComp = ICON_MAP[currentInfo?.icon || ''] || Zap;
    return <IconComp className="w-3 h-3" />;
  };

  // Get mode label
  const getModeLabel = () => {
    const currentInfo = availableModeInfos.find(m => m.id === mode);
    if (currentInfo) return currentInfo.name;
    // Fallback for built-in mode names from translations
    switch (mode) {
      case 'agent': return t.modeAgent;
      case 'code': return t.modeCode;
      case 'x-agent': return t.modeXAgent;
      default: return t.modeAsk;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Do not trigger send when in IME Composition state
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = () => {
    if (mode === 'agent' || mode === 'code' || mode === 'x-agent') {
      return t.attachContext;
    }
    return t.askOrAttach;
  };

  // Guest disabled state
  if (guestDisabled) {
    return (
      <div className="border-t shrink-0 bg-white/[0.02] px-4 py-4" style={{ borderColor: 'var(--border-color)' }}>
        <div className="text-center text-xs text-slate-500 py-3 bg-white/5 rounded-2xl">
          {guestDisabledText || t.loginToUseAI}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t shrink-0 bg-white/[0.02]" style={{ borderColor: 'var(--border-color)' }}>
      {/* Pending attachment preview area */}
      {attachedFiles.length > 0 && (
        <div className="px-4 py-1 border-t flex gap-2 overflow-x-auto no-scrollbar bg-black/10" style={{ borderColor: 'var(--border-color)' }}>
          {attachedFiles.map((att, idx) => (
            <div key={idx} className="relative shrink-0 group">
              <div className="w-8 h-8 bg-[var(--bg-main)] border border-white/5 rounded-lg flex items-center justify-center overflow-hidden">
                {att.previewUrl ? (
                  <img src={att.previewUrl} className="w-full h-full object-cover" alt="thumb" />
                ) : (
                  <FileText className="w-4 h-4 text-indigo-400/50" />
                )}
              </div>
              <button
                onClick={() => onRemoveAttachment(idx)}
                className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 shadow-lg scale-0 group-hover:scale-100 transition-transform z-10"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input box */}
      <div className="p-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            placeholder={getPlaceholder()}
            className="w-full bg-[var(--input-bg)] border border-white/5 rounded-2xl py-3 pl-4 pr-12 text-sm text-white outline-none focus:border-indigo-500/50 transition-all resize-none h-24 no-scrollbar shadow-inner shadow-black/40"
          />
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              title={t.attachFiles}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Send/Stop button */}
            <button
              onClick={isLoading ? onStop : onSend}
              disabled={!isLoading && (!input.trim() && attachedFiles.length === 0)}
              className={`p-2 rounded-xl transition-all ${
                isLoading
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 hover:bg-rose-700'
                  : (input.trim() || attachedFiles.length > 0)
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'
              }`}
              title={isLoading ? t.stopTask : t.send}
            >
              {isLoading ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            multiple
            className="hidden"
            accept="image/*,.txt,.log,.conf,.json,.yml"
          />
        </div>

        {/* Cost hint + mode selector + model selector */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {/* Mode selector dropdown */}
            <div ref={modeSelectorRef} className="relative">
              <button
                onClick={toggleModeMenu}
                className={getModeButtonClass()}
              >
                {getModeIcon()}
                {getModeLabel()}
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isModeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModeMenuOpen && (
                <div
                  className={`absolute z-50 min-w-[180px] whitespace-nowrap bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl py-1 ${
                    modeMenuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                  style={{ left: 0 }}
                >
                  {availableModeInfos.map((modeInfo) => {
                    const IconComp = ICON_MAP[modeInfo.icon || ''] || Zap;
                    return (
                      <button
                        key={modeInfo.id}
                        onClick={() => modeInfo.locked ? onPurchase?.() : handleModeSelect(modeInfo.id)}
                        className={`w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase transition-colors flex items-center gap-2 ${
                          modeInfo.id === mode
                            ? 'bg-indigo-600/30 text-indigo-300'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <IconComp className="w-3 h-3" />
                        <span>{modeInfo.name}</span>
                        <span className="flex items-center gap-1.5 ml-auto">
                          <span className="text-[8px] text-teal-400/60 w-[30px] text-right">
                            {modeInfo.source === 'plugin' ? 'plugin' : ''}
                          </span>
                          <span className="w-3 flex justify-center">
                            {modeInfo.locked && <Lock className="w-3 h-3 text-slate-500" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Model selector */}
            <div ref={modelSelectorRef} className="relative">
              <button
                onClick={toggleModelMenu}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition-colors border-l border-white/10 pl-2"
              >
                <span>{getSelectedModelName()}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {isModelMenuOpen && (
                <div
                  className={`absolute z-50 min-w-[140px] max-h-[240px] overflow-y-auto bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl py-1 ${
                    menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                  style={{ left: 0 }}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelSelect(model.id)}
                        className={`w-full px-3 py-1.5 text-left text-[10px] font-medium transition-colors ${
                          model.id === selectedModel
                            ? 'bg-indigo-600/30 text-indigo-300'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{model.name}</span>
                          <span className="text-[8px] text-slate-500">{model.provider_name}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[10px] text-slate-500">
                      {t.noModelsAvailable}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* SSH mode toggle button */}
            <div className="relative group">
              <button
                onClick={() => onSshModeChange(sshMode === 'associated' ? 'independent' : 'associated')}
                className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all active:scale-95"
              >
                {sshMode === 'associated'
                  ? <Link className="w-3 h-3 text-indigo-400" />
                  : <ExternalLink className="w-3 h-3 text-indigo-400" />
                }
                <span className="text-[8px] font-black text-slate-300 tracking-widest uppercase">
                  {sshMode === 'associated' ? t.sshAssociated : t.sshIndependent}
                </span>
              </button>

              {/* Tooltip */}
              <div className="absolute -top-28 right-0 w-max max-w-[220px] bg-slate-800 text-[10px] text-slate-200 p-3.5 rounded-2xl shadow-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-0 group-hover:delay-[700ms] pointer-events-none z-[100] translate-y-4 group-hover:translate-y-0">
                <div className="font-black text-indigo-400 mb-1.5 flex items-center gap-2 border-b border-white/5 pb-1.5">
                  {sshMode === 'associated'
                    ? <Link className="w-2.5 h-2.5" />
                    : <ExternalLink className="w-2.5 h-2.5" />
                  }
                  {sshMode === 'associated' ? t.sshAssociated : t.sshIndependent}
                </div>
                <div className="opacity-90 leading-relaxed font-medium">
                  {sshMode === 'associated'
                    ? t.sshAssociatedTooltip
                    : t.sshIndependentTooltip
                  }
                </div>
                <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-slate-800 border-r border-b border-white/10 rotate-45" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
