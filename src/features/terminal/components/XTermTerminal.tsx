import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import 'xterm/css/xterm.css';
import { TerminalThemeType } from '@/utils/types';
import { logger, LOG_MODULE } from '@/base/logger/logger';
import type { ITerminalBackend } from '@/core/terminal/ITerminalBackend';

// Use module-level logger for performance optimization (create at module level to avoid passing parameters repeatedly)
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
  onTerminalFocusGained?: () => void; // Callback when terminal gains focus
  isActive?: boolean; // Whether it's the current active tab, background tabs buffer data
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

  // P1: Background Tab data buffering
  const isActiveRef = useRef(isActive);
  const pendingDataRef = useRef<string[]>([]);
  // P6: Foreground Tab batch write buffer
  const writeBufferRef = useRef<string[]>([]);
  const writeRafRef = useRef<number | null>(null);

  // Keep isActiveRef in sync
  useEffect(() => {
    const prev = isActiveRef.current;
    isActiveRef.current = isActive;
    if (prev !== isActive) {
      log.info('xterm.isActive_changed', 'isActiveRef updated', { from: prev, to: isActive });
    }
  }, [isActive]);

  // When isActive changes from false→true, flush buffered data to terminal, and refit (window may have been resized in background)
  useEffect(() => {
    if (!isActive) return;
    if (xtermRef.current && pendingDataRef.current.length > 0) {
      const buffered = pendingDataRef.current.join('');
      pendingDataRef.current = [];
      xtermRef.current.write(buffered);
    }
    // Refit when switching back to foreground, ensure size is correct (window may have been resized in background)
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

    // Reset mounted state (React strict mode causes component remount)
    mountedRef.current = true;
    terminalDestroyedRef.current = false;

    // Set global error handler to catch xterm errors
    originalOnErrorRef.current = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      if (message && typeof message === 'string' && message.includes('xterm') && message.includes('dimensions')) {
log.warn('xterm.dimensions_error', 'Caught xterm dimensions error, suppressing', { error: 1001 });
        return true; // Prevent error propagation
      }
      // Call original error handler
      if (originalOnErrorRef.current) {
        return originalOnErrorRef.current(message, source, lineno, colno, error);
      }
      return false;
    };

    // Get terminal theme config
    const termThemeConfig = TERMINAL_THEME_CONFIGS[terminalTheme] || TERMINAL_THEME_CONFIGS.classic;
    const fontSize = terminalFontSize || 12;

    // Create terminal instance
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
      // Disable BEL sound and other configs that may cause flicker
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

    // Add addons
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Add Unicode11 addon to support Chinese and other non-English characters
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    // Mount to DOM
    terminal.open(terminalRef.current);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    // Ensure terminal can receive keyboard input
    try {
      if (terminal.element) {
        terminal.element.setAttribute('tabindex', '0');
      }
      terminal.focus();
      // Use options object instead of setOption method (new xterm.js API)
      (terminal as any).options.disableStdin = false;
              log.info('xterm.focus_setup', 'Terminal focus and stdin setup completed');
    } catch (e) {
      log.warn('xterm.focus_failed', 'Terminal focus setup failed', { error: 1001, details: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Focus terminal when clicking container
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

    // Add debug: listen for keyboard events
    if (terminal.element) {
      terminal.element.addEventListener('keydown', (ev: any) => {
        log.debug('xterm.keydown', 'Keydown event', { key: ev.key, code: ev.code });
      });
    }

    // Set cleanup logic when terminal is destroyed
    // Note: xterm.js dispose method is synchronous, doesn't return Promise
    // We handle cleanup in cleanup function, no extra setup needed here

    // Check if terminal viewport is fully initialized
    const isTerminalFullyReady = (term: Terminal): boolean => {
      try {
        const viewport = (term as any)._core?.viewport;
        if (!viewport) return false;

        // Check if viewport dimensions exist
        const renderService = (term as any)._core?.renderService;
        if (!renderService || !renderService.dimensions) return false;

        return true;
      } catch {
        return false;
      }
    };

    // Try fit multiple times, ensure terminal is fully ready
    const tryFit = (attempts = 0) => {
      // Check if component is still mounted and terminal is not destroyed
      if (!mountedRef.current || terminalDestroyedRef.current) {
        log.debug('xterm.unmounted', 'Component unmounted or terminal destroyed, stopping fit attempts');
        return;
      }

      // Try at most 15 times, but last attempt will force fit
      const isLastAttempt = attempts >= 14;

      try {
        if (terminalRef.current && fitAddon && terminal.element && terminal.element.parentElement) {
          // Check if terminal internal state is fully ready
          if (!isTerminalFullyReady(terminal) && !isLastAttempt) {
            setTimeout(() => tryFit(attempts + 1), 100);
            return;
          }

          // Check if terminal container is visible and has dimensions
          const rect = terminalRef.current.getBoundingClientRect();
          const parentRect = terminal.element.parentElement.getBoundingClientRect();

          // Only try fit when container dimensions are valid
          const hasContainerSize = rect.width > 0 && rect.height > 0 && parentRect.width > 0 && parentRect.height > 0;

          if (!hasContainerSize && !isLastAttempt) {
            // Container not ready yet, retry with delay
            setTimeout(() => tryFit(attempts + 1), 100);
            return;
          }

          // Use requestAnimationFrame to ensure fit is called in next frame
          requestAnimationFrame(() => {
            // Check again if component is still mounted and terminal is not destroyed
            if (!mountedRef.current || terminalDestroyedRef.current) return;

            try {
              if (fitAddon && isTerminalFullyReady(terminal)) {
                fitAddon.fit();
                if (!isLastAttempt) {
                log.debug('xterm.fitted', 'Terminal fitted successfully');
                }
              }
            } catch (error) {
              // If not last attempt, continue retrying
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

      // If not last attempt, continue retrying
      if (!isLastAttempt) {
        setTimeout(() => tryFit(attempts + 1), 100);
      }
    };

    // Delay start, let DOM render first
    setTimeout(() => tryFit(), 100);

    // Shell ready flag (local variable, referenced by closure, avoid React state closure trap)
    let shellReadyFlag = false;

    // Connection closed flag, used to trigger reconnect on Enter key in terminal
    let connectionClosedFlag = false;

    // Sleep recovery: lazy health check flag and timer
    let needsHealthCheck = false;
    let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

    // Listen for system resume (sleep/lock screen recovery)
    let unsubSystemResumed: (() => void) | undefined;
    if (window.electron?.onSystemResumed) {
      unsubSystemResumed = window.electron.onSystemResumed(() => {
        if (shellReadyFlag && !connectionClosedFlag) {
          log.info('terminal.system_resumed', 'System resumed, scheduling health check on next input', {
            backend_type: backend.type, backend_id: backend.id,
          });
          needsHealthCheck = true;
        }
      });
    }

    // Helper function: notify backend to update terminal size
    // Note: use shellReadyFlag (local variable) instead of isShellReady (React state),
    // because this closure is created during useEffect initialization, isShellReady always captures initial value false
    const notifyResizeToBackend = () => {
      if (shellReadyFlag && terminal) {
        const cols = terminal.cols;
        const rows = terminal.rows;
        log.debug('resize.notify', 'Notifying backend of terminal resize', { cols, rows, backend_type: backend.type, backend_id: backend.id });
        backend.resize(cols, rows);
      }
    };

    // Use ResizeObserver to directly listen for container size changes
    let animationFrameId: number;
    let fitAddonReady = false;

    const resizeObserver = new ResizeObserver((entries) => {
      // Wait for fitAddon to be ready
      if (!fitAddon || !fitAddonReady) return;
      // Skip fit for background tabs, will refit uniformly when switching back to foreground
      if (!isActiveRef.current) return;

      // Use requestAnimationFrame for throttling
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        if (!mountedRef.current || terminalDestroyedRef.current) return;

        try {
          const rect = terminalRef.current?.getBoundingClientRect();
          // No strict terminalReady check needed in ResizeObserver callback
          // Just fit if terminal is open and container has valid dimensions
          if (rect && rect.width > 0 && rect.height > 0 && terminal && terminal.element) {
            fitAddon.fit();
            // Notify backend after one frame delay, ensure terminal.cols/rows are updated
            requestAnimationFrame(() => {
              requestAnimationFrame(notifyResizeToBackend);
            });
          }
        } catch (error) {
          // Ignore fit errors
        }
      });
    });

    // Start listening after fitAddon is ready
    const checkFitAddonReady = setInterval(() => {
      if (fitAddon && terminalRef.current) {
        fitAddonReady = true;
        resizeObserver.observe(terminalRef.current);
        clearInterval(checkFitAddonReady);
      }
    }, 50);

    // Clear check timer after 30 seconds
    setTimeout(() => clearInterval(checkFitAddonReady), 30000);

    // Handle window resize
    const handleResize = () => {
      // Skip fit for background tabs, will refit uniformly when switching back to foreground
      if (!isActiveRef.current) return;

      try {
        if (fitAddon && terminalRef.current && terminal.element) {
          // Check if terminal is fully ready
          if (!isTerminalFullyReady(terminal)) {
            return; // Terminal not ready yet, ignore resize event
          }

          // Check if terminal element is visible
          const rect = terminalRef.current.getBoundingClientRect();

          if (rect.width > 0 && rect.height > 0) {
            // Use requestAnimationFrame to ensure fit is called in next frame
            requestAnimationFrame(() => {
              // Check again if component is still mounted and terminal is not destroyed
              if (!mountedRef.current || terminalDestroyedRef.current) return;

              try {
                if (fitAddon && isTerminalFullyReady(terminal)) {
                  fitAddon.fit();
                  // Notify backend after one frame delay, ensure terminal.cols/rows are updated
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

    // User input listener - set immediately, but will check if shell is ready
    const inputDisposable = terminal.onData((data) => {
      log.debug('xterm.data_triggered', 'Terminal onData triggered', { data_length: data.length, shell_ready: shellReadyFlag, destroyed: terminalDestroyedRef.current });
      log.debug('xterm.data_content', 'Terminal onData content', { data: JSON.stringify(data), hex: data.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // If terminal is destroyed, ignore input
      if (terminalDestroyedRef.current) {
        log.debug('xterm.destroyed', 'Terminal destroyed, ignoring input');
        return;
      }

      // If connection is closed, press Enter to trigger reconnect
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

      // Lazy health check after system resume: start timeout on first input
      if (needsHealthCheck) {
        needsHealthCheck = false;
        log.info('terminal.health_check.start', 'Starting health check on first input after resume', {
          backend_type: backend.type, backend_id: backend.id,
        });

        healthCheckTimer = setTimeout(async () => {
          healthCheckTimer = null;
          log.warn('terminal.health_check.timeout', 'No response after input, terminal may be unresponsive', {
            backend_type: backend.type, backend_id: backend.id,
          });

          if (backend.type === 'ssh') {
            // SSH: check connection state via IPC
            const connected = await window.electron?.sshIsConnected(backend.id);
            if (!connected) {
              terminal.writeln('\r\n\r\n\x1b[33m[Connection lost after sleep]\x1b[0m');
              if (onReconnect) {
                terminal.writeln('\r\nPress Enter to reconnect...');
                connectionClosedFlag = true;
              }
              shellReadyFlag = false;
            }
          } else if (backend.type === 'local') {
            // Local PTY: health check via DSR probe
            const healthy = await window.electron?.localTerminal?.healthCheck(backend.id);
            log.info('terminal.health_check.result', 'Local PTY health check result', { backend_id: backend.id, healthy });
            if (!healthy && terminal && !terminalDestroyedRef.current) {
              terminal.writeln('\r\n\r\n\x1b[33m[Terminal unresponsive after sleep, rebuilding...]\x1b[0m');
              const cols = terminal.cols;
              const rows = terminal.rows;
              const result = await window.electron?.localTerminal?.rebuild(backend.id, cols, rows);
              if (result?.newPtyId && backend.updateId) {
                await backend.updateId(result.newPtyId);
                terminal.writeln('\x1b[32m[Terminal recovered]\x1b[0m\r\n');
                shellReadyFlag = true;
              }
            }
          }
        }, 3000);
      }

      // Directly send user input to terminal backend, no local echo
      // All display depends on backend echo
      // Translate key sequences based on terminal config
      let translatedData = data;
      if (terminalConfig?.backspaceSeq === 'Control-H' && data === '\x7f') {
        translatedData = '\x08'; // Control-H
      }
      if (terminalConfig?.deleteSeq === 'ASCII' && data === '\x1b[3~') {
        translatedData = '\x7f'; // ASCII Delete
      }
      log.info('shell.sending', 'Sending data to terminal backend', { backend_type: backend.type, backend_id: backend.id, data_length: translatedData.length, is_active: isActiveRef.current });
      backend.write(translatedData);
    });

    //logger.debug('Input listener attached immediately after terminal open');

    // Initialize terminal backend
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

    // Add color to uncolored prompts
    const addColorToPrompt = (data: string): string => {
      // Detect and add color to root user prompt
      // Match patterns: root@hostname:path# or root@hostname:path$
      // Support prefixed prompts, e.g.: (base) root@host:path# or (venv) root@host:path$
      // Color scheme: username yellow(33), hostname green(32), path blue(34)
      const rootPromptPattern = /(\([^)]+\)\s+)?(root)@([\w.-]+):(~[^\s#$]*|\/[^\s#$]*)([$#])\s/g;
      let colored = data.replace(rootPromptPattern, (match, prefix, user, host, path, symbol) => {
        const prefixStr = prefix || '';
        return `${prefixStr}\x1b[01;33m${user}\x1b[00m@\x1b[01;32m${host}\x1b[00m:\x1b[01;34m${path}\x1b[00m${symbol} `;
      });

      // Detect and add color to normal user prompts
      // Match patterns: username@hostname:path$ or username@hostname:path#
      // Support prefixed prompts, e.g.: (base) user@host:path$ or (venv) user@host:path$
      // Path can be: ~ or ~/xxx or /xxx
      const userPromptPattern = /(\([^)]+\)\s+)?([a-z_][a-z0-9_-]*)@([\w.-]+):(~[^\s#$]*|\/[^\s#$]*)([$#])\s/g;
      colored = colored.replace(userPromptPattern, (match, prefix, user, host, path, symbol) => {
        // Skip root users (already processed)
        if (user === 'root') return match;
        // Check if this prompt already has color (by checking if there are color codes between username and hostname)
        if (/\x1b\[[0-9;]*m/.test(match)) return match;
        const prefixStr = prefix || '';
        return `${prefixStr}\x1b[01;32m${user}@${host}\x1b[00m:\x1b[01;34m${path}\x1b[00m${symbol} `;
      });

      return colored;
    };

    // Filter function: remove sequences that may change terminal font or display mode, but keep ANSI color codes
    // Note: don't filter OSC sequences and BEL characters, xterm.js can handle them correctly.
    // Manually filtering OSC will cause xterm.js to get stuck in OSC parsing state due to packet splitting, swallowing subsequent color data.
    const filterFontChangingSequences = (data: string): string => {
      let filtered = data;

      // 1. Remove SGR font selection sequences: only ESC[10m ~ ESC[19m (font family switching, rarely used)
      // Don't remove ESC[20m~ESC[29m, which includes sequences needed by vim for attribute reset
      filtered = filtered.replace(/\x1b\[1[0-9]m/g, '');

      // 2. Remove DEC line attribute sequences (double height/width, etc.): ESC#3, ESC#4, ESC#5, ESC#6
      filtered = filtered.replace(/\x1b#[3-6]/g, '');

      // 3. Normalize character set switching: remove uncommon character sets, only keep ASCII(B) and line drawing(0)
      filtered = filtered.replace(/\x1b\([^B0]/g, '\x1b(B');
      filtered = filtered.replace(/\x1b\)[^B0]/g, '\x1b)B');
      filtered = filtered.replace(/\x1b\*[^B0]/g, '\x1b*B');
      filtered = filtered.replace(/\x1b\+[^B0]/g, '\x1b+B');

      // 4. Handle Shift Out/In
      filtered = filtered.replace(/\x0e/g, '');
      filtered = filtered.replace(/\x0f/g, '\x1b(B');

      // 5. Filter \x1b[3J (ED 3 - Erase Scrollback Buffer)
      // Claude Code CLI uses Ink to render TUI, when output height >= terminal lines,
      // Ink sends \x1b[2J\x1b[3J\x1b[H for full screen redraw, where \x1b[3J clears
      // scrollback buffer causing viewport to jump to top then back, resulting in severe flicker.
      // iTerm2 also intercepts this sequence to avoid this issue.
      // Reference: https://github.com/anthropics/claude-code/issues/826
      filtered = filtered.replace(/\x1b\[3J/g, '');

      return filtered;
    };

    // [DEBUG] Listen for backend shell debug info (show backend received packet details in DevTools)
    let unsubscribeDebug: (() => void) | undefined;
    if (window.electron?.onShellDebug) {
      unsubscribeDebug = window.electron.onShellDebug((connId, debugInfo) => {
        if (connId === backend.id) {
          // Backend shell debug info
        }
      });
    }

    // Listen for data from backend - display received data, but filter out sequences that may modify font
    // Must register before initShell, ensure to receive MOTD and other initial data
    backend.onData((data) => {
      if (!data || data.length === 0) return;

      // Cancel health check timer: backend is responding, terminal is alive
      if (healthCheckTimer) {
        clearTimeout(healthCheckTimer);
        healthCheckTimer = null;
        log.info('terminal.health_check.cancelled', 'Health check cancelled, backend responded', { backend_type: backend.type, backend_id: backend.id });
      }

      log.info('shell.data_received', 'Received shell data', { data_length: data.length, backend_type: backend.type, backend_id: backend.id, is_active: isActiveRef.current });
      log.debug('shell.write_terminal', 'Writing data to terminal', { data_preview: JSON.stringify(data.substring(0, 200)), hex_dump: data.substring(0, 50).split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // Filter out sequences that may modify font
      let filteredData = filterFontChangingSequences(data);

      // Skip new prompt returned after export TERM execution (avoid duplicate prompts)
      // Filter function: remove sequences that may change terminal font or display mode, but keep ANSI color codes
      const hasCursorMove = /\x1b\[\d+;\d+H/.test(filteredData);
      // Print color sequence count in final data before passing to terminal.write
      const finalColorCount = (filteredData.match(/\x1b\[[0-9;]*m/g) || []).length;

      log.debug('shell.after_filtering', 'After filtering', { length: filteredData.length, data_preview: JSON.stringify(filteredData.substring(0, 200)), hex_dump: filteredData.substring(0, 50).split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });

      // Detect if prompt contains color codes
      // Prompt is usually at the beginning of data or after newline
      // Detection patterns: find prompts in format username@hostname:path$ or username@hostname:path#
      // Support prefixed prompts, e.g.: (base) user@host:path$ or (venv) user@host:path$
      // Note: prompts may have control sequences before them (e.g. \x1b[?2004h), so use looser matching
      const promptPattern = /(?:^|[\r\n]|\x1b\[[^\x1b]*[a-zA-Z])(?:\([^)]+\)\s+)?([a-z_][a-z0-9_-]*@[\w.-]+:[^\s#$]+[$#]\s)/gi;
      const promptMatches = filteredData.match(promptPattern);

      log.debug('prompt.detection', 'Prompt detection', { prompt_matches: promptMatches });

      // Check if prompt already has color
      let needsColor = false;
      if (promptMatches && promptMatches.length > 0) {
        // Check if last prompt has color codes
        const lastPrompt = promptMatches[promptMatches.length - 1];

        // Extract prompt itself (remove all preceding control sequences and newlines)
        // Prompt format: [control sequences][prefix]user@host:path$
        // Remove all ANSI escape sequences and newlines
        const promptOnly = lastPrompt.replace(/[\r\n]/g, '').replace(/\x1b\[[^\x1b]*?[a-zA-Z]/g, '').trim();

        // Only check if prompt itself has color codes, not surrounding content
        // Prompt should have color codes like \x1b[01;32m inside
        needsColor = !/\x1b\[[0-9;]*m/.test(promptOnly);

        log.debug('prompt.last', 'Last prompt', { last_prompt: JSON.stringify(lastPrompt.trim()) });
        log.debug('prompt.only', 'Prompt only', { prompt_only: JSON.stringify(promptOnly) });
        log.debug('prompt.hex', 'Prompt only hex', { hex: promptOnly.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') });
        log.debug('prompt.needs_color', 'Needs color', { needs_color: needsColor });
      }

      // If prompt doesn't have color codes, try to add color to prompt
      if (needsColor) {
        const beforeAdd = filteredData;
        filteredData = addColorToPrompt(filteredData);
        const afterColorCount = (filteredData.match(/\x1b\[[0-9;]*m/g) || []).length;
      }

      // P1: Background Tab buffer data, don't write to terminal directly
      if (!isActiveRef.current) {
        log.info('shell.data_buffered', 'Data buffered (background tab)', { data_length: filteredData.length, backend_type: backend.type, backend_id: backend.id, buffer_size: pendingDataRef.current.length });
        pendingDataRef.current.push(filteredData);
        return;
      }

      // P6: Foreground Tab batch write - merge multiple writes into single via rAF
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

    // Listen for terminal backend close
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

    // Start shell after all listeners are registered, ensure MOTD and other initial data are not lost
    initShell();

    // Cleanup
    return () => {
      log.debug('cleanup', 'Cleaning up XTerm terminal');
      mountedRef.current = false;
      terminalDestroyedRef.current = true;
      shellReadyFlag = false;  // Disable further input processing

      // Restore original error handler
      window.onerror = originalOnErrorRef.current;

      // Stop ResizeObserver
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // P6: Cleanup batch write rAF
      if (writeRafRef.current !== null) {
        cancelAnimationFrame(writeRafRef.current);
        writeRafRef.current = null;
      }

      // Stop all listeners
      window.removeEventListener('resize', handleResize);
      if (inputDisposable) inputDisposable.dispose();
      if (unsubscribeDebug) unsubscribeDebug();
      if (unsubSystemResumed) unsubSystemResumed();
      if (healthCheckTimer) clearTimeout(healthCheckTimer);
      backend.dispose();

      // Clear references, prevent subsequent async operations
      if (xtermRef.current) {
        xtermRef.current = null;
      }
      if (fitAddonRef.current) {
        fitAddonRef.current = null;
      }

      // Delay dispose, ensure all async operations have stopped
      setTimeout(() => {
        try {
          // Use try-catch to safely handle already disposed case
          if (terminal && typeof (terminal as any).disposed === 'undefined') {
            terminal.dispose();
          }
        } catch (error) {
          log.warn('dispose.error', 'Error disposing terminal', { error: 4001, details: error instanceof Error ? error.message : 'Unknown error' });
        }
      }, 100);
    };
  }, [backend]); // Only depend on backend, remove theme dependency to avoid terminal rebuild on theme switch

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

  // Listen for focus events from main process (triggered when double-click Ctrl to switch to terminal mode)
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

    // Use API exposed by preload to listen for focus events
    if (window.electron?.onFocusTerminal) {
      const unsubscribe = window.electron.onFocusTerminal(handleFocusTerminal);
      return () => {
        unsubscribe();
      };
    } else {
    }
  }, [backend]);

  // Listen for terminal focus gained event (triggered when user manually clicks terminal)
  // Used to notify CommandInputArea to update inputMode state
  // Use focusin event instead of rAF polling to eliminate 60 times/sec DOM queries per terminal
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

  // After shell is ready, adjust size
  useEffect(() => {
    if (isShellReady && fitAddonRef.current && xtermRef.current && terminalRef.current) {
      // Helper function to check if terminal is fully initialized
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
            // Check if terminal is fully ready
            if (!checkTerminalReady(currentXterm)) {
              return;
            }

            // Check if terminal element is visible
            const rect = terminalRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Use requestAnimationFrame to ensure fit is called in next frame
              requestAnimationFrame(() => {
                // Check again if component is still mounted
                if (!mountedRef.current) return;

                try {
                  const currentXterm = xtermRef.current;
                  if (fitAddonRef.current && currentXterm && checkTerminalReady(currentXterm)) {
                    fitAddonRef.current.fit();
                    // Notify backend after one frame delay, ensure cols/rows are updated
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
