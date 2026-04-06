
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Host, ThemeType, TerminalThemeType } from '@/utils/types';
import { useI18n, useTranslation } from '@/base/i18n/I18nContext';
import {
  X,
  RefreshCw,
} from 'lucide-react';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import { XTermTerminal } from './XTermTerminal';
import { HostConnectionFactory } from '@/core/terminal';
import { SSHHostConnection } from '@/core/terminal/SSHHostConnection';
import type { IHostConnection } from '@/core/terminal/IHostConnection';
import { useBuiltinToolbarToggles, useBuiltinBottomPanels, useBuiltinSidebarPanels } from '../hooks/useBuiltinPlugins';
import { builtinPluginManager } from '@/plugins/builtin';
import { TRANSFER_EVENTS } from '@/plugins/builtin/events';
import { usePanelList } from '../hooks/usePanelData';
import { PanelRenderer, panelEventBus } from '@/plugins/ui-contribution';
import { CommandInputArea, CommandInputAreaRef } from './CommandInputArea';
import { COMMAND_LIBRARY_EVENTS, AI_OPS_EVENTS } from '@/plugins/builtin/events';
import { TabbedPanelGroup, TabItem } from './TabbedPanelGroup';

import { MinimalPanelStates } from '@/features/shared/components/Header';

interface TerminalViewProps {
  host: Host;
  onClose: () => void;
  theme: ThemeType;
  terminalTheme?: TerminalThemeType;
  terminalFontSize?: number;
  isActive?: boolean;
  defaultFocusTarget?: 'input' | 'terminal';
  minimalPanelStates?: MinimalPanelStates;
  onMinimalPanelStatesChange?: (states: MinimalPanelStates) => void;
  initialDirectory?: string;
  onConnectionReady?: (connectionId: string) => void;
  onEffectiveHostnameChange?: (hostname: string | null) => void;
}


