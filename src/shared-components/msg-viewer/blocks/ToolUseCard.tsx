/**
 * Tool use display card
 *
 * Displays tool name, command/path, permission confirmation, execution result, etc.
 */

import React, { useState } from 'react';
import { Loader2, Check, XCircle, ChevronDown, Terminal, FileText, Search, FolderSearch, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import type { ToolUseBlock, MsgViewerActions } from '../types';

/** Tool info mapping */
const TOOL_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  // Code mode (MCP tool name)
  'mcp__remote_ops__bash': { label: 'Bash', icon: <Terminal className="w-3 h-3" />, color: 'text-indigo-400 bg-indigo-500/20' },
  'mcp__remote_ops__read_file': { label: 'Read', icon: <FileText className="w-3 h-3" />, color: 'text-cyan-400 bg-cyan-500/20' },
  'mcp__remote_ops__write_file': { label: 'Write', icon: <FileText className="w-3 h-3" />, color: 'text-amber-400 bg-amber-500/20' },
  'mcp__remote_ops__edit_file': { label: 'Edit', icon: <FileText className="w-3 h-3" />, color: 'text-emerald-400 bg-emerald-500/20' },
  'mcp__remote_ops__glob': { label: 'Glob', icon: <FolderSearch className="w-3 h-3" />, color: 'text-violet-400 bg-violet-500/20' },
  'mcp__remote_ops__grep': { label: 'Grep', icon: <Search className="w-3 h-3" />, color: 'text-orange-400 bg-orange-500/20' },
  // X-Agent mode (direct tool name)
  'bash': { label: 'Bash', icon: <Terminal className="w-3 h-3" />, color: 'text-indigo-400 bg-indigo-500/20' },
  'read_file': { label: 'Read', icon: <FileText className="w-3 h-3" />, color: 'text-cyan-400 bg-cyan-500/20' },
  'write_file': { label: 'Write', icon: <FileText className="w-3 h-3" />, color: 'text-amber-400 bg-amber-500/20' },
  'edit_file': { label: 'Edit', icon: <FileText className="w-3 h-3" />, color: 'text-emerald-400 bg-emerald-500/20' },
  'glob': { label: 'Glob', icon: <FolderSearch className="w-3 h-3" />, color: 'text-violet-400 bg-violet-500/20' },
  'grep': { label: 'Grep', icon: <Search className="w-3 h-3" />, color: 'text-orange-400 bg-orange-500/20' },
  // Claude Agent SDK (Code mode — local execution, capitalized tool names)
  'Bash': { label: 'Bash', icon: <Terminal className="w-3 h-3" />, color: 'text-indigo-400 bg-indigo-500/20' },
  'Read': { label: 'Read', icon: <FileText className="w-3 h-3" />, color: 'text-cyan-400 bg-cyan-500/20' },
  'Write': { label: 'Write', icon: <FileText className="w-3 h-3" />, color: 'text-amber-400 bg-amber-500/20' },
  'Edit': { label: 'Edit', icon: <FileText className="w-3 h-3" />, color: 'text-emerald-400 bg-emerald-500/20' },
  'Glob': { label: 'Glob', icon: <FolderSearch className="w-3 h-3" />, color: 'text-violet-400 bg-violet-500/20' },
  'Grep': { label: 'Grep', icon: <Search className="w-3 h-3" />, color: 'text-orange-400 bg-orange-500/20' },
};

function getToolInfo(toolName: string) {
  return TOOL_INFO[toolName] || { label: toolName, icon: <Terminal className="w-3 h-3" />, color: 'text-slate-400 bg-slate-500/20' };
}

function getToolDescription(toolName: string, toolInput?: Record<string, any>): string {
  if (!toolInput) return '';
  const info = getToolInfo(toolName);
  switch (info.label) {
    case 'Bash': return toolInput.command || '';
    case 'Read': case 'Write': case 'Edit': return toolInput.file_path || '';
    case 'Glob': return toolInput.pattern || '';
    case 'Grep': return `${toolInput.pattern || ''} ${toolInput.path ? `in ${toolInput.path}` : ''}`.trim();
    default: return JSON.stringify(toolInput).slice(0, 120);
  }
}

interface Props {
  block: ToolUseBlock;
  language: 'zh' | 'en';
  actions: MsgViewerActions;
}

