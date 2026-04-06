/**
 * Terminal Tab Bar component
 *
 * Contains Tab list (drag-and-drop reorder, rename), "+" host picker popup, context menu.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Copy, Settings, XCircle, ChevronRight, Server, Pencil, Monitor, ExternalLink } from 'lucide-react';
import { Host, Session, HostGroup } from '@/utils/types';
import { useI18n } from '@/base/i18n/I18nContext';

interface TerminalTabBarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (e: React.MouseEvent, id: string) => void;
  onConnect: (host: Host) => void;
  onDuplicateSession: (session: Session) => void;
  onReorderSessions: (sessions: Session[]) => void;
  onOpenHostConfig: (session: Session) => void;
  // Drag
  dragTabRef: React.MutableRefObject<{ sessionId: string; startIndex: number } | null>;
  dragOverTabId: string | null;
  setDragOverTabId: (id: string | null) => void;
  // Rename
  renamingTabId: string | null;
  setRenamingTabId: (id: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSession: (sessionId: string, name: string | undefined) => void;
  // Host list
  hosts: Host[];
  groups: HostGroup[];
  isMinimalMode: boolean;
  onLocalConnect?: () => void;
  /** Effective hostname for active session (nested SSH) */
  effectiveHostname?: string | null;
}

export const TerminalTabBar: React.FC<TerminalTabBarProps> = React.memo(({
  sessions,
  currentSessionId,
  onSelectSession,
  onCloseSession,
  onConnect,
  onDuplicateSession,
  onReorderSessions,
  onOpenHostConfig,
  dragTabRef,
  dragOverTabId,
  setDragOverTabId,
  renamingTabId,
  setRenamingTabId,
  renameValue,
  setRenameValue,
  onRenameSession,
  hosts,
  groups,
  isMinimalMode,
  onLocalConnect,
  effectiveHostname,
}) => {
  const { t } = useI18n();

  // Tab context menu
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);

  // Tab "+" host picker popup
  const [hostPickerPos, setHostPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [hostPickerExpandedGroup, setHostPickerExpandedGroup] = useState<string | null>(null);
  const hostPickerRef = useRef<HTMLDivElement>(null);

  // Context menu: click on empty space to close
  useEffect(() => {
    if (!tabContextMenu) return;
    const handleClick = () => setTabContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [tabContextMenu]);

  // Host picker popup: click outside to close
  useEffect(() => {
    if (!hostPickerPos) return;
    const handleClick = (e: MouseEvent) => {
      if (hostPickerRef.current && !hostPickerRef.current.contains(e.target as Node)) {
        setHostPickerPos(null);
        setHostPickerExpandedGroup(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [hostPickerPos]);

  return (
    <>
      <div className={`flex items-stretch shrink-0 drag-region h-9 ${isMinimalMode ? '' : 'mt-8'}`} style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex overflow-x-auto no-scrollbar min-w-0" style={{ flex: '0 1 auto' }}>
          {sessions.map((session, index) => {
            const isActive = currentSessionId === session.id;
            const isDragOver = dragOverTabId === session.id;
            return (
              <div
                key={session.id}
                draggable={renamingTabId !== session.id}
                onDragStart={(e) => {
                  dragTabRef.current = { sessionId: session.id, startIndex: index };
                  e.dataTransfer.effectAllowed = 'move';
                  e.currentTarget.style.opacity = '0.5';
                }}
                onDragEnd={(e) => {
                  e.currentTarget.style.opacity = '1';
                  dragTabRef.current = null;
                  setDragOverTabId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragTabRef.current && dragTabRef.current.sessionId !== session.id) {
                    setDragOverTabId(session.id);
                  }
                }}
                onDragLeave={() => setDragOverTabId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTabId(null);
                  if (!dragTabRef.current || dragTabRef.current.sessionId === session.id) return;
                  const fromIndex = sessions.findIndex(s => s.id === dragTabRef.current!.sessionId);
                  const toIndex = index;
                  if (fromIndex === -1) return;
                  const reordered = [...sessions];
                  const [moved] = reordered.splice(fromIndex, 1);
                  reordered.splice(toIndex, 0, moved);
                  onReorderSessions(reordered);
                  dragTabRef.current = null;
                }}
                onClick={() => {
                  if (renamingTabId !== session.id) onSelectSession(session.id);
                }}
                onDoubleClick={() => {
                  setRenamingTabId(session.id);
                  setRenameValue(session.customName || session.host.name);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
                }}
                className={`flex items-center gap-2 px-3.5 min-w-[110px] max-w-[180px] shrink-0 cursor-pointer transition-all relative group no-drag ${
                  isActive ? '' : 'hover:bg-white/[0.04]'
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--bg-main)' : 'transparent',
                  borderLeft: isDragOver ? '2px solid var(--primary-color)' : '2px solid transparent',
                }}
              >
                {/* Active indicator */}
                {isActive && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--primary-color)]" />}
                {/* Right divider */}
                {!isActive && <div className="absolute right-0 top-2 bottom-2 w-[1px] bg-[var(--border-color)] opacity-40" />}

                {renamingTabId === session.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      const trimmed = renameValue.trim();
                      if (trimmed && trimmed !== session.host.name) {
                        onRenameSession(session.id, trimmed);
                      } else {
                        onRenameSession(session.id, undefined);
                      }
                      setRenamingTabId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') { setRenamingTabId(null); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent text-[11px] leading-none font-semibold text-[var(--text-main)] outline-none border-b border-[var(--primary-color)] py-0.5"
                  />
                ) : (
                  <span className={`truncate text-[11px] leading-none ${isActive ? 'font-semibold text-[var(--text-main)]' : 'font-medium text-[var(--text-dim)]'}`}>
                    {session.customName || (
                      session.id === currentSessionId && effectiveHostname
                        ? `${session.host.name} → ${effectiveHostname}`
                        : session.host.name
                    )}
                  </span>
                )}
                <button
                  onClick={(e) => onCloseSession(e, session.id)}
                  className={`ml-auto w-4 h-4 flex items-center justify-center rounded transition-all no-drag shrink-0 ${
                    isActive
                      ? 'opacity-30 hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-400'
                      : 'opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-rose-500/15 hover:text-rose-400'
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={(e) => {
            if (hostPickerPos) {
              setHostPickerPos(null);
              setHostPickerExpandedGroup(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setHostPickerPos({ x: rect.left, y: rect.bottom + 4 });
            }
          }}
          className="w-9 flex items-center justify-center hover:bg-white/[0.04] transition-colors no-drag shrink-0"
          style={{ color: 'var(--text-dim)' }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
      </div>

      {/* Tab "+" host picker popup */}
      {hostPickerPos && (() => {
        const grouped = new Map<string, Host[]>();
        const ungrouped: Host[] = [];
        hosts.forEach(h => {
          if (h.groupId) {
            const list = grouped.get(h.groupId) || [];
            list.push(h);
            grouped.set(h.groupId, list);
          } else {
            ungrouped.push(h);
          }
        });
        return (
          <div
            ref={hostPickerRef}
            className="fixed z-[9999] animate-in fade-in min-w-[200px] max-w-[280px]"
            style={{ left: hostPickerPos.x, top: hostPickerPos.y }}
          >
            <div className="bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl py-1.5 shadow-2xl backdrop-blur-2xl max-h-[360px] overflow-y-auto no-scrollbar"            >
              {/* Local Terminal */}
              {onLocalConnect && (
                <button
                  onClick={() => { onLocalConnect(); setHostPickerPos(null); setHostPickerExpandedGroup(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <Monitor className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">{t.dashboard.localTerminal || 'Local Terminal'}</span>
                </button>
              )}
              {onLocalConnect && hosts.length > 0 && <div className="my-1 border-t border-[var(--border-color)]" />}
              {hosts.length === 0 && !onLocalConnect ? (
                <div className="px-4 py-3 text-xs text-[var(--text-dim)] text-center">{t.dashboard.noHosts}</div>
              ) : hosts.length > 0 ? (
                <>
                  {groups.map(group => {
                    const groupHosts = grouped.get(group.id);
                    if (!groupHosts || groupHosts.length === 0) return null;
                    const isExpanded = hostPickerExpandedGroup === group.id;
                    return (
                      <div key={group.id}>
                        <button
                          onClick={() => setHostPickerExpandedGroup(isExpanded ? null : group.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.08)] transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 text-[var(--text-dim)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color || 'var(--text-dim)' }} />
                          <span className="truncate">{group.name}</span>
                          <span className="ml-auto text-[10px] text-[var(--text-dim)]">{groupHosts.length}</span>
                        </button>
                        {isExpanded && groupHosts.map(host => (
                          <button
                            key={host.id}
                            onClick={() => { onConnect(host); setHostPickerPos(null); setHostPickerExpandedGroup(null); }}
                            className="w-full flex items-center gap-2 pl-8 pr-3 py-2 text-xs text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                          >
                            <Server className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                            <span className="truncate">{host.name}</span>
                            <span className="ml-auto text-[10px] text-[var(--text-dim)] truncate max-w-[80px]">{host.hostname}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  {ungrouped.length > 0 && (
                    <div>
                      {grouped.size > 0 && <div className="my-1 border-t border-[var(--border-color)]" />}
                      {ungrouped.length > 0 && grouped.size > 0 && (
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{t.dashboard.uncategorized}</div>
                      )}
                      {ungrouped.map(host => (
                        <button
                          key={host.id}
                          onClick={() => { onConnect(host); setHostPickerPos(null); setHostPickerExpandedGroup(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
                        >
                          <Server className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                          <span className="truncate">{host.name}</span>
                          <span className="ml-auto text-[10px] text-[var(--text-dim)] truncate max-w-[80px]">{host.hostname}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
        </div>
      );
    })()}

      {/* Tab context menu */}
      {tabContextMenu && (() => {
        const session = sessions.find(s => s.id === tabContextMenu.sessionId);
        if (!session) return null;
        return (
          <div
            className="fixed z-[9999] animate-in fade-in"
            style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-xl py-1.5 shadow-2xl backdrop-blur-2xl min-w-[160px]">
              <button
                onClick={() => {
                  onDuplicateSession(session);
                  setTabContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                {t.terminal.duplicateTab}
              </button>
              <button
                onClick={() => {
                  if (session.host.connectionType === 'local') {
                    (window as any).electron.windowCreate({ localTerminal: true });
                  } else {
                    (window as any).electron.windowCreate({ hostToConnect: session.host });
                  }
                  setTabContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                {t.dashboard.openInNewWindow}
              </button>
              <button
                onClick={() => {
                  onOpenHostConfig(session);
                  setTabContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                {t.terminal.hostSettings}
              </button>
              <button
                onClick={() => {
                  setRenamingTabId(session.id);
                  setRenameValue(session.customName || session.host.name);
                  setTabContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-[var(--text-main)] hover:bg-[rgba(var(--primary-rgb),0.1)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                {t.terminal.renameTab}
              </button>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                onClick={(e) => {
                  onCloseSession(e as any, session.id);
                  setTabContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                {t.terminal.closeTab}
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
});
