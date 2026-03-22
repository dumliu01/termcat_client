import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import 'xterm/css/xterm.css';
import { TerminalThemeType } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import type { ITerminalBackend } from '@/core/terminal/ITerminalBackend';

// 使用模块化日志器优化性能（在模块级别创建，避免重复传参）
const log = logger.withFields({ module: LOG_MODULE.TERMINAL });

interface XTermTerminalProps {
  backend: ITerminalBackend;         // replaces connectionId
  theme: 'dark' | 'light';
  terminalTheme?: TerminalThemeType;
  terminalFontSize?: number;
  terminalConfig?: {
    encoding?: string;
    backspaceSeq?: string;
    deleteSeq?: string;
  };
  onReady?: () => void;
  onReconnect?: () => void;
  onTerminalFocusGained?: () => void; // 终端获得焦点时的回调
  isActive?: boolean; // 是否为当前活跃 Tab，后台 Tab 缓冲数据
}

// Terminal theme color schemes
const TERMINAL_THEME_CONFIGS: Record<TerminalThemeType, {
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}> = {
  classic: {
    background: '#010409',
    foreground: '#e6edf3',
    cursor: '#6366f1',
    black: '#010409',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#e6edf3',
    brightBlack: '#484e58',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#f8fafc'
  },
  solarized: {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#268bd2',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3'
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f92672',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5'
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#bd93f9',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },
  matrix: {
    background: '#000000',
    foreground: '#00ff41',
    cursor: '#00ff41',
    black: '#000000',
    red: '#ff3333',
    green: '#00ff41',
    yellow: '#ffff33',
    blue: '#3333ff',
    magenta: '#ff33ff',
    cyan: '#33ffff',
    white: '#cccccc',
    brightBlack: '#666666',
    brightRed: '#ff6666',
    brightGreen: '#66ff66',
    brightYellow: '#ffff66',
    brightBlue: '#6666ff',
    brightMagenta: '#ff66ff',
    brightCyan: '#66ffff',
    brightWhite: '#ffffff'
  }
};

export const XTermTerminal: React.FC<XTermTerminalProps> = ({
  backend,
  theme,
  terminalTheme = 'classic',
  terminalFontSize = 12,
  terminalConfig,
  onReady,
  onReconnect,
  onTerminalFocusGained,
  isActive = true,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isShellReady, setIsShellReady] = useState(false);
  const originalOnErrorRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const terminalDestroyedRef = useRef(false);

  // P1: 后台 Tab 数据缓冲
  const isActiveRef = useRef(isActive);
  const pendingDataRef = useRef<string[]>([]);
  // P6: 前台 Tab 批量写入缓冲
  const writeBufferRef = useRef<string[]>([]);
  const writeRafRef = useRef<number | null>(null);

  // 保持 isActiveRef 同步
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // isActive 从 false→true 时，flush 缓冲区数据到终端，并重新 fit（窗口可能在后台时 resize 过）
  useEffect(() => {
    if (!isActive) return;
    if (xtermRef.current && pendingDataRef.current.length > 0) {
      const buffered = pendingDataRef.current.join('');
      pendingDataRef.current = [];
      xtermRef.current.write(buffered);
    }
    // 切回前台时 refit，确保尺寸正确（窗口可能在后台时被 resize）
    if (fitAddonRef.current && xtermRef.current && terminalRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {}
      });
    }
  }, [isActive]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 重置mounted状态（React严格模式会导致组件重新挂载）
    mountedRef.current = true;
    terminalDestroyedRef.current = false;

    // 设置全局错误处理器来捕获xterm错误
    originalOnErrorRef.current = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      if (message && typeof message === 'string' && message.includes('xterm') && message.includes('dimensions')) {
log.warn('xterm.dimensions_error', 'Caught xterm dimensions error, suppressing', { error: 1001 });
        return true; // 阻止错误传播
      }
      // 调用原始错误处理器
      if (originalOnErrorRef.current) {
        return originalOnErrorRef.current(message, source, lineno, colno, error);
      }
      return false;
    };

    // 获取终端主题配置
    const termThemeConfig = TERMINAL_THEME_CONFIGS[terminalTheme] || TERMINAL_THEME_CONFIGS.classic;
    const fontSize = terminalFontSize || 12;

    // 创建终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: termThemeConfig.background,
        foreground: termThemeConfig.foreground,
        cursor: termThemeConfig.cursor,
        black: termThemeConfig.black,
        red: termThemeConfig.red,
        green: termThemeConfig.green,
        yellow: termThemeConfig.yellow,
        blue: termThemeConfig.blue,
        magenta: termThemeConfig.magenta,
        cyan: termThemeConfig.cyan,
        white: termThemeConfig.white,
        brightBlack: termThemeConfig.brightBlack,
        brightRed: termThemeConfig.brightRed,
        brightGreen: termThemeConfig.brightGreen,
        brightYellow: termThemeConfig.brightYellow,
        brightBlue: termThemeConfig.brightBlue,
        brightMagenta: termThemeConfig.brightMagenta,
        brightCyan: termThemeConfig.brightCyan,
        brightWhite: termThemeConfig.brightWhite
      },
      cols: 80,
      rows: 24,
      scrollback: 1000,
      allowTransparency: false,
      allowProposedApi: true,
      // 禁用 BEL 声音和其他可能导致闪烁的配置
      disableStdin: false,
      windowsMode: false,
      convertEol: false,
      screenReaderMode: false,
      cursorStyle: 'block',
      cursorWidth: 1,
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5,
      scrollSensitivity: 1
    });

    // 添加插件
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // 添加 Unicode11 插件以支持中文和其他非英文字符
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    // 挂载到 DOM
    terminal.open(terminalRef.current);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    // 确保终端可以接收键盘输入
    try {
      if (terminal.element) {
        terminal.element.setAttribute('tabindex', '0');
      }
      terminal.focus();
      // 使用options对象而不是setOption方法（新版xterm.js API）
      (terminal as any).options.disableStdin = false;
              log.info('xterm.focus_setup', 'Terminal focus and stdin setup completed');
    } catch (e) {
      log.warn('xterm.focus_failed', 'Terminal focus setup failed', { error: 1001, details: e instanceof Error ? e.message : 'Unknown error' });
    }

    // 点击容器时聚焦终端
    if (terminalRef.current) {
      terminalRef.current.addEventListener('click', () => {
        try {
          terminal.focus();
          log.info('xterm.focused', 'Terminal focused on click');
        } catch (e) {
          log.warn('xterm.focus_click_failed', 'Failed to focus terminal on click', { error: 1002, details: e instanceof Error ? e.message : 'Unknown error' });
        }
      });
    }

    // 添加调试：监听键盘事件
    if (terminal.element) {
      terminal.element.addEventListener('keydown', (ev: any) => {
        log.debug('xterm.keydown', 'Keydown event', { key: ev.key, code: ev.code });
      });
    }

    // 设置终端销毁时的清理逻辑
    // 注意：xterm.js 的 dispose 方法是同步的，不返回 Promise
    // 我们在 cleanup 函数中处理清理，这里不需要额外设置

    // 检查终端viewport是否完全初始化
    const isTerminalFullyReady = (term: Terminal): boolean => {
      try {
        const viewport = (term as any)._core?.viewport;
        if (!viewport) return false;

        // 检查viewport的dimensions是否存在
        const renderService = (term as any)._core?.renderService;
        if (!renderService || !renderService.dimensions) return false;

        return true;
      } catch {
        return false;
      }
    };

    // 多次尝试 fit，确保终端完全准备好
    const tryFit = (attempts = 0) => {
      // 检查组件是否仍然挂载和终端是否被销毁
      if (!mountedRef.current || terminalDestroyedRef.current) {
        log.debug('xterm.unmounted', 'Component unmounted or terminal destroyed, stopping fit attempts');
        return;
      }

      // 最多尝试 15 次，但最后一次会强制 fit
      const isLastAttempt = attempts >= 14;

      try {
        if (terminalRef.current && fitAddon && terminal.element && terminal.element.parentElement) {
          // 检查终端内部状态是否完全准备好
          if (!isTerminalFullyReady(terminal) && !isLastAttempt) {
            setTimeout(() => tryFit(attempts + 1), 100);
            return;
          }

          // 检查终端容器是否可见和有尺寸
          const rect = terminalRef.current.getBoundingClientRect();
          const parentRect = terminal.element.parentElement.getBoundingClientRect();

          // 只有容器尺寸有效时才尝试 fit
          const hasContainerSize = rect.width > 0 && rect.height > 0 && parentRect.width > 0 && parentRect.height > 0;

          if (!hasContainerSize && !isLastAttempt) {
            // 容器还没准备好，延迟重试
            setTimeout(() => tryFit(attempts + 1), 100);
            return;
          }

          // 使用 requestAnimationFrame 确保在下一帧中调用 fit
          requestAnimationFrame(() => {
            // 再次检查组件是否仍然挂载和终端是否被销毁
            if (!mountedRef.current || terminalDestroyedRef.current) return;

            try {
              if (fitAddon && isTerminalFullyReady(terminal)) {
                fitAddon.fit();
                if (!isLastAttempt) {
                log.debug('xterm.fitted', 'Terminal fitted successfully');
                }
              }
            } catch (error) {
              // 如果不是最后一次尝试，继续重试
              if (!isLastAttempt && attempts < 14) {
                log.warn('fit.attempt_error', `Error fitting terminal (attempt ${attempts + 1}), retrying...`, { error: 1003, attempt: attempts + 1, details: error instanceof Error ? error.message : 'Unknown error' });
                setTimeout(() => tryFit(attempts + 1), 100);
              } else {
                log.warn('fit.error', 'Error fitting terminal', { error: 1004, details: error instanceof Error ? error.message : 'Unknown error' });
              }
            }
          });
          return;
        }
      } catch (error) {
        log.warn('fit.attempt_failed', `Failed to fit terminal (attempt ${attempts + 1})`, { error: 1005, attempt: attempts + 1, details: error instanceof Error ? error.message : 'Unknown error' });
      }

      // 如果不是最后一次尝试，继续重试
      if (!isLastAttempt) {
        setTimeout(() => tryFit(attempts + 1), 100);
      }
    };

    // 延迟启动，让 DOM 先渲染
    setTimeout(() => tryFit(), 100);

    // shell 准备就绪标志（局部变量，供闭包引用，避免 React state 闭包陷阱）
    let shellReadyFlag = false;

    // 连接已关闭标志，用于在终端中按回车触发重连
    let connectionClosedFlag = false;

    // 辅助函数：通知后端更新终端大小
    // 注意：使用 shellReadyFlag（局部变量）而非 isShellReady（React state），
    // 因为此闭包在 useEffect 初始化时创建，isShellReady 始终捕获初始值 false
    const notifyResizeToBackend = () => {
      if (shellReadyFlag && terminal) {
        const cols = terminal.cols;
        const rows = terminal.rows;
        log.debug('resize.notify', 'Notifying backend of terminal resize', { cols, rows, backend_type: backend.type, backend_id: backend.id });
        backend.resize(cols, rows);
      }
    };

    // 使用 ResizeObserver 直接监听容器大小变化
    let animationFrameId: number;
    let fitAddonReady = false;

    const resizeObserver = new ResizeObserver((entries) => {
      // 等待 fitAddon 准备好
      if (!fitAddon || !fitAddonReady) return;
      // 后台 Tab 跳过 fit，切回前台时会统一 refit
      if (!isActiveRef.current) return;

      // 使用 requestAnimationFrame 节流
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        if (!mountedRef.current || terminalDestroyedRef.current) return;

        try {
          const rect = terminalRef.current?.getBoundingClientRect();
          // ResizeObserver回调中不需要严格的terminalReady检查
          // 只要terminal已经open且容器有有效尺寸就可以fit
          if (rect && rect.width > 0 && rect.height > 0 && terminal && terminal.element) {
            fitAddon.fit();
            // 延迟一帧再通知后端，确保 terminal.cols/rows 已更新
            requestAnimationFrame(() => {
              requestAnimationFrame(notifyResizeToBackend);
            });
          }
        } catch (error) {
          // 忽略 fit 错误
        }
      });
    });

    // 等待 fitAddon 准备好后开始监听
    const checkFitAddonReady = setInterval(() => {
      if (fitAddon && terminalRef.current) {
        fitAddonReady = true;
        resizeObserver.observe(terminalRef.current);
        clearInterval(checkFitAddonReady);
      }
    }, 50);

    // 30秒后清理检查定时器
    setTimeout(() => clearInterval(checkFitAddonReady), 30000);

    // 处理窗口大小变化
    const handleResize = () => {
      // 后台 Tab 跳过 fit，切回前台时会统一 refit
      if (!isActiveRef.current) return;

      try {
        if (fitAddon && terminalRef.current && terminal.element) {
          // 检查终端是否完全准备好
          if (!isTerminalFullyReady(terminal)) {
            return; // 终端还没准备好，忽略 resize 事件
          }

          // 检查终端元素是否可见
          const rect = terminalRef.current.getBoundingClientRect();

          if (rect.width > 0 && rect.height > 0) {
            // 使用 requestAnimationFrame 确保在下一帧中调用 fit
            requestAnimationFrame(() => {
              // 再次检查组件是否仍然挂载和终端是否被销毁
              if (!mountedRef.current || terminalDestroyedRef.current) return;

              try {
                if (fitAddon && isTerminalFullyReady(terminal)) {
                  fitAddon.fit();
                  // 延迟一帧再通知后端，确保 terminal.cols/rows 已更新
                  requestAnimationFrame(() => {
                    requestAnimationFrame(notifyResizeToBackend);
                  });
                }
              } catch (error) {
                log.error('xterm.resize_raf_error', 'Error resizing terminal in RAF', { error: 2001, details: error instanceof Error ? error.message : 'Unknown error' });
              }
            });
          }
        }
      } catch (error) {
        log.error('xterm.resize_failed', 'Failed to resize terminal', { error: 2002, details: error instanceof Error ? error.message : 'Unknown error' });
      }
    };

    window.addEventListener('resize', handleResize);

    // 用户输入监听器 - 立即设置，但会检查shell是否准备好
    const inputDisposable = terminal.onData((data) => {
      log.debug('xterm.data_triggered', 'Terminal onData triggered', { data_length: data.length, shell_ready: shellReadyFlag, destroyed: terminalDestroyedRef.current });
      log.debug('xterm.data_content', 'Terminal onData content', { data: JSON.stringify(data), hex: data.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // 如果终端已销毁，忽略输入
      if (terminalDestroyedRef.current) {
        log.debug('xterm.destroyed', 'Terminal destroyed, ignoring input');
        return;
      }

      // 如果连接已关闭，按回车触发重连
      if (connectionClosedFlag && data === '\r' && onReconnect) {
        log.info('terminal.reconnect.triggered', 'User pressed Enter to reconnect', { backend_type: backend.type, backend_id: backend.id });
        connectionClosedFlag = false;
        terminal.writeln('\r\n\r\nReconnecting...');
        onReconnect();
        return;
      }

      if (!shellReadyFlag) {
        log.debug('xterm.not_ready', 'Shell not ready yet, ignoring input');
        return;
      }

      // 直接发送用户输入到终端后端，不做任何本地回显
      // 所有显示都依赖后端的回显
      // 根据终端配置翻译按键序列
      let translatedData = data;
      if (terminalConfig?.backspaceSeq === 'Control-H' && data === '\x7f') {
        translatedData = '\x08'; // Control-H
      }
      if (terminalConfig?.deleteSeq === 'ASCII' && data === '\x1b[3~') {
        translatedData = '\x7f'; // ASCII Delete
      }
      log.debug('shell.sending', 'Sending data to terminal backend', { backend_type: backend.type, backend_id: backend.id, data_length: translatedData.length });
      backend.write(translatedData);
    });

    //logger.debug('Input listener attached immediately after terminal open');

    // 初始化终端后端
    const initShell = async () => {
      try {
        log.info('shell.creating', 'Creating terminal via backend', {
          backend_type: backend.type, backend_id: backend.id,
        });
        await backend.connect({ cols: terminal.cols, rows: terminal.rows });
        setIsShellReady(true);
        shellReadyFlag = true;
        if (onReady) onReady();
        log.info('shell.created', 'Terminal backend connected', {
          backend_type: backend.type, backend_id: backend.id,
        });
      } catch (error) {
        log.error('shell.create_failed', 'Failed to create terminal', {
          error: 3004, details: error instanceof Error ? error.message : 'Unknown',
          backend_type: backend.type,
        });
        terminal.writeln(`\r\n❌ Failed to create terminal\r\n`);
        terminal.writeln(`Error: ${error instanceof Error ? error.message : String(error)}\r\n`);
      }
    };

    // 为无颜色的提示符添加颜色代码
    const addColorToPrompt = (data: string): string => {
      // 检测并为 root 用户提示符添加颜色
      // 匹配模式：root@hostname:path# 或 root@hostname:path$
      // 支持带前缀的提示符，如：(base) root@host:path# 或 (venv) root@host:path$
      // 颜色方案：用户名黄色(33)，机器名绿色(32)，路径蓝色(34)
      const rootPromptPattern = /(\([^)]+\)\s+)?(root)@([\w.-]+):(~[^\s#$]*|\/[^\s#$]*)([$#])\s/g;
      let colored = data.replace(rootPromptPattern, (match, prefix, user, host, path, symbol) => {
        const prefixStr = prefix || '';
        return `${prefixStr}\x1b[01;33m${user}\x1b[00m@\x1b[01;32m${host}\x1b[00m:\x1b[01;34m${path}\x1b[00m${symbol} `;
      });

      // 检测并为普通用户提示符添加颜色
      // 匹配模式：username@hostname:path$ 或 username@hostname:path#
      // 支持带前缀的提示符，如：(base) user@host:path$ 或 (venv) user@host:path$
      // 路径可以是：~ 或 ~/xxx 或 /xxx
      const userPromptPattern = /(\([^)]+\)\s+)?([a-z_][a-z0-9_-]*)@([\w.-]+):(~[^\s#$]*|\/[^\s#$]*)([$#])\s/g;
      colored = colored.replace(userPromptPattern, (match, prefix, user, host, path, symbol) => {
        // 跳过 root 用户（已经处理过）
        if (user === 'root') return match;
        // 检查这个提示符是否已经有颜色（通过检查用户名和主机名之间是否有颜色代码）
        if (/\x1b\[[0-9;]*m/.test(match)) return match;
        const prefixStr = prefix || '';
        return `${prefixStr}\x1b[01;32m${user}@${host}\x1b[00m:\x1b[01;34m${path}\x1b[00m${symbol} `;
      });

      return colored;
    };

    // 过滤函数：移除可能改变终端字体或显示模式的控制序列，但保留 ANSI 颜色代码
    // 注意：不过滤 OSC 序列和 BEL 字符，xterm.js 能正确处理它们。
    // 手动过滤 OSC 会因数据包拆分导致 xterm.js 卡在 OSC 解析状态，吞掉后续颜色数据。
    const filterFontChangingSequences = (data: string): string => {
      let filtered = data;

      // 1. 移除 SGR 字体选择序列：仅 ESC[10m ~ ESC[19m（字体族切换，极少使用）
      // 不移除 ESC[20m~ESC[29m，其中包含 vim 需要的属性重置序列
      filtered = filtered.replace(/\x1b\[1[0-9]m/g, '');

      // 2. 移除 DEC 行属性序列（双倍高度/宽度等）：ESC#3, ESC#4, ESC#5, ESC#6
      filtered = filtered.replace(/\x1b#[3-6]/g, '');

      // 3. 标准化字符集切换：移除不常用的字符集，只保留 ASCII(B) 和线条绘制(0)
      filtered = filtered.replace(/\x1b\([^B0]/g, '\x1b(B');
      filtered = filtered.replace(/\x1b\)[^B0]/g, '\x1b)B');
      filtered = filtered.replace(/\x1b\*[^B0]/g, '\x1b*B');
      filtered = filtered.replace(/\x1b\+[^B0]/g, '\x1b+B');

      // 4. 处理 Shift Out/In
      filtered = filtered.replace(/\x0e/g, '');
      filtered = filtered.replace(/\x0f/g, '\x1b(B');

      // 5. 过滤 \x1b[3J（ED 3 - Erase Scrollback Buffer）
      // Claude Code CLI 使用 Ink 渲染 TUI，当输出高度 >= 终端行数时，
      // Ink 发送 \x1b[2J\x1b[3J\x1b[H 做全屏重绘，其中 \x1b[3J 会清除
      // scrollback 缓冲区导致 viewport 跳到顶部再跳回，产生严重闪烁。
      // iTerm2 也是通过拦截此序列来避免该问题的。
      // 参考: https://github.com/anthropics/claude-code/issues/826
      filtered = filtered.replace(/\x1b\[3J/g, '');

      return filtered;
    };

    // [DEBUG] 监听后端 shell 调试信息（在 DevTools 中显示后端收到的数据包详情）
    let unsubscribeDebug: (() => void) | undefined;
    if (window.electron?.onShellDebug) {
      unsubscribeDebug = window.electron.onShellDebug((connId, debugInfo) => {
        if (connId === backend.id) {
          // 后端 shell 调试信息
        }
      });
    }

    // 监听来自后端的数据 - 显示接收到的数据，但过滤掉可能修改字体的序列
    // 必须在 initShell 之前注册，确保能接收到 MOTD 等初始数据
    backend.onData((data) => {
      if (!data || data.length === 0) return;
      log.debug('shell.data_received', 'Received shell data', { data_length: data.length, backend_type: backend.type, backend_id: backend.id });
      log.debug('shell.write_terminal', 'Writing data to terminal', { data_preview: JSON.stringify(data.substring(0, 200)), hex_dump: data.substring(0, 50).split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // 过滤掉可能修改字体的控制序列
      let filteredData = filterFontChangingSequences(data);

      // 跳过 export TERM 执行后服务器返回的新提示符（避免出现重复提示符）
      // 过滤函数：移除可能改变终端字体或显示模式的控制序列，但保留 ANSI 颜色代码
      const hasCursorMove = /\x1b\[\d+;\d+H/.test(filteredData);
      // 打印传给 terminal.write 前最终数据中的颜色序列数量
      const finalColorCount = (filteredData.match(/\x1b\[[0-9;]*m/g) || []).length;

      log.debug('shell.after_filtering', 'After filtering', { length: filteredData.length, data_preview: JSON.stringify(filteredData.substring(0, 200)), hex_dump: filteredData.substring(0, 50).split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // 检测提示符是否包含颜色代码
      // 提示符通常在数据的开头或者在换行符之后
      // 检测模式：查找 username@hostname:path$ 或 username@hostname:path# 格式的提示符
      // 支持带前缀的提示符，如：(base) user@host:path$ 或 (venv) user@host:path$
      // 注意：提示符前面可能有控制序列（如 \x1b[?2004h），所以使用更宽松的匹配
      const promptPattern = /(?:^|[\r\n]|\x1b\[[^\x1b]*[a-zA-Z])(?:\([^)]+\)\s+)?([a-z_][a-z0-9_-]*@[\w.-]+:[^\s#$]+[$#]\s)/gi;
      const promptMatches = filteredData.match(promptPattern);

      log.debug('prompt.detection', 'Prompt detection', { prompt_matches: promptMatches });

      // 检查提示符是否已经有颜色
      let needsColor = false;
      if (promptMatches && promptMatches.length > 0) {
        // 检查最后一个提示符是否有颜色代码
        const lastPrompt = promptMatches[promptMatches.length - 1];

        // 提取提示符本身（去除前面的所有控制序列和换行符）
        // 提示符格式：[控制序列][前缀]user@host:path$
        // 移除所有 ANSI 转义序列和换行符
        const promptOnly = lastPrompt.replace(/[\r\n]/g, '').replace(/\x1b\[[^\x1b]*?[a-zA-Z]/g, '').trim();

        // 只检查提示符本身是否有颜色代码，不检查前后的内容
        // 提示符内部应该有类似 \x1b[01;32m 的颜色代码
        needsColor = !/\x1b\[[0-9;]*m/.test(promptOnly);

        log.debug('prompt.last', 'Last prompt', { last_prompt: JSON.stringify(lastPrompt.trim()) });
        log.debug('prompt.only', 'Prompt only', { prompt_only: JSON.stringify(promptOnly) });
        log.debug('prompt.hex', 'Prompt only hex', { hex: promptOnly.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });
        log.debug('prompt.needs_color', 'Needs color', { needs_color: needsColor });
      }

      // 如果提示符没有颜色代码，尝试为提示符添加颜色
      if (needsColor) {
        const beforeAdd = filteredData;
        filteredData = addColorToPrompt(filteredData);
        const afterColorCount = (filteredData.match(/\x1b\[[0-9;]*m/g) || []).length;
      }

      // P1: 后台 Tab 缓冲数据，不直接写入终端
      if (!isActiveRef.current) {
        pendingDataRef.current.push(filteredData);
        return;
      }

      // P6: 前台 Tab 批量写入 - 通过 rAF 合并多次 write 为单次
      writeBufferRef.current.push(filteredData);
      if (writeRafRef.current === null) {
        writeRafRef.current = requestAnimationFrame(() => {
          writeRafRef.current = null;
          if (writeBufferRef.current.length > 0) {
            const batch = writeBufferRef.current.join('');
            writeBufferRef.current = [];
            terminal.write(batch);
          }
        });
      }
    });
    log.debug('shell.listener_attached', 'Shell data listener attached');

    // 监听终端后端关闭
    backend.onClose(() => {
      log.debug('shell.closed', 'Terminal backend closed', {
        backend_type: backend.type, backend_id: backend.id,
      });
      terminal.writeln('\r\n\r\n[Connection closed]');
      if (onReconnect) {
        terminal.writeln('\r\nPress Enter to reconnect...');
        connectionClosedFlag = true;
      }
      setIsShellReady(false);
      shellReadyFlag = false;
    });

    // 所有 listener 注册完毕后再启动 shell，确保 MOTD 等初始数据不会丢失
    initShell();

    // 清理
    return () => {
      log.debug('cleanup', 'Cleaning up XTerm terminal');
      mountedRef.current = false;
      terminalDestroyedRef.current = true;
      shellReadyFlag = false;  // 禁止继续处理输入

      // 恢复原始错误处理器
      window.onerror = originalOnErrorRef.current;

      // 停止 ResizeObserver
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // P6: 清理批量写入 rAF
      if (writeRafRef.current !== null) {
        cancelAnimationFrame(writeRafRef.current);
        writeRafRef.current = null;
      }

      // 停止所有监听器
      window.removeEventListener('resize', handleResize);
      if (inputDisposable) inputDisposable.dispose();
      if (unsubscribeDebug) unsubscribeDebug();
      backend.dispose();

      // 清理引用，防止后续异步操作
      if (xtermRef.current) {
        xtermRef.current = null;
      }
      if (fitAddonRef.current) {
        fitAddonRef.current = null;
      }

      // 延迟dispose，确保所有异步操作都已停止
      setTimeout(() => {
        try {
          // 使用 try-catch 来安全处理已经被销毁的情况
          if (terminal && typeof (terminal as any).disposed === 'undefined') {
            terminal.dispose();
          }
        } catch (error) {
          log.warn('dispose.error', 'Error disposing terminal', { error: 4001, details: error instanceof Error ? error.message : 'Unknown error' });
        }
      }, 100);
    };
  }, [backend]); // 只依赖 backend，移除 theme 依赖以避免主题切换导致终端重建

  // Handle terminal theme and font size changes
  useEffect(() => {
    if (!xtermRef.current) return;

    const termThemeConfig = TERMINAL_THEME_CONFIGS[terminalTheme] || TERMINAL_THEME_CONFIGS.classic;
    const fontSize = terminalFontSize || 12;

    try {
      xtermRef.current.options.fontSize = fontSize;
      xtermRef.current.options.theme = {
        background: termThemeConfig.background,
        foreground: termThemeConfig.foreground,
        cursor: termThemeConfig.cursor,
        black: termThemeConfig.black,
        red: termThemeConfig.red,
        green: termThemeConfig.green,
        yellow: termThemeConfig.yellow,
        blue: termThemeConfig.blue,
        magenta: termThemeConfig.magenta,
        cyan: termThemeConfig.cyan,
        white: termThemeConfig.white,
        brightBlack: termThemeConfig.brightBlack,
        brightRed: termThemeConfig.brightRed,
        brightGreen: termThemeConfig.brightGreen,
        brightYellow: termThemeConfig.brightYellow,
        brightBlue: termThemeConfig.brightBlue,
        brightMagenta: termThemeConfig.brightMagenta,
        brightCyan: termThemeConfig.brightCyan,
        brightWhite: termThemeConfig.brightWhite
      };
      log.debug('theme.updated', 'Terminal theme updated', { terminal_theme: terminalTheme, font_size: fontSize });
    } catch (error) {
      log.warn('theme.update_failed', 'Failed to update terminal theme', { error: 4002, details: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, [terminalTheme, terminalFontSize]);

  // 监听来自主进程的焦点事件（双击Ctrl切换到终端模式时触发）
  useEffect(() => {
    const handleFocusTerminal = (connId: string) => {
      if (connId === backend.id && xtermRef.current) {
        try {
          xtermRef.current.focus();
          log.debug('xterm.focus_event', 'Terminal focused via focus-terminal event');
        } catch (error) {
          log.warn('xterm.focus_event_failed', 'Failed to focus terminal via focus-terminal event', { error: 4005, details: error instanceof Error ? error.message : 'Unknown error' });
        }
      } else {
      }
    };

    // 使用 preload 暴露的 API 监听焦点事件
    if (window.electron?.onFocusTerminal) {
      const unsubscribe = window.electron.onFocusTerminal(handleFocusTerminal);
      return () => {
        unsubscribe();
      };
    } else {
    }
  }, [backend]);

  // 监听终端获得焦点事件（用户手动点击终端时触发）
  // 用于通知 CommandInputArea 更新 inputMode 状态
  // 使用 focusin 事件替代 rAF 轮询，消除每终端 60次/秒的 DOM 查询
  useEffect(() => {

    if (!xtermRef.current) return;

    const terminalElement = xtermRef.current.element;
    if (!terminalElement) return;

    const handleFocusIn = () => {
      if (window.electron?.sendTerminalFocusGained && backend.id) {
        window.electron.sendTerminalFocusGained(backend.id);
      }
      if (onTerminalFocusGained) {
        onTerminalFocusGained();
      }
    };

    terminalElement.addEventListener('focusin', handleFocusIn);

    return () => {
      terminalElement.removeEventListener('focusin', handleFocusIn);
    };
  }, [backend, onTerminalFocusGained]);

  // 当 shell 准备好后，调整大小
  useEffect(() => {
    if (isShellReady && fitAddonRef.current && xtermRef.current && terminalRef.current) {
      // 检查终端是否完全初始化的辅助函数
      const checkTerminalReady = (term: Terminal): boolean => {
        try {
          const viewport = (term as any)._core?.viewport;
          if (!viewport) return false;
          const renderService = (term as any)._core?.renderService;
          if (!renderService || !renderService.dimensions) return false;
          return true;
        } catch {
          return false;
        }
      };

      setTimeout(() => {
        try {
          const currentXterm = xtermRef.current;
          const currentElement = currentXterm?.element;
          if (fitAddonRef.current && terminalRef.current && currentElement) {
            // 检查终端是否完全准备好
            if (!checkTerminalReady(currentXterm)) {
              return;
            }

            // 检查终端元素是否可见
            const rect = terminalRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // 使用 requestAnimationFrame 确保在下一帧中调用 fit
              requestAnimationFrame(() => {
                // 再次检查组件是否仍然挂载
                if (!mountedRef.current) return;

                try {
                  const currentXterm = xtermRef.current;
                  if (fitAddonRef.current && currentXterm && checkTerminalReady(currentXterm)) {
                    fitAddonRef.current.fit();
                    // 延迟一帧再通知后端，确保 cols/rows 已更新
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        if (xtermRef.current) {
                          log.debug('resize.after_shell_ready', 'Notifying backend after shell ready', { cols: xtermRef.current.cols, rows: xtermRef.current.rows, backend_type: backend.type, backend_id: backend.id });
                          backend.resize(xtermRef.current.cols, xtermRef.current.rows);
                        }
                      });
                    });
                  }
                } catch (error) {
                  log.warn('fit.raf_error', 'Error fitting terminal after shell ready in RAF', { error: 4003, details: error instanceof Error ? error.message : 'Unknown error' });
                }
              });
            }
          }
        } catch (error) {
          log.warn('resize.shell_ready_failed', 'Failed to resize terminal after shell ready', { error: 4004, details: error instanceof Error ? error.message : 'Unknown error' });
        }
      }, 100);
    }
  }, [isShellReady, backend]);

  return (
    <div
      className="w-full min-h-0"
      style={{
        padding: '1px',
        overflow: 'hidden',
        flex: '1 1 0',
        position: 'relative',
        willChange: 'transform',
      }}
    >
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};