const TerminalViewInner: React.FC<TerminalViewProps> = ({
  host,
  onClose,
  theme,
  terminalTheme = 'classic',
  terminalFontSize = 14,
  isActive = true,
  defaultFocusTarget = 'terminal',
  minimalPanelStates,
  onMinimalPanelStatesChange,
  initialDirectory: initialDirectoryProp,
  onConnectionReady,
  onEffectiveHostnameChange,
}) => {
  const { language } = useI18n();
  const t = useTranslation();
  const [inputValue, setInputValue] = useState('');

  const [activeBottomTab, setActiveBottomTab] = useState<string>('files');
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('termcat_sidebar_width');
    return saved ? parseInt(saved, 10) : 280;
  });
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = localStorage.getItem('termcat_bottom_panel_height');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const saved = localStorage.getItem('termcat_ai_panel_width');
    return saved ? parseInt(saved, 10) : 360;
  });
  const [isResizingBottom, setIsResizingBottom] = useState(false);
  const [isResizingSidebarWidth, setIsResizingSidebarWidth] = useState(false);
  const [isResizingAi, setIsResizingAi] = useState(false); // AI Panel Resize State

  const [showHistory, setShowHistory] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(`history_${host.id}`);
    return saved ? JSON.parse(saved) : ['ls -alh', 'top', 'df -h', 'systemctl status sshd'];
  });

  // SSH connection status
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [initialDirectory, setInitialDirectory] = useState<string>(''); // Initial directory (home directory)
  const [terminalId, setTerminalId] = useState<string>(''); // Terminal backend ID (ptyId for local, connectionId for SSH)
  const connectionIdRef = useRef<string | null>(null); // Use ref to store connectionId, avoid dependency cycle
  const connectionRef = useRef<IHostConnection | null>(null);
  const [effectiveHostname, setEffectiveHostname] = useState<string | null>(null);



  // Panel visibility controlled by Header buttons
  const showSidebar = minimalPanelStates?.sidebar ?? false;
  const showAiPanel = minimalPanelStates?.ai ?? false;
  const showBottomPanel = minimalPanelStates?.bottom ?? false;

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<CommandInputAreaRef>(null);

  // Track per-tab focus override: remembers last user-chosen focus target
  const userFocusOverrideRef = useRef<'input' | 'terminal' | null>(null);

  // Get built-in plugin toolbar buttons and bottom panels
  const toolbarToggles = useBuiltinToolbarToggles();
  const builtinBottomPanels = useBuiltinBottomPanels();
  // Get built-in right sidebar panels (e.g. AI Ops)
  const builtinRightPanels = useBuiltinSidebarPanels('right');
  // Get template-driven panels
  const templateLeftPanels = usePanelList('sidebar-left');
  const templateRightPanels = usePanelList('sidebar-right');
  const templateBottomPanels = usePanelList('bottom-panel');

  // Push connection info to built-in plugins (supports SSH and local terminal)
  // Only triggers plugin onConnectionChange when connection identity changes
  useEffect(() => {
    builtinPluginManager.setConnectionInfo(
      connectionRef.current ? {
        connectionId: connectionRef.current.id,
        connectionType: connectionRef.current.type,
        hostname: connectionRef.current.type === 'local' ? 'localhost' : host.hostname,
        isVisible: showSidebar,
        isActive,
        language,
        effectiveHostname: effectiveHostname ?? undefined,
      } : null
    );
  }, [connectionId, host.connectionType, host.hostname, language]);

  // Update visibility/activity state separately (lightweight, no plugin rebuild)
  // When this tab becomes active, re-push its connection info so monitoring switches to this tab.
  // Pass connectionId to updateVisibility so inactive tabs don't stop the active tab's monitor.
  useEffect(() => {
    if (isActive && connectionRef.current) {
      builtinPluginManager.setConnectionInfo({
        connectionId: connectionRef.current.id,
        connectionType: connectionRef.current.type,
        hostname: connectionRef.current.type === 'local' ? 'localhost' : host.hostname,
        isVisible: showSidebar,
        isActive,
        language,
        effectiveHostname: effectiveHostname ?? undefined,
      });
    }
    builtinPluginManager.updateVisibility(showSidebar, isActive, connectionRef.current?.id);
  }, [showSidebar, isActive]);

  // Reset nested SSH state when connection changes
  useEffect(() => {
    setEffectiveHostname(null);
  }, [connectionId]);

  // Subscribe to nested SSH host changes for transparent proxy
  useEffect(() => {
    const connection = connectionRef.current;
    if (!connection?.onHostChanged) return;

    const unsub = connection.onHostChanged((hostname: string) => {
      const isOriginal = hostname === host.hostname;
      const newEffective = isOriginal ? null : hostname;
      setEffectiveHostname(newEffective);
      onEffectiveHostnameChange?.(newEffective);
      // Delay plugin notification: target shell needs a few seconds to fully
      // initialize after SSH login. Immediate commands would fail.
      setTimeout(() => {
        builtinPluginManager.setConnectionInfo({
          connectionId: connection.id,
          connectionType: connection.type,
          hostname: connection.type === 'local' ? 'localhost' : host.hostname,
          isVisible: showSidebar,
          isActive,
          language,
          effectiveHostname: isOriginal ? undefined : hostname,
          monitorCmdExecutor: connection.monitorCmdExecutor ?? undefined,
        });
      }, 3000);
    });

    return unsub;
  }, [connectionId]);

  // Sidebar hide method
  const hideSidebar = useCallback(() => {
    if (minimalPanelStates && onMinimalPanelStatesChange) {
      onMinimalPanelStatesChange({ ...minimalPanelStates, sidebar: false });
    }
  }, [minimalPanelStates, onMinimalPanelStatesChange]);

  // Bottom panel show/hide method
  const setBottomPanelVisible = useCallback((visible: boolean) => {
    if (minimalPanelStates && onMinimalPanelStatesChange) {
      onMinimalPanelStatesChange({ ...minimalPanelStates, bottom: visible });
    }
  }, [minimalPanelStates, onMinimalPanelStatesChange]);

  // Listen for panel close event
  useEffect(() => {
    const sub = panelEventBus.on('monitoring', 'close', () => {
      hideSidebar();
    });
    return () => sub.dispose();
  }, [hideSidebar]);

  const headerBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)';
  const subHeaderBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)';

  // Auto-focus on tab switch: use per-tab override if user has switched focus, otherwise use default
  useEffect(() => {
    if (!isActive) return;
    const target = userFocusOverrideRef.current ?? defaultFocusTarget;
    setTimeout(() => {
      if (target === 'input') {
        commandInputRef.current?.focus();
      } else {
        const xtermTextarea = terminalContainerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
        if (xtermTextarea) {
          xtermTextarea.focus();
        }
      }
    }, 100);
  }, [isActive, defaultFocusTarget]);




  // Handle sidebar width drag
  useEffect(() => {
    const handleMouseMoveSidebarWidth = (e: MouseEvent) => {
      if (!isResizingSidebarWidth || !terminalContainerRef.current) return;
      const containerRect = terminalContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      if (newWidth >= 180 && newWidth <= containerRect.width / 2) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUpSidebarWidth = () => {
      setIsResizingSidebarWidth(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    if (isResizingSidebarWidth) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMoveSidebarWidth);
      window.addEventListener('mouseup', handleMouseUpSidebarWidth);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveSidebarWidth);
      window.removeEventListener('mouseup', handleMouseUpSidebarWidth);
    };
  }, [isResizingSidebarWidth]);

  // Handle AI panel drag
  useEffect(() => {
    const handleMouseMoveAi = (e: MouseEvent) => {
      if (!isResizingAi) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= 800) {
        setAiPanelWidth(newWidth);
      }
    };
    const handleMouseUpAi = () => {
      setIsResizingAi(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    if (isResizingAi) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMoveAi);
      window.addEventListener('mouseup', handleMouseUpAi);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveAi);
      window.removeEventListener('mouseup', handleMouseUpAi);
    };
  }, [isResizingAi]);

  // Handle bottom panel drag
  useEffect(() => {
    const handleMouseMoveBottom = (e: MouseEvent) => {
      if (!isResizingBottom) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 140 && newHeight <= window.innerHeight * 0.8) {
        setBottomPanelHeight(newHeight);
      }
    };
    const handleMouseUpBottom = () => {
      setIsResizingBottom(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    if (isResizingBottom) {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMoveBottom);
      window.addEventListener('mouseup', handleMouseUpBottom);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveBottom);
      window.removeEventListener('mouseup', handleMouseUpBottom);
    };
  }, [isResizingBottom]);

  // Persist layout state
  useEffect(() => {
    localStorage.setItem('termcat_sidebar_width', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('termcat_bottom_panel_height', bottomPanelHeight.toString());
  }, [bottomPanelHeight]);

  useEffect(() => {
    localStorage.setItem('termcat_ai_panel_width', aiPanelWidth.toString());
  }, [aiPanelWidth]);

  // When bottom panel height or sidebar size changes, trigger a global resize event to let xterm refit
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch (e) {
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [bottomPanelHeight, showSidebar, sidebarWidth, activeBottomTab, showAiPanel, aiPanelWidth, showBottomPanel]);

  // Establish connection (SSH or local terminal)
  useEffect(() => {
    let isCleanedUp = false;

    const connectHost = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        const connection = HostConnectionFactory.create(host);

        if (connection.type === 'ssh') {
          await (connection as SSHHostConnection).connect();
        }

        if (isCleanedUp) {
          connection.dispose();
          return;
        }

        connectionRef.current = connection;
        setConnectionId(connection.id);
        connectionIdRef.current = connection.id;

        // SSH: connection.id is the real connectionId after connect(), report immediately
        // Local: connection.id is empty at this point, real ptyId is reported in XTermTerminal.onReady
        if (connection.type === 'ssh') {
          onConnectionReady?.(connection.id);
        }

        setIsConnected(true);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Connection failed';

        if (errorMsg.includes('PROXY_UNREACHABLE:')) {
          const match = errorMsg.match(/PROXY_UNREACHABLE:([^:]+):(\d+)/);
          if (match) {
            const proxyHost = match[1];
            const proxyPort = match[2];

            logger.warn(LOG_MODULE.TERMINAL, 'terminal.proxy.unreachable', 'Proxy unreachable, asking user', {
              module: LOG_MODULE.TERMINAL,
              host_id: host.id,
              proxy_host: proxyHost,
              proxy_port: proxyPort,
            });

            const proxyInfo = `${proxyHost}:${proxyPort}`;
            const message = t.terminal.proxyUnreachable.replace('{proxy}', proxyInfo);
            const shouldRetry = window.confirm(`${message}\n\n${t.terminal.proxyUnreachableRetry}`);

            if (shouldRetry) {
              logger.info(LOG_MODULE.TERMINAL, 'terminal.connection.retry_direct', 'User chose to retry with direct connection', {
                module: LOG_MODULE.TERMINAL,
                host_id: host.id,
              });

              try {
                const hostWithoutProxy = { ...host, proxy: undefined, proxyId: undefined };
                const retryConnection = HostConnectionFactory.create(hostWithoutProxy);
                await (retryConnection as SSHHostConnection).connect();

                if (isCleanedUp) {
                  retryConnection.dispose();
                  return;
                }

                connectionRef.current = retryConnection;
                setConnectionId(retryConnection.id);
                connectionIdRef.current = retryConnection.id;
                setIsConnected(true);
                return;
              } catch (retryError) {
                logger.error(LOG_MODULE.TERMINAL, 'terminal.connection.retry_failed', 'Direct connection retry failed', {
                  module: LOG_MODULE.TERMINAL,
                  host_id: host.id,
                  error: 1,
                  msg: retryError instanceof Error ? retryError.message : 'Connection failed',
                });
                setConnectionError(retryError instanceof Error ? retryError.message : 'Connection failed');
              }
            } else {
              logger.info(LOG_MODULE.TERMINAL, 'terminal.connection.cancelled', 'User cancelled connection', {
                module: LOG_MODULE.TERMINAL,
                host_id: host.id,
              });
              setConnectionError(message);
            }
          } else {
            logger.error(LOG_MODULE.TERMINAL, 'terminal.proxy.parse_failed', 'Failed to parse proxy error', {
              module: LOG_MODULE.TERMINAL,
              host_id: host.id,
              error_msg: errorMsg,
            });
            setConnectionError(errorMsg);
          }
        } else {
          logger.error(LOG_MODULE.TERMINAL, 'terminal.connection.failed', 'Connection failed', {
            module: LOG_MODULE.TERMINAL,
            host_id: host.id,
            host: host.hostname,
            error: 1,
            msg: errorMsg,
          });
          setConnectionError(errorMsg);
        }
      } finally {
        setIsConnecting(false);
      }
    };

    connectHost();

    return () => {
      isCleanedUp = true;
      if (connectionRef.current) {
        connectionRef.current.dispose();
        connectionRef.current = null;
      }
    };
  }, [host]);

  // Listen for shell close event, update connection status (SSH only)
  useEffect(() => {
    if (!connectionId || !window.electron || host.connectionType === 'local') return;
    const unsubscribe = window.electron.onShellClose((closedConnId) => {
      if (closedConnId === connectionId) {
        setIsConnected(false);
      }
    });
    return () => { unsubscribe(); };
  }, [connectionId]);

  // Listen for shell data, parse initial directory (SSH only, local terminal uses different IPC channel)
  useEffect(() => {
    if (!connectionId || !window.electron || initialDirectory || host.connectionType === 'local') return;

    let buffer = '';
    const shellDataBufferRef = { current: '' };

    const unsubscribe = window.electron.onShellData((connId, data) => {
      if (connId !== connectionId) return;

      shellDataBufferRef.current += data;

      // Try to parse initial directory from prompt
      // Pattern 4: root / followed by $ or # directly
      if (shellDataBufferRef.current.match(/(?:^|\n)\/\s*[$#](?:\s|$)/)) {
        logger.debug(LOG_MODULE.TERMINAL, 'terminal.directory.parsed', 'Parsed initial directory from prompt', {
          module: LOG_MODULE.TERMINAL,
          directory: '/',
        });
        setInitialDirectory('/');
        return;
      }

      const patterns = [
        // Pattern: /home/user$ or /home/user #
        /(?:^|\n)(\/[^\n$#]*)[$#](?:\s|$)/,
        // Pattern: user@host:~$ or user@host:/path$
        /(?:^|\n)(?:[\w.-]+@[\w.-]+):(\/[^\n$#]*)[$#](?:\s|$)/,
        // Pattern: [user@host ~]$ or [user@host /path]#
        /(?:^|\n)\[[\w.@_-]+\s+([^\n\]]+)\][$#](?:\s|$)/,
      ];

      for (const pattern of patterns) {
        const match = shellDataBufferRef.current.match(pattern);
        if (match && match[1]) {
          const detectedPath = match[1];
          if (detectedPath.startsWith('/') && detectedPath.length > 0) {
            logger.debug(LOG_MODULE.TERMINAL, 'terminal.directory.parsed', 'Parsed initial directory from prompt', {
              module: LOG_MODULE.TERMINAL,
              directory: detectedPath,
            });
            setInitialDirectory(detectedPath);
            return;
          }
        }
      }

      // Keep buffer size limit
      if (shellDataBufferRef.current.length > 2000) {
        shellDataBufferRef.current = shellDataBufferRef.current.slice(-2000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [connectionId, initialDirectory]);

  // When duplicating Tab, auto cd to the source session's directory
  // Listen for first shell data (= shell is ready), then send cd
  const initialCdSentRef = React.useRef(false);
  useEffect(() => {
    if (!initialDirectoryProp || !connectionId || !window.electron || initialCdSentRef.current) return;

    const unsubscribe = window.electron.onShellData((connId: string) => {
      if (connId !== connectionId || initialCdSentRef.current) return;
      initialCdSentRef.current = true;
      // Wait for shell prompt to fully output before sending cd
      setTimeout(() => {
        logger.info(LOG_MODULE.TERMINAL, 'terminal.cd_sending', 'Sending cd command for duplicated tab', {
          target: initialDirectoryProp,
          connectionId,
        });
        connectionRef.current?.terminal.write(`cd ${initialDirectoryProp.replace(/'/g, "'\\''")}\n`);
      }, 150);
      unsubscribe();
    });

    return () => unsubscribe();
  }, [initialDirectoryProp, connectionId]);

  const handleExecute = async (cmd: string) => {
    if (!cmd.trim() || !isConnected || isExecutingCommand || !connectionId) return;

    setCommandHistory(prev => {
      const filtered = prev.filter(h => h !== cmd);
      const newHistory = [cmd, ...filtered].slice(0, 50);
      localStorage.setItem(`history_${host.id}`, JSON.stringify(newHistory));
      return newHistory;
    });

    setIsExecutingCommand(true);
    setInputValue('');
    setShowHistory(false);

    try {
      // Send command to interactive terminal, as if user typed directly in terminal
      if (connectionRef.current) {
        const commandWithEnter = cmd + '\r';
        connectionRef.current.terminal.write(commandWithEnter);
      }
    } catch (error) {
      logger.error(LOG_MODULE.TERMINAL, 'terminal.command.execution_failed', 'Command execution failed', {
        module: LOG_MODULE.TERMINAL,
        connection_id: connectionId,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsExecutingCommand(false);
      // Keep focus on command input
      setTimeout(() => {
        commandInputRef.current?.focus();
      }, 50);
    }
  };

  // Handle Ctrl+C interrupt command
  const handleInterrupt = async () => {
    if (!isConnected || !connectionRef.current) return;

    try {
      connectionRef.current.terminal.write('\x03');
    } catch (error) {
      logger.error(LOG_MODULE.TERMINAL, 'terminal.interrupt.failed', 'Interrupt command failed', {
        module: LOG_MODULE.TERMINAL,
        connection_id: connectionId,
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Listen for transfer plugin new task events, auto switch to transfer tab
  useEffect(() => {
    const disposable = builtinPluginManager.on(TRANSFER_EVENTS.ITEM_ADDED, () => {
      if (!showBottomPanel) {
        setBottomPanelVisible(true);
      }
      setActiveBottomTab('transfer');
    });
    return () => disposable.dispose();
  }, [showBottomPanel]);

  // Listen for command library plugin command select events, fill into terminal input
  useEffect(() => {
    const disposable = builtinPluginManager.on(COMMAND_LIBRARY_EVENTS.COMMAND_SELECTED, (payload) => {
      const cmd = payload as string;
      setInputValue(cmd);
      setTimeout(() => {
        commandInputRef.current?.focusWithSelection(cmd.length, cmd.length);
      }, 50);
    });
    return () => disposable.dispose();
  }, []);

  // Listen for AI Ops plugin execute command events
  const handleExecuteRef = useRef(handleExecute);
  handleExecuteRef.current = handleExecute;
  useEffect(() => {
    const disposable = builtinPluginManager.on(AI_OPS_EVENTS.EXECUTE_COMMAND, (payload) => {
      const cmd = payload as string;
      handleExecuteRef.current(cmd);
    });
    return () => disposable.dispose();
  }, []);

  const handleReconnect = async () => {
    try {
      setIsConnecting(true);
      setConnectionError(null);

      connectionRef.current?.dispose();

      const connection = HostConnectionFactory.create(host);
      if (connection.type === 'ssh') {
        await (connection as SSHHostConnection).connect();
      }

      connectionRef.current = connection;
      setConnectionId(connection.id);
      setIsConnected(true);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div ref={terminalContainerRef} className="flex h-full overflow-hidden select-none relative" style={{ backgroundColor: 'var(--bg-main)' }}>

      {/* Left sidebar (template-driven panels, with Tab switch for multiple panels) */}
      {showSidebar && templateLeftPanels.length > 0 && (
        <aside
          style={{ width: `${sidebarWidth}px`, backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
          className="flex flex-col relative shrink-0 border-r overflow-y-auto no-scrollbar font-sans select-text tv-side-panel"
        >
          <TabbedPanelGroup
            tabs={templateLeftPanels.map(panel => ({
              id: panel.id,
              title: panel.title,
              icon: panel.icon,
              content: <PanelRenderer panelId={panel.id} />,
            }))}
          />
        </aside>
      )}

      {/* Sidebar vertical width resize handle */}
      {showSidebar && (
        <div
          className="w-1.5 -mx-0.5 cursor-col-resize z-[45] relative group flex items-center justify-center transition-all shrink-0 hover:bg-white/10"
          onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebarWidth(true); }}
        >
          <div
            className={`w-0.5 h-12 rounded-full transition-all duration-300 ${
              isResizingSidebarWidth
                ? 'bg-primary scale-y-110 opacity-100'
                : 'bg-white/20 opacity-0 group-hover:opacity-100'
            }`}
          />
        </div>
      )}

      {/* Main view area */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0" style={{ backgroundColor: 'var(--terminal-bg)' }}>
        {/* Terminal display area - using interactive terminal */}
        {connectionRef.current?.terminal ? (
          <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
            <XTermTerminal
              backend={connectionRef.current.terminal}
              theme={theme}
              terminalTheme={terminalTheme}
              terminalFontSize={terminalFontSize}
              terminalConfig={host.terminal}
              onReady={() => {
                const backendId = connectionRef.current?.terminal?.id;
                logger.debug(LOG_MODULE.TERMINAL, 'terminal.xterm.ready', 'XTerm terminal ready', {
                  module: LOG_MODULE.TERMINAL,
                  terminal_id: backendId,
                });
                // Backend ID is available after terminal.connect(), update state to trigger child component re-render
                if (backendId) {
                  setTerminalId(backendId);
                  // Local terminal: real ptyId available after connect(), report onConnectionReady here
                  if (host.connectionType === 'local') {
                    setConnectionId(backendId);
                    connectionIdRef.current = backendId;
                    // Sync ptyId to LocalHostConnection, so fsHandler can get terminal cwd
                    const conn = connectionRef.current;
                    if (conn && 'updatePtyId' in conn) {
                      (conn as any).updatePtyId(backendId);
                    }
                    onConnectionReady?.(backendId);
                  }
                }
              }}
              onReconnect={handleReconnect}
              onTerminalFocusGained={() => {
                userFocusOverrideRef.current = 'terminal';
                commandInputRef.current?.setInputMode('terminal');
              }}
              isActive={isActive}
            />

            {/* Command input area */}
            <CommandInputArea
              ref={commandInputRef}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onExecute={handleExecute}
              onInterrupt={handleInterrupt}
              showHistory={showHistory}
              setShowHistory={setShowHistory}
              commandHistory={commandHistory}
              setCommandHistory={setCommandHistory}
              isExecutingCommand={isExecutingCommand}
              isConnected={isConnected}
              connectionError={connectionError}
              onReconnect={handleReconnect}
              t={t}
              theme={theme}
              connectionId={connectionId}
              connectionType={host.connectionType === 'local' ? 'local' : 'ssh'}
              initialDirectory={initialDirectory}
              onInputFocusGained={() => { userFocusOverrideRef.current = 'input'; }}
              defaultFocusTarget={defaultFocusTarget}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--terminal-bg)' }}>
            <div className="text-center space-y-4">
              {isConnecting ? (
                <>
                  <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto" />
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Connecting...</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                    <X className="w-6 h-6 text-red-500" />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    {connectionError || 'Not connected'}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {showBottomPanel ? (
          <>
            {/* Main view horizontal split resize handle - placed before bottom panel */}
            <div
              className="h-1.5 -my-0.5 cursor-row-resize z-[40] relative group flex items-center justify-center transition-all hover:bg-white/10"
              onMouseDown={(e) => { e.preventDefault(); setIsResizingBottom(true); }}
            >
              <div
                className={`w-12 h-0.5 rounded-full transition-all duration-300 ${
                  isResizingBottom
                    ? 'bg-primary scale-x-110 opacity-100'
                    : 'bg-white/20 opacity-0 group-hover:opacity-100'
                }`}
              />
            </div>

            <div className="shrink-0 border-t flex flex-col bg-[var(--bg-sidebar)] tv-bottom-panel" style={{ borderColor: 'var(--border-color)', height: `${bottomPanelHeight}px` }}>
              <div className="h-10 border-b flex items-center px-0 shrink-0" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}>
                {[
                  ...builtinBottomPanels.map(p => ({ id: p.id, label: p.getLocalizedTitle ? p.getLocalizedTitle(language) : p.title })),
                  ...templateBottomPanels.map(p => ({ id: `plugin:${p.id}`, label: p.title })),
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (activeBottomTab === tab.id) {
                        setBottomPanelVisible(false);
                      } else {
                        setActiveBottomTab(tab.id);
                      }
                    }}
                    className={`flex items-center justify-center px-8 h-full text-[11px] font-bold transition-all border-t-2 ${activeBottomTab === tab.id ? 'border-primary text-primary' : 'border-transparent hover:text-primary opacity-60'}`}
                    style={{ backgroundColor: activeBottomTab === tab.id ? 'var(--bg-sidebar)' : 'transparent' }}
                  >
                    {tab.label}
                  </button>
                ))}
                <div className="ml-auto flex items-center px-4">
                  <button
                    onClick={() => setBottomPanelVisible(false)}
                    className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-white/5 rounded"
                    title="Close Panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {/* Built-in plugin bottom panels (e.g. file browser) */}
                {builtinBottomPanels.map(panel => {
                  const Comp = panel.component;
                  return (
                    <div key={panel.id} className="flex-1 min-h-0" style={{ display: activeBottomTab === panel.id ? 'block' : 'none' }}>
                      <Comp connectionId={connectionId} fsHandler={connectionRef.current?.fsHandler} theme={theme} isVisible={activeBottomTab === panel.id} />
                    </div>
                  );
                })}

                {/* External plugin bottom panels (template-driven) */}
                {templateBottomPanels.map(panel => (
                  <div key={panel.id} className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ display: activeBottomTab === `plugin:${panel.id}` ? 'block' : 'none' }}>
                    <PanelRenderer panelId={panel.id} />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>

      {/* Right: Built-in plugin panels + template-driven panels (Tab switch for multiple panels) */}
      {showAiPanel && (builtinRightPanels.length > 0 || templateRightPanels.length > 0) && (
        <>
          {/* Right resize handle */}
          <div
            className="w-1.5 -mx-0.5 cursor-col-resize z-[45] relative group flex items-center justify-center transition-all shrink-0 hover:bg-white/10"
            onMouseDown={(e) => { e.preventDefault(); setIsResizingAi(true); }}
          >
            <div
              className={`w-0.5 h-12 rounded-full transition-all duration-300 ${
                isResizingAi
                  ? 'bg-primary scale-y-110 opacity-100'
                  : 'bg-white/20 opacity-0 group-hover:opacity-100'
              }`}
            />
          </div>

          {/* Right panel content */}
          <aside
            className="flex flex-col shrink-0 relative tv-side-panel"
            style={{ width: `${aiPanelWidth}px`, backgroundColor: 'var(--bg-sidebar)' }}
          >
            {(() => {
              const rightTabs: TabItem[] = [
                // Built-in right sidebar panels (e.g. AI Ops)
                ...builtinRightPanels.map(panel => {
                  const Comp = panel.component;
                  return {
                    id: panel.id,
                    title: panel.id,
                    content: (
                      <Comp
                        sessionId={connectionId || ''}
                        connectionId={connectionId || ''}
                        connectionType={host.connectionType === 'local' ? 'local' : 'ssh'}
                        terminalId={terminalId || connectionId || ''}
                        host={host}
                        width={aiPanelWidth}
                        isVisible={showAiPanel}
                        isActive={isActive}
                        theme={theme}
                        language={language}
                        onClose={() => {
                          if (minimalPanelStates && onMinimalPanelStatesChange) {
                            onMinimalPanelStatesChange({ ...minimalPanelStates, ai: false });
                          }
                        }}
                      />
                    ),
                  };
                }),
                // Template-driven right panels
                ...templateRightPanels.map(panel => ({
                  id: panel.id,
                  title: panel.title,
                  icon: panel.icon,
                  content: (
                    <div className="h-full overflow-y-auto no-scrollbar">
                      <PanelRenderer panelId={panel.id} />
                    </div>
                  ),
                })),
              ];

              // Don't show Tab bar if there's only one panel
              if (rightTabs.length === 1) {
                return rightTabs[0].content;
              }

              return <TabbedPanelGroup tabs={rightTabs} />;
            })()}
          </aside>
        </>
      )}

    </div>
  );
};

// React.memo prevents unrelated TerminalView from re-rendering when switching tabs,
// avoiding React render process from blocking main thread causing canvas flicker.
// Custom compare function ignores callback function props that generate new references each render.
// Note: isActive MUST be included — XTermTerminal relies on isActive to manage background
// data buffering (isActiveRef) and buffer flushing. Without it, tab switching after panel
// state changes (e.g. opening monitoring panel) causes isActiveRef to become stale,
// making the terminal appear unresponsive.
export const TerminalView = React.memo(TerminalViewInner, (prev, next) => {
  return (
    prev.host === next.host &&
    prev.theme === next.theme &&
    prev.terminalTheme === next.terminalTheme &&
    prev.terminalFontSize === next.terminalFontSize &&
    prev.isActive === next.isActive &&
    prev.defaultFocusTarget === next.defaultFocusTarget &&
    prev.minimalPanelStates === next.minimalPanelStates &&
    prev.onMinimalPanelStatesChange === next.onMinimalPanelStatesChange
  );
});