export const ToolUseCard: React.FC<Props> = ({ block, language, actions }) => {
  const [showOutput, setShowOutput] = useState(false);
  const { toolName, toolInput, output, isError, error, status, permissionId, permissionTitle, allowPermanent } = block;
  if (!toolName) return null;

  const info = getToolInfo(toolName);
  const description = getToolDescription(toolName, toolInput);
  const isWaitingPermission = status === 'waiting_permission';
  const isExecuting = status === 'executing';
  const isCompleted = status === 'completed';
  const hasError = status === 'error' || isError;

  const borderColor = isWaitingPermission ? 'border-amber-500' : hasError ? 'border-rose-500' : isCompleted ? 'border-emerald-500' : 'border-indigo-500';

  return (
    <div className={`w-full mt-2 border-l-4 ${borderColor} bg-slate-500/5 rounded-r-2xl overflow-hidden p-4 space-y-3`}>
      {/* Tool title row */}
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${info.color}`}>
          {info.icon}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${info.color}`}>
          {info.label}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isWaitingPermission && (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="text-[10px] font-black text-amber-400">{language === 'en' ? 'Waiting approval' : '等待确认'}</span>
            </>
          )}
          {isExecuting && (
            <>
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span className="text-[10px] font-black text-indigo-400">{language === 'en' ? 'Executing...' : '执行中...'}</span>
            </>
          )}
          {isCompleted && (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-400">{language === 'en' ? 'Done' : '完成'}</span>
            </>
          )}
          {hasError && (
            <>
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] font-black text-rose-400">{language === 'en' ? 'Failed' : '失败'}</span>
            </>
          )}
        </div>
      </div>

      {/* Command/path */}
      {description && (
        <div className="p-3 rounded-lg font-mono text-[11px] bg-black/40 text-indigo-300 break-all select-text cursor-text">
          {description}
        </div>
      )}

      {/* SDK permission title (e.g. "Claude wants to run: lsof -iTCP") */}
      {isWaitingPermission && permissionTitle && (
        <div className="text-[11px] font-medium text-amber-300/80">
          {permissionTitle}
        </div>
      )}

      {/* Permission confirmation buttons — Claude Code CLI style */}
      {isWaitingPermission && permissionId && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => actions.onToolApprove?.(permissionId)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all shadow-sm hover:shadow-emerald-500/10"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {language === 'en' ? 'Allow once' : '本次允许'}
          </button>
          {allowPermanent && (
            <button
              onClick={() => actions.onToolApproveAlways?.(permissionId)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 transition-all shadow-sm hover:shadow-indigo-500/10"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {language === 'en' ? 'Always allow' : '永久允许'}
            </button>
          )}
          <button
            onClick={() => actions.onToolDeny?.(permissionId)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
          >
            <ShieldX className="w-3.5 h-3.5" />
            {language === 'en' ? 'Deny' : '拒绝'}
          </button>
        </div>
      )}

      {/* Edit file diff */}
      {info.label === 'Edit' && toolInput?.old_string && (
        <div className="space-y-1">
          <div className="p-2 rounded-lg font-mono text-[10px] bg-rose-500/5 text-rose-300 break-all select-text">
            <span className="text-[9px] text-rose-400 font-black uppercase mr-2">-</span>
            {toolInput.old_string.length > 200 ? toolInput.old_string.slice(0, 200) + '...' : toolInput.old_string}
          </div>
          <div className="p-2 rounded-lg font-mono text-[10px] bg-emerald-500/5 text-emerald-300 break-all select-text">
            <span className="text-[9px] text-emerald-400 font-black uppercase mr-2">+</span>
            {(toolInput.new_string || '').length > 200 ? toolInput.new_string.slice(0, 200) + '...' : (toolInput.new_string || '')}
          </div>
        </div>
      )}

      {/* write_file preview */}
      {info.label === 'Write' && toolInput?.content && (
        <div className="p-2 rounded-lg font-mono text-[10px] bg-black/20 text-slate-400 break-all select-text max-h-20 overflow-y-auto">
          {toolInput.content.length > 300 ? toolInput.content.slice(0, 300) + '\n...' : toolInput.content}
        </div>
      )}

      {/* Error message */}
      {hasError && error && !output && (
        <div className="p-2 rounded-lg text-[11px] bg-rose-500/5 text-rose-400 font-medium">{error}</div>
      )}

      {/* Execution result */}
      {output && (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => setShowOutput(!showOutput)} className="flex items-center gap-2 w-full text-left">
            <span className="text-[9px] font-black uppercase" style={{ color: 'var(--text-dim)' }}>
              {language === 'en' ? 'Result' : '执行结果'}
            </span>
            {hasError ? (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-500/10 text-rose-500">{language === 'en' ? 'Error' : '失败'}</span>
            ) : (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-emerald-500/10 text-emerald-500">{language === 'en' ? 'Success' : '成功'}</span>
            )}
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showOutput ? 'rotate-180' : ''}`} style={{ color: 'var(--text-dim)' }} />
          </button>
          {showOutput && (
            <div className={`p-3 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap max-h-40 overflow-y-auto select-text ${hasError ? 'bg-rose-500/5 text-rose-300' : 'bg-black/40 text-slate-300'}`}>
              {output.length > 3000 ? output.slice(0, 3000) + '\n...(truncated)' : output}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
