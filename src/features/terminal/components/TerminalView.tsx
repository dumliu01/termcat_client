
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
}


const TerminalViewInner: React.FC<TerminalViewProps> = ({
  host,
  onClose,
  theme,
  terminalTheme = 'classic',
  terminalFontSize = 14,
  isActive = true,
  defaultFocusTarget = 'input',
  minimalPanelStates,
  onMinimalPanelStatesChange,
  initialDirectory: initialDirectoryProp,
  onConnectionReady,
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

  // SSH连接状态
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [initialDirectory, setInitialDirectory] = useState<string>(''); // 初始目录（home 目录）
  const [terminalId, setTerminalId] = useState<string>(''); // 终端后端 ID（本地为 ptyId，SSH 为 connectionId）
  const connectionIdRef = useRef<string | null>(null); // 使用 ref 保存 connectionId，避免依赖循环
  const connectionRef = useRef<IHostConnection | null>(null);



  // 面板可见性由 Header 按钮控制
  const showSidebar = minimalPanelStates?.sidebar ?? false;
  const showAiPanel = minimalPanelStates?.ai ?? false;
  const showBottomPanel = minimalPanelStates?.bottom ?? false;

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<CommandInputAreaRef>(null);

  // 获取内置插件注册的工具栏按钮和底部面板
  const toolbarToggles = useBuiltinToolbarToggles();
  const builtinBottomPanels = useBuiltinBottomPanels();
  // 获取内置右侧边栏面板（如 AI Ops）
  const builtinRightPanels = useBuiltinSidebarPanels('right');
  // 获取模板驱动面板
  const templateLeftPanels = usePanelList('sidebar-left');
  const templateRightPanels = usePanelList('sidebar-right');
  const templateBottomPanels = usePanelList('bottom-panel');

  // 推送连接信息给内置插件（支持 SSH 和本地终端）
  useEffect(() => {
    builtinPluginManager.setConnectionInfo(
      connectionRef.current ? {
        connectionId: connectionRef.current.id,
        connectionType: connectionRef.current.type,
        hostname: connectionRef.current.type === 'local' ? 'localhost' : host.hostname,
        isVisible: showSidebar,
        isActive,
        language,
      } : null
    );
  }, [connectionId, host.connectionType, host.hostname, showSidebar, isActive, language]);

  // 侧栏隐藏方法
  const hideSidebar = useCallback(() => {
    if (minimalPanelStates && onMinimalPanelStatesChange) {
      onMinimalPanelStatesChange({ ...minimalPanelStates, sidebar: false });
    }
  }, [minimalPanelStates, onMinimalPanelStatesChange]);

  // 底部面板显示/隐藏方法
  const setBottomPanelVisible = useCallback((visible: boolean) => {
    if (minimalPanelStates && onMinimalPanelStatesChange) {
      onMinimalPanelStatesChange({ ...minimalPanelStates, bottom: visible });
    }
  }, [minimalPanelStates, onMinimalPanelStatesChange]);

  // 监听面板关闭事件
  useEffect(() => {
    const sub = panelEventBus.on('monitoring', 'close', () => {
      hideSidebar();
    });
    return () => sub.dispose();
  }, [hideSidebar]);

  const headerBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)';
  const subHeaderBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)';

  // Tab 切换时根据用户设置自动聚焦
  useEffect(() => {
    if (!isActive) return;
    setTimeout(() => {
      if (defaultFocusTarget === 'input') {
        commandInputRef.current?.focus();
      } else {
        const xtermTextarea = terminalContainerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
        if (xtermTextarea) {
          xtermTextarea.focus();
        }
      }
    }, 100);
  }, [isActive, defaultFocusTarget]);




  // 处理侧边栏宽度拖拽
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

  // 处理 AI 面板拖拽
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


  // 处理底部面板拖拽
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

  // 持久化布局状态
  useEffect(() => {
    localStorage.setItem('termcat_sidebar_width', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('termcat_bottom_panel_height', bottomPanelHeight.toString());
  }, [bottomPanelHeight]);

  useEffect(() => {
    localStorage.setItem('termcat_ai_panel_width', aiPanelWidth.toString());
  }, [aiPanelWidth]);

  // 当底部面板高度或侧边栏尺寸变化时，触发一次全局 resize 事件以让 xterm 重新 fit
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch (e) {
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [bottomPanelHeight, showSidebar, sidebarWidth, activeBottomTab, showAiPanel, aiPanelWidth, showBottomPanel]);

  // 建立连接（SSH 或本地终端）
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

        // SSH: connection.id 在 connect() 后就是真实 connectionId，立即回报
        // Local: connection.id 此时为空，真实 ptyId 在 XTermTerminal.onReady 中回报
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

  // 监听 shell 关闭事件，更新连接状态（仅 SSH）
  useEffect(() => {
    if (!connectionId || !window.electron || host.connectionType === 'local') return;
    const unsubscribe = window.electron.onShellClose((closedConnId) => {
      if (closedConnId === connectionId) {
        setIsConnected(false);
      }
    });
    return () => { unsubscribe(); };
  }, [connectionId]);

  // 监听 shell 数据，解析初始目录（仅 SSH，本地终端使用不同 IPC 通道）
  useEffect(() => {
    if (!connectionId || !window.electron || initialDirectory || host.connectionType === 'local') return;

    let buffer = '';
    const shellDataBufferRef = { current: '' };

    const unsubscribe = window.electron.onShellData((connId, data) => {
      if (connId !== connectionId) return;

      shellDataBufferRef.current += data;

      // 尝试从提示符中解析初始目录
      // 模式4: 根目录 / 直接跟 $ 或 #
      if (shellDataBufferRef.current.match(/(?:^|\n)\/\s*[$#](?:\s|$)/)) {
        logger.debug(LOG_MODULE.TERMINAL, 'terminal.directory.parsed', 'Parsed initial directory from prompt', {
          module: LOG_MODULE.TERMINAL,
          directory: '/',
        });
        setInitialDirectory('/');
        return;
      }

      const patterns = [
        // 模式: /home/user$ 或 /home/user #
        /(?:^|\n)(\/[^\n$#]*)[$#](?:\s|$)/,
        // 模式: user@host:~$ 或 user@host:/path$
        /(?:^|\n)(?:[\w.-]+@[\w.-]+):(\/[^\n$#]*)[$#](?:\s|$)/,
        // 模式: [user@host ~]$ 或 [user@host /path]#
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

      // 保持缓冲区大小限制
      if (shellDataBufferRef.current.length > 2000) {
        shellDataBufferRef.current = shellDataBufferRef.current.slice(-2000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [connectionId, initialDirectory]);

  // 复制 Tab 时自动 cd 到源 session 的目录
  // 监听首条 shell 数据（= shell 已就绪），然后发送 cd
  const initialCdSentRef = React.useRef(false);
  useEffect(() => {
    if (!initialDirectoryProp || !connectionId || !window.electron || initialCdSentRef.current) return;

    const unsubscribe = window.electron.onShellData((connId: string) => {
      if (connId !== connectionId || initialCdSentRef.current) return;
      initialCdSentRef.current = true;
      // 等 shell prompt 完整输出后再发 cd
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
      // 将命令发送到交互式终端，就像用户直接在终端中输入一样
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
      // 保持焦点在命令输入框
      setTimeout(() => {
        commandInputRef.current?.focus();
      }, 50);
    }
  };

  // 处理 Ctrl+C 中断命令
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

  // 监听传输插件的新任务事件，自动切换到 transfer tab
  useEffect(() => {
    const disposable = builtinPluginManager.on(TRANSFER_EVENTS.ITEM_ADDED, () => {
      if (!showBottomPanel) {
        setBottomPanelVisible(true);
      }
      setActiveBottomTab('transfer');
    });
    return () => disposable.dispose();
  }, [showBottomPanel]);

  // 监听命令库插件的命令选择事件，填入终端输入框
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

  // 监听 AI Ops 插件的执行命令事件
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

      {/* 左侧边栏（模板驱动面板，多面板时 Tab 切换） */}
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

      {/* 侧边栏垂直宽度拖拽 */}
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

      {/* 主视图区域 */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0" style={{ backgroundColor: 'var(--terminal-bg)' }}>
        {/* 终端显示区域 - 使用交互式终端 */}
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
                // terminal.connect() 后 backend ID 才可用，更新到 state 触发子组件重渲染
                if (backendId) {
                  setTerminalId(backendId);
                  // 本地终端：connect() 之后才有真实 ptyId，此时补报 onConnectionReady
                  if (host.connectionType === 'local') {
                    setConnectionId(backendId);
                    connectionIdRef.current = backendId;
                    // 将 ptyId 同步到 LocalHostConnection，使 fsHandler 能获取终端 cwd
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
                commandInputRef.current?.setInputMode('terminal');
              }}
              isActive={isActive}
            />

            {/* 命令输入栏 */}
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
            {/* 主视图水平分栏拖拽 - 放在底部面板之前 */}
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
                {/* 内置插件底部面板（如文件浏览器） */}
                {builtinBottomPanels.map(panel => {
                  const Comp = panel.component;
                  return (
                    <div key={panel.id} className="flex-1 min-h-0" style={{ display: activeBottomTab === panel.id ? 'block' : 'none' }}>
                      <Comp connectionId={connectionId} fsHandler={connectionRef.current?.fsHandler} theme={theme} isVisible={activeBottomTab === panel.id} />
                    </div>
                  );
                })}

                {/* 外部插件底部面板（模板驱动） */}
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

      {/* 右侧：内置插件面板 + 模板驱动面板（多面板时 Tab 切换） */}
      {showAiPanel && (builtinRightPanels.length > 0 || templateRightPanels.length > 0) && (
        <>
          {/* 右侧 Resize Handle */}
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

          {/* 右侧面板内容 */}
          <aside
            className="flex flex-col shrink-0 relative tv-side-panel"
            style={{ width: `${aiPanelWidth}px`, backgroundColor: 'var(--bg-sidebar)' }}
          >
            {(() => {
              const rightTabs: TabItem[] = [
                // 内置右侧边栏面板（如 AI Ops）
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
                // 模板驱动右侧面板
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

              // 只有一个面板时不显示 Tab 栏
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

// React.memo 防止切换 tab 时不相关的 TerminalView 重新渲染，
// 避免 React render 过程阻塞主线程导致 canvas 闪烁。
// 自定义比较函数忽略每次渲染都会产生新引用的回调函数 props。
// 注意：isActive 不参与比较 — 采用 z-index 切 tab，inactive 的 tab 仍完整渲染在下层，
// 无需因 isActive 变化触发重渲染，避免 canvas 闪烁。
export const TerminalView = React.memo(TerminalViewInner, (prev, next) => {
  return (
    prev.host === next.host &&
    prev.theme === next.theme &&
    prev.terminalTheme === next.terminalTheme &&
    prev.terminalFontSize === next.terminalFontSize &&
    prev.defaultFocusTarget === next.defaultFocusTarget &&
    prev.minimalPanelStates === next.minimalPanelStates &&
    prev.onMinimalPanelStatesChange === next.onMinimalPanelStatesChange
  );
});
