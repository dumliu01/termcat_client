/**
 * AI 运维输入区域组件
 *
 * 显示输入区域，包括：
 * - 文件附件预览
 * - 多行文本输入框
 * - 附件按钮
 * - 发送/停止按钮
 * - 模式切换按钮（Ask/Agent）
 * - 模型选择器
 * - 成本提示
 */

import React, { useRef, useState, useEffect } from 'react';
import { Send, X, Paperclip, FileText, Zap, BrainCircuit, Code2, ChevronDown, Link, ExternalLink } from 'lucide-react';
import { AttachedFile, SshMode } from '@/features/terminal/types';
import { AIModelType, AIModelInfo } from '@/utils/types';
import { useT } from '../i18n';

export interface AIOpsInputProps {
  input: string;
  isLoading: boolean;
  mode: 'ask' | 'agent' | 'code' | 'codex';
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
  onModeChange: (mode: 'ask' | 'agent' | 'code' | 'codex') => void;
  onModelChange: (model: AIModelType) => void;
  sshMode: SshMode;
  onSshModeChange: (mode: SshMode) => void;
  /** 服务端可用模式列表 */
  availableModes?: string[];
  /** 是否禁用输入（游客模式） */
  guestDisabled?: boolean;
  /** 游客禁用提示文案 */
  guestDisabledText?: string;
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
  availableModes,
  guestDisabled = false,
  guestDisabledText,
}) => {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('top');

  // 计算菜单显示位置
  const calculateMenuPosition = () => {
    if (!modelSelectorRef.current) return;
    const rect = modelSelectorRef.current.getBoundingClientRect();
    const menuHeight = Math.min(availableModels.length * 32 + 16, 240); // 估算菜单高度
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // 优先向上展开，如果上方空间不足则向下
    if (spaceAbove >= menuHeight || spaceAbove > spaceBelow) {
      setMenuPosition('top');
    } else {
      setMenuPosition('bottom');
    }
  };

  // 点击外部关闭菜单
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

  // 获取当前选中模型的显示名称
  const getSelectedModelName = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model?.name || selectedModel;
  };

  // 模式切换处理（在可用模式中循环）
  const handleModeToggle = () => {
    const allModes: Array<'ask' | 'agent' | 'code' | 'codex'> = ['ask', 'agent', 'code', 'codex'];
    const modes = availableModes && availableModes.length > 0
      ? allModes.filter(m => availableModes.includes(m))
      : allModes;
    if (modes.length <= 1) return;
    const idx = modes.indexOf(mode);
    onModeChange(modes[(idx + 1) % modes.length]);
  };

  // 获取模式按钮样式
  const getModeButtonClass = () => {
    const baseClass = 'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase transition-all';

    switch (mode) {
      case 'agent':
        return `${baseClass} bg-indigo-600 text-white shadow-lg shadow-indigo-600/20`;
      case 'code':
        return `${baseClass} bg-emerald-600 text-white shadow-lg shadow-emerald-600/20`;
      case 'codex':
        return `${baseClass} bg-orange-600 text-white shadow-lg shadow-orange-600/20`;
      default:
        return `${baseClass} bg-white/5 text-slate-400 hover:bg-white/10`;
    }
  };

  // 获取模式图标
  const getModeIcon = () => {
    switch (mode) {
      case 'agent':
        return <BrainCircuit className="w-3 h-3" />;
      case 'code':
        return <Code2 className="w-3 h-3" />;
      case 'codex':
        return <Zap className="w-3 h-3" />;
      default:
        return <Zap className="w-3 h-3" />;
    }
  };

  // 获取模式标签
  const getModeLabel = () => {
    switch (mode) {
      case 'agent':
        return t.modeAgent;
      case 'code':
        return t.modeCode;
      case 'codex':
        return t.modeXAgent;
      default:
        return t.modeAsk;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 在输入法 Composition 状态下，不触发发送
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = () => {
    if (mode === 'agent' || mode === 'code' || mode === 'codex') {
      return t.attachContext;
    }
    return t.askOrAttach;
  };

  // 游客禁用状态
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
      {/* 待发送附件预览区 */}
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

      {/* 输入框 */}
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
            {/* 附件按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
              title={t.attachFiles}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* 发送/停止按钮 */}
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

          {/* 隐藏的文件输入 */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            multiple
            className="hidden"
            accept="image/*,.txt,.log,.conf,.json,.yml"
          />
        </div>

        {/* 成本提示 + 模式切换 + 模型选择 */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {/* 模式切换按钮 */}
            <button
              onClick={handleModeToggle}
              className={getModeButtonClass()}
            >
              {getModeIcon()}
              {getModeLabel()}
            </button>

            {/* 模型选择器 */}
            <div ref={modelSelectorRef} className="relative">
              <button
                onClick={toggleModelMenu}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition-colors border-l border-white/10 pl-2"
              >
                <span>{getSelectedModelName()}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* 下拉菜单 */}
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
            {/* SSH 模式切换按钮 */}
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
