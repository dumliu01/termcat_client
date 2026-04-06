import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Zap, History, Search, Eraser, Command, Trash2, X, RefreshCw, File, Folder } from 'lucide-react';
import { logger, LOG_MODULE } from '@/base/logger/logger';

// Completion candidate type
interface CompletionItem {
  text: string;        // Full completion text
  type: 'history' | 'file' | 'directory';  // Type: history command / file / directory
  displayText: string; // Display text (may be partial relative to input)
}

interface CommandInputAreaProps {
  inputValue: string;
  onInputChange: (val: string) => void;
  onExecute: (cmd: string) => void;
  onInterrupt?: () => void; // Added: callback for interrupt command
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  commandHistory: string[];
  setCommandHistory: (history: string[]) => void;
  isExecutingCommand: boolean;
  isConnected: boolean;
  connectionError: string | null;
  onReconnect: () => void;
  t: any;
  theme: string;
  connectionId?: string; // SSH connection ID, used to get current directory file list
  connectionType?: 'local' | 'ssh'; // Connection type
  initialDirectory?: string; // Initial directory (home directory)
  onInputFocusGained?: () => void;
  defaultFocusTarget?: 'input' | 'terminal';
}

export interface CommandInputAreaRef {
  focus: () => void;
  focusWithSelection: (start: number, end: number) => void;
  setInputMode: (mode: 'terminal' | 'input') => void;
  getInputMode: () => 'terminal' | 'input';
}

export const CommandInputArea = forwardRef<CommandInputAreaRef, CommandInputAreaProps>(({
  inputValue,
  onInputChange,
  onExecute,
  onInterrupt,
  showHistory,
  setShowHistory,
  commandHistory,
  setCommandHistory,
  isExecutingCommand,
  isConnected,
  connectionError,
  onReconnect,
  t,
  theme,
  connectionId,
  connectionType = 'ssh',
  initialDirectory = '',
  onInputFocusGained,
  defaultFocusTarget = 'terminal',
}, ref) => {
  const isLocal = connectionType === 'local';
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 means not in history browsing mode

  // Fuzzy match state
  const [isAutoCompleteMode, setIsAutoCompleteMode] = useState(false);
  const [autoCompleteText, setAutoCompleteText] = useState(''); // Completion text part
  const [matchedCommands, setMatchedCommands] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);

  // Unified completion candidate list state
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showCompletionList, setShowCompletionList] = useState(false);
  const completionListRef = useRef<HTMLDivElement>(null);

  // File auto-completion state
  const [isFileCompletionMode, setIsFileCompletionMode] = useState(false);
  const [fileCompletionMatches, setFileCompletionMatches] = useState<string[]>([]);
  const [fileCompletionIndex, setFileCompletionIndex] = useState(-1);
  const [fileCompletionHint, setFileCompletionHint] = useState(''); // Gray hint text
  const [currentDirectory, setCurrentDirectory] = useState<string>(initialDirectory);
  const [fileListCache, setFileListCache] = useState<string[]>([]);

  // History panel selection state
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  // History search auto-completion state
  const [historyAutoCompleteText, setHistoryAutoCompleteText] = useState('');

  // Input mode state: 'terminal' = terminal direct input mode, 'input' = input field input mode
  const [inputMode, setInputMode] = useState<'terminal' | 'input'>(defaultFocusTarget);
  // Double Ctrl press detection - use ref to avoid closure issues
  const lastCtrlPressTimeRef = useRef<number>(0);
  const [ctrlKeyHeld, setCtrlKeyHeld] = useState(false);
  // Transition animation state
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);

  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellDataBufferRef = useRef<string>(''); // Buffer for parsing shell data

  // When initialDirectory changes, sync to currentDirectory
  useEffect(() => {
    //console.log('[CommandInputArea] initialDirectory changed:', initialDirectory, 'currentDirectory:', currentDirectory);
    if (initialDirectory && !currentDirectory) {
      //console.log('[CommandInputArea] Setting currentDirectory to:', initialDirectory);
      setCurrentDirectory(initialDirectory);
    }
  }, [initialDirectory, currentDirectory]);

  // Actively get current working directory
  useEffect(() => {
    // If already has current directory or no connection ID, no need to fetch
    if (currentDirectory || !connectionId || !window.electron) return;

    const fetchCurrentDirectory = async () => {
      try {
        const pwd = await window.electron.getSessionCwd(connectionId, connectionType);
        if (pwd) {
          setCurrentDirectory(pwd);
          if (!isLocal) {
            window.electron.sshUpdateCwd(connectionId, pwd).catch(() => {});
          }
        }
      } catch (error) {
        // ignore
      }
    };

    fetchCurrentDirectory();
  }, [connectionId, currentDirectory, connectionType, isLocal]);

  // Listen for shell data stream, parse current directory from prompt
  useEffect(() => {
    if (!connectionId || !window.electron) return;

    let lastPromptTime = 0;
    const minInterval = 300; // Minimum interval 300ms to avoid frequent calls

    const unsubscribe = window.electron.onShellData((connId, data) => {
      if (connId !== connectionId) return;

      // Add data to buffer
      shellDataBufferRef.current += data;

      const buffer = shellDataBufferRef.current;

      // Detect command prompt and try to parse path from it
      // Common prompt formats:
      // 1. user@host:/path/to/dir$ or user@host:/path/to/dir#
      // 2. user@host:~$ (home directory)
      // 3. /path/to/dir $ or /path/to/dir #
      // 4. [user@host /path/to/dir]$ or [user@host /path/to/dir]#

      // Extract last line (may be prompt)
      const lines = buffer.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      const secondLastLine = lines.length > 1 ? lines[lines.length - 2] : '';

      // Detect if it's a prompt (contains $ or #)
      const hasPrompt = /[$#]\s*$/.test(lastLine) || /[$#]\s*$/.test(secondLastLine);

      //console.log('[CommandInputArea] Shell data, buffer length:', buffer.length, 'hasPrompt:', hasPrompt, 'lastLine:', lastLine.slice(0, 100));

      if (hasPrompt) {
        const now = Date.now();
        // Rate limit: avoid frequent calls
        if (now - lastPromptTime < minInterval) {
          //console.log('[CommandInputArea] Skipping due to rate limit');
          return;
        }
        lastPromptTime = now;

logger.debug(LOG_MODULE.TERMINAL, 'terminal.prompt.detected', 'Prompt detected', { lastLine: JSON.stringify(lastLine.slice(-100)), secondLastLine: JSON.stringify(secondLastLine.slice(-100)) });

        //console.log('[CommandInputArea] Prompt detected, parsing directory from prompt...');

        // Helper function: remove ANSI escape codes (color codes) and terminal control sequences
        const removeAnsiCodes = (str: string): string => {
          // Remove all ANSI escape sequences and terminal control sequences
          return str
            // 1. Remove OSC (Operating System Command) sequences - terminal titles, etc.
            // Format: ESC ] ... BEL or ESC ] ... ESC \
            // Note: sometimes there is no clear terminator, need to match to next ESC or line end
            .replace(/\x1b\]0;[^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
            .replace(/\x1b\][0-9]*;[^\x07\x1b]*/g, '') // Looser OSC matching
            // 2. Remove terminal mode settings (e.g. \x1b[?2004h bracketed paste mode)
            .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
            // 3. Remove standard ANSI color/style escape codes
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/\033\[[0-9;]*m/g, '')
            // 4. Remove possibly partially decoded formats
            .replace(/\[[\d;]+m/g, '')
            .replace(/\[[0-9;]*m/g, '')
            // 5. Remove carriage return
            .replace(/\r/g, '');
        };

        // Clean last line and second last line, remove color codes
        const cleanLastLine = removeAnsiCodes(lastLine);
        const cleanSecondLastLine = removeAnsiCodes(secondLastLine);

        //console.log('[CommandInputArea] Cleaned lastLine:', JSON.stringify(cleanLastLine.slice(-100)));
       // console.log('[CommandInputArea] Cleaned secondLastLine:', JSON.stringify(cleanSecondLastLine.slice(-100)));

        //console.log('[CommandInputArea] Cleaned lastLine:', cleanLastLine.slice(0, 100));

        // Parse path from prompt
        let detectedPath: string | null = null;
        let detectedUsername: string | null = null; // Username extracted from prompt

        // Pattern 1: user@host:/path$ or user@host:~/path$ or user@host:~$
        // Fix: use non-greedy matching and more precise path extraction
        // Username: [a-z_][a-z0-9_-]* (non-greedy, stops at @)
        // Hostname: [\w.-]+ (matches hostname)
        // Path: everything after colon to before $ or #
        const pattern1 = /([a-z_][a-z0-9_-]*)@[\w.-]+:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)[$#]/i;
        const match1 = cleanLastLine.match(pattern1) || cleanSecondLastLine.match(pattern1);
        if (match1) {
          detectedUsername = match1[1]; // Get username directly from regex capture group
          detectedPath = match1[2]; // Get path directly from regex capture group
        //('[CommandInputArea] Pattern1 matched:', detectedPath, 'username:', detectedUsername);
        }

        // Pattern 2: [user@host /path]$ or [user@host ~]$
        if (!detectedPath) {
          const pattern2 = /\[[\w.@_-]+\s+(\/[^\]]*|~)\][$#]/;
          const match2 = cleanLastLine.match(pattern2) || cleanSecondLastLine.match(pattern2);
          if (match2 && match2[1]) {
            if (match2[1] === '~') {
              detectedPath = '~';
            } else {
              detectedPath = match2[1];
            }
            // Extract username from prompt (using safer method)
            const atIndex1 = cleanLastLine.lastIndexOf('@');
            const atIndex2 = cleanSecondLastLine.lastIndexOf('@');
            if (atIndex1 > 0) {
              const beforeAt1 = cleanLastLine.slice(0, atIndex1);
              const usernameMatch = beforeAt1.match(/[\s\[]*([a-z_][a-z0-9_-]*)$/i);
              if (usernameMatch && usernameMatch[1]) {
                detectedUsername = usernameMatch[1];
              }
            } else if (atIndex2 > 0) {
              const beforeAt2 = cleanSecondLastLine.slice(0, atIndex2);
              const usernameMatch = beforeAt2.match(/[\s\[]*([a-z_][a-z0-9_-]*)$/i);
              if (usernameMatch && usernameMatch[1]) {
                detectedUsername = usernameMatch[1];
              }
            }
           // console.log('[CommandInputArea] Pattern2 matched:', detectedPath);
          }
        }

        // Pattern 3: Plain path format /path $ or /path #
        if (!detectedPath) {
          const pattern3 = /(\/[^\s$#]*)[\s]*[$#]/;
          const match3 = cleanLastLine.match(pattern3) || cleanSecondLastLine.match(pattern3);
          if (match3 && match3[1]) {
            detectedPath = match3[1];
          //  console.log('[CommandInputArea] Pattern3 matched:', detectedPath);
          }
        }

        // Clean parsed path, remove any remaining ANSI codes
        if (detectedPath) {
          detectedPath = removeAnsiCodes(detectedPath);
        }

        // Handle ~ symbol: infer user's home directory
        if (detectedPath === '~' || (detectedPath && detectedPath.startsWith('~/'))) {
          //console.log('[CommandInputArea] Detected ~ path:', detectedPath, 'initialDirectory:', initialDirectory);

          let homeDir: string | null = null;

          // Strategy 1: Prioritize initialDirectory (most reliable)
          // initialDirectory is usually /home/dum or /root
          if (initialDirectory && initialDirectory.startsWith('/home/')) {
            // Extract /home/dum from /home/dum/dum_dev
            const parts = initialDirectory.split('/').filter(Boolean);
            if (parts.length >= 2) {
              homeDir = '/' + parts[0] + '/' + parts[1];
            } else {
              homeDir = initialDirectory;
            }
            //console.log('[CommandInputArea] Using initialDirectory as home:', homeDir);
          } else if (initialDirectory && initialDirectory === '/root') {
            homeDir = '/root';
            //console.log('[CommandInputArea] Using initialDirectory as root home:', homeDir);
          }

          // Strategy 2: If initialDirectory is unavailable or doesn't match detectedUsername, prioritize currentDirectory inference
          if (!homeDir && currentDirectory && currentDirectory.startsWith('/home/')) {
            const parts = currentDirectory.split('/').filter(Boolean);
            if (parts.length >= 2) {
              homeDir = '/' + parts[0] + '/' + parts[1];
            }
            //console.log('[CommandInputArea] Inferred home from currentDirectory:', homeDir);
          }

          // Strategy 3: If detectedUsername exists and doesn't match initialDirectory, use initialDirectory inferred home
          if (homeDir && detectedUsername && initialDirectory) {
            const expectedHomeFromUsername = detectedUsername === 'root' ? '/root' : `/home/${detectedUsername}`;
            const expectedHomeFromInitial = initialDirectory.startsWith('/home/')
              ? '/' + initialDirectory.split('/').filter(Boolean).slice(0, 2).join('/')
              : initialDirectory.startsWith('/root') ? '/root' : null;

            if (expectedHomeFromInitial && expectedHomeFromUsername !== expectedHomeFromInitial) {
              // Username doesn't match initialDirectory, use initialDirectory inferred home
              homeDir = expectedHomeFromInitial;
              //console.log('[CommandInputArea] Username mismatch, correcting home from initialDirectory:', homeDir);
            }
          }

          // Strategy 4: Only use detectedUsername as last resort (when previous strategies fail)
          if (!homeDir && detectedUsername) {
            homeDir = detectedUsername === 'root' ? '/root' : `/home/${detectedUsername}`;
            //console.log('[CommandInputArea] Using detectedUsername as home:', detectedUsername, '→', homeDir);
          }

          if (homeDir && homeDir.startsWith('/')) {
            // If there's a subpath after ~, concatenate them
            if (detectedPath === '~' || detectedPath === '~/') {
              //console.log('[CommandInputArea] Resolved ~ to:', homeDir);
              setCurrentDirectory(homeDir);
              if (!isLocal) window.electron.sshUpdateCwd(connectionId, homeDir).catch(() => {});
            } else {
              // detectedPath is in ~/xxx format
              const remainder = detectedPath.slice(2); // Remove ~/
              const fullPath = `${homeDir}/${remainder}`.replace(/\/+/g, '/');
              //console.log('[CommandInputArea] Resolved ~/xxx to:', fullPath);
              setCurrentDirectory(fullPath);
              if (!isLocal) window.electron.sshUpdateCwd(connectionId, fullPath).catch(() => {});
            }
          } else {
            //console.log('[CommandInputArea] Could not resolve ~, keeping current directory');
          }
        } else if (detectedPath && detectedPath.startsWith('/')) {
          //console.log('[CommandInputArea] Parsed directory from prompt:', detectedPath);
          setCurrentDirectory(detectedPath);
          // Sync to backend
          if (!isLocal) window.electron.sshUpdateCwd(connectionId, detectedPath).catch(() => {});
        } else {
          // If unable to parse from prompt, fall back to getting cwd
          window.electron.getSessionCwd(connectionId, connectionType)
            .then(pwd => {
              if (pwd) setCurrentDirectory(pwd);
            })
            .catch(() => {});
        }

        // Clear buffer
        shellDataBufferRef.current = '';
      } else {
        // Keep buffer not too large (keep at most last 800 characters)
        if (shellDataBufferRef.current.length > 800) {
          shellDataBufferRef.current = shellDataBufferRef.current.slice(-800);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [connectionId]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    focusWithSelection: (start: number, end: number) => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(start, end);
      }
    },
    setInputMode: (mode: 'terminal' | 'input') => {
      setInputMode(mode);
    },
    getInputMode: () => inputMode
  }));

  // Listen for terminal focus gained event (triggered when user manually clicks terminal)
  // Used to update inputMode state so lightning icon syncs
  useEffect(() => {

    if (window.electron?.onTerminalFocusGained && connectionId) {
      const handleTerminalFocusGained = (connId: string) => {
        if (connId === connectionId) {
          setInputMode('terminal');
        }
      };

      const unsubscribe = window.electron.onTerminalFocusGained(handleTerminalFocusGained);
      return () => {
        unsubscribe();
      };
    } else {
    }
  }, [connectionId]);

  // Update inputMode state when input box gets focus
  const handleInputFocus = () => {
    setInputMode('input');
    onInputFocusGained?.();
  };

  // Filter history commands - use dedicated search query instead of input box value
  const filteredHistory = commandHistory.filter(h =>
    h.toLowerCase().includes(historySearchQuery.toLowerCase())
  );

  // Check if it's a cd command
  const isCdCommand = (cmd: string): boolean => {
    const trimmed = cmd.trim();
    return /^cd\s+/i.test(trimmed);
  };

  // Parse cd command target directory
  // Note: returns absolute path relative to root
  const parseCdTarget = (cmd: string, currentDir: string): string | null => {
    const trimmed = cmd.trim();
    const match = trimmed.match(/^cd\s+(.+)$/i);
    if (!match) return null;

    let target = match[1].trim();

    // Remove possible quotes
    if ((target.startsWith('"') && target.endsWith('"')) ||
        (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1);
    }

    // If absolute path, return directly
    if (target.startsWith('/')) {
      return target;
    }

    // If relative path, need to calculate
    // Handle ~ (home directory)
    if (target.startsWith('~')) {
      // If it's ~ or ~/xxx, need to get home directory
      // Use a simple default value, actual path will be parsed from prompt after shell execution
      const homeDir = currentDir.startsWith('/home/') ? currentDir : '/root';
      const remainder = target.slice(1); // Remove ~
      return remainder ? `${homeDir}${remainder}` : homeDir;
    }

    // Handle ../ or ../
    if (target === '..' || target.startsWith('../')) {
      const parts = currentDir.split('/').filter(Boolean);
      const targetParts = target.split('/').filter(p => p && p !== '.');

      let newParts = [...parts];
      for (const p of targetParts) {
        if (p === '..') {
          newParts.pop();
        } else {
          newParts.push(p);
        }
      }

      return '/' + newParts.join('/') || '/';
    }

    // Handle ./ or current directory
    if (target === '.' || target.startsWith('./')) {
      return currentDir;
    }

    // Normal relative path
    return `${currentDir}/${target}`.replace(/\/+/g, '/').replace(/\/$/, '');
  };

  // Find matching history commands for auto-completion
  const findAutoCompleteMatches = (input: string) => {
    if (!input.trim()) return [];
    return commandHistory.filter(cmd =>
      cmd.toLowerCase().startsWith(input.toLowerCase())
    );
  };

  // Get file list of current directory
  const fetchFileList = async () => {
    if (!connectionId || !window.electron || isLocal) return [];

    try {
      // First get current directory
      const pwd = await window.electron.getSessionCwd(connectionId, connectionType);
      if (!pwd) return [];
      setCurrentDirectory(pwd);

      // List directory contents
      const files = await window.electron.sshListDir(connectionId, pwd);
      setFileListCache(files);
      return files;
    } catch (error) {
      logger.error(LOG_MODULE.TERMINAL, 'terminal.file.fetch_failed', 'Failed to fetch file list', {
        error: 1,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  };

  // Parse input path, return target directory and filename prefix
  const parseInputPath = (inputPath: string, currentDir: string): { directory: string; prefix: string } => {
    // If current directory is empty, use root as default (but this should not happen)
    let effectiveCurrentDir = currentDir || '/';

    // Detect and clean possible prompt format in currentDir
    // e.g. dum@VM-8-14-ubuntu:~/dum_dev -> need to extract ~/dum_dev part
    const promptPattern = /[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9_-]+:(.+)$/;
    const promptMatch = effectiveCurrentDir.match(promptPattern);
    if (promptMatch && promptMatch[1]) {
      // Extract path part after prompt
      const pathPart = promptMatch[1];
      // If starts with ~, need further processing
      if (pathPart.startsWith('~/')) {
        effectiveCurrentDir = '~' + pathPart.slice(2);
      } else {
        effectiveCurrentDir = pathPart;
      }
    }

logger.debug(LOG_MODULE.TERMINAL, 'inputpath.input', 'Parsing input path', { inputPath, effectiveCurrentDir });

    // Remove possible quotes
    let cleanPath = inputPath;
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
      cleanPath = cleanPath.slice(1, -1);
    }

    // If path contains /, need to separate directory and filename prefix
    const lastSlashIndex = cleanPath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      // No /, means matching in current directory
      // If current directory starts with ~, need to expand first
      let finalDir = effectiveCurrentDir;
      if (effectiveCurrentDir.startsWith('~')) {
        // Expand ~ to home directory
        finalDir = resolveHomeDir(effectiveCurrentDir, connectionId);
      }
logger.debug(LOG_MODULE.TERMINAL, 'inputpath.no_slash', 'No slash, using current dir', { finalDir });
      return { directory: finalDir, prefix: cleanPath };
    }

    // Extract directory part and filename prefix
    const dirPart = cleanPath.slice(0, lastSlashIndex + 1); // Include trailing /
    const prefix = cleanPath.slice(lastSlashIndex + 1);

    // Parse directory to absolute path
    let targetDir: string;
    if (dirPart.startsWith('/')) {
      // Absolute path
      targetDir = dirPart.replace(/\/+$/, '') || '/'; // Remove trailing /, but keep if root
      logger.debug(LOG_MODULE.TERMINAL, 'inputpath.absolute', 'Absolute path', { targetDir });
    } else if (dirPart.startsWith('~/')) {
      // Home directory - expand ~ to actual home directory path
      targetDir = resolveHomeDir(dirPart, connectionId);
      logger.debug(LOG_MODULE.TERMINAL, 'inputpath.home', 'Home path', { targetDir });
    } else {
      // Relative path - need to ensure effectiveCurrentDir is absolute path first
      let baseDir = effectiveCurrentDir;
      if (baseDir.startsWith('~')) {
        // Expand ~ to home directory
        baseDir = resolveHomeDir(baseDir, connectionId);
      } else if (!baseDir.startsWith('/')) {
        // If doesn't start with / and doesn't start with ~, it's an invalid directory format
        // Try to extract from prompt format
        const pathMatch = baseDir.match(promptPattern);
        if (pathMatch && pathMatch[1]) {
          baseDir = pathMatch[1].startsWith('/') ? pathMatch[1] : '/' + pathMatch[1];
        } else {
          baseDir = '/'; // Fall back to root
        }
      }

      const parts = dirPart.split('/').filter(p => p && p !== '.');
      const currentParts = baseDir.split('/').filter(Boolean);

      for (const part of parts) {
        if (part === '..') {
          currentParts.pop();
        } else {
          currentParts.push(part);
        }
      }

      targetDir = '/' + currentParts.join('/');
      logger.debug(LOG_MODULE.TERMINAL, 'inputpath.relative', 'Relative path', { targetDir });
    }

    logger.debug(LOG_MODULE.TERMINAL, 'inputpath.result', 'Path parsing result', { targetDir, prefix });
    return { directory: targetDir, prefix };
  };

  // Helper function: parse ~ home directory symbol to actual path
  const resolveHomeDir = (pathWithTilde: string, connId?: string): string => {
    // Try to infer home directory from current directory state
    let homeDir: string | null = null;

    // Infer from effectiveCurrentDir
    const currentFromState = currentDirectory;
    if (currentFromState && currentFromState.startsWith('/home/')) {
      homeDir = '/' + currentFromState.split('/').slice(1, 3).join('/');
    } else if (currentFromState && currentFromState === '/root') {
      homeDir = '/root';
    } else if (currentFromState && currentFromState.startsWith('~')) {
      // Handle ~username format, extract dum from ~dum_dev
const tildeMatch = currentFromState.match(/^~([a-z_][a-z0-9_-]*)/i);
        if (tildeMatch && tildeMatch[1]) {
          const username = tildeMatch[1];
          homeDir = username === 'root' ? '/root' : `/home/${username}`;
          logger.debug(LOG_MODULE.TERMINAL, 'resolvehome.extracted', 'Extracted username from ~format', { username, homeDir });
        }
    } else if (currentFromState) {
      // Try to extract username from prompt format, e.g. user@host:path
      const promptPattern = /([a-z_][a-z0-9_-]*?)@/;
      const match = currentFromState.match(promptPattern);
      if (match && match[1]) {
        const username = match[1];
        homeDir = username === 'root' ? '/root' : `/home/${username}`;
      }
    }

    if (!homeDir) {
      // Default value
      homeDir = '/root';
    }

    // Parse path
    if (pathWithTilde === '~' || pathWithTilde === '~/') {
      return homeDir;
    } else {
      const remainder = pathWithTilde.startsWith('~/') ? pathWithTilde.slice(2) : pathWithTilde.slice(1);
      return `${homeDir}${remainder ? '/' + remainder : ''}`.replace(/\/+/g, '/');
    }
  };

  // Find matching files for auto-completion (supports deep matching)
  // Note: supports deep path matching, e.g. cd /home/ and press Tab will match files under /home/
  const findFileCompletionMatches = async (input: string, actualCurrentDir?: string) => {
    // Use passed directory, or state directory if not provided
    const workingDir = actualCurrentDir || currentDirectory;

    // If input is empty, no match
    if (!input.trim()) {
      return [];
    }

    // Extract last parameter (part after space) for matching
    const lastSpaceIndex = input.lastIndexOf(' ');
    const matchTarget = lastSpaceIndex >= 0 ? input.slice(lastSpaceIndex + 1) : input;

    // If match target is option argument (starts with -), don't do file matching
    if (matchTarget.startsWith('-')) {
      return [];
    }

    // If match target is empty string (input ends with space), don't do file matching
    if (!matchTarget.trim()) {
      return [];
    }

    logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.match_target', 'Finding file completion matches', { matchTarget, workingDir });

    // Parse input path, get target directory and filename prefix
    const { directory: targetDir, prefix: filePrefix } = parseInputPath(matchTarget, workingDir);

    logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.listing', 'Listing directory for completion', { targetDir, prefix: filePrefix });

    try {
      // Get file list of target directory
      if (isLocal) return [];
      const files = await window.electron.sshListDir(connectionId!, targetDir);

      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.files_in_dir', 'Files in directory', { targetDir, files });

      if (files.length === 0) {
        return [];
      }

      // Filter files that start with filename prefix
      const matches = files.filter(file =>
        file.toLowerCase().startsWith(filePrefix.toLowerCase())
      );

      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.matches', 'Completion matches', { matches });

      return matches;
    } catch (error) {
      logger.error(LOG_MODULE.TERMINAL, 'autocomplete.list_failed', 'Failed to list directory for completion', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  };

    // Perform auto-completion (collect history commands and remote files simultaneously)
    // Supports deep path matching
    const performAutoComplete = async () => {
      // If already in completion mode and showing list, Tab confirms current selected item
      if (showCompletionList && completionItems.length > 0) {
        const selectedItem = completionItems[completionIndex];
        applyCompletion(selectedItem);
        return;
      }

      // ★ Prioritize frontend-parsed currentDirectory
      // Only fetch from backend when necessary (currentDirectory is empty or invalid)
      let actualCurrentDir = currentDirectory;

      if (!actualCurrentDir || !actualCurrentDir.startsWith('/')) {
        // Only fetch from backend if frontend doesn't have valid directory
        if (connectionId && window.electron) {
        try {
          const pwd = await window.electron.getSessionCwd(connectionId, connectionType);
          logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.fetched_pwd', 'Fetched directory from backend', { pwd });
          if (pwd) {
            actualCurrentDir = pwd;
            if (pwd !== currentDirectory && pwd.startsWith('/')) {
              setCurrentDirectory(pwd);
            }
          } else {
            actualCurrentDir = '/';
          }
        } catch (error) {
          logger.error(LOG_MODULE.TERMINAL, 'autocomplete.fetch_pwd_failed', 'Failed to fetch current directory', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Use default value
          actualCurrentDir = '/';
        }
      }
    } else {
      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.using_frontend_pwd', 'Using frontend currentDirectory', { actualCurrentDir });
    }

    // Collect all matching items
    const items: CompletionItem[] = [];

    // 1. Collect history command matches
    const historyMatches = findAutoCompleteMatches(inputValue);
    historyMatches.forEach(cmd => {
      items.push({
        text: cmd,
        type: 'history',
        displayText: cmd
      });
    });

    // 2. Collect remote file matches (if SSH connection exists)
    if (connectionId && window.electron) {
      try {
        // Extract last parameter (part after space) for matching
        // If no space, whole input is match target (supports first word matching file)
        const lastSpaceIndex = inputValue.lastIndexOf(' ');
        const matchTarget = lastSpaceIndex >= 0 ? inputValue.slice(lastSpaceIndex + 1) : inputValue;

        // Only do file completion if there's a match target and it's not an option argument
        if (matchTarget && !matchTarget.startsWith('-')) {
          // Parse input path, get target directory - ★ Use real-time fetched directory
          const { directory: targetDir, prefix: filePrefix } = parseInputPath(matchTarget, actualCurrentDir);

          logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.using_dir', 'Using directory', { actualCurrentDir, targetDir, prefix: filePrefix });

          // Use new deep matching logic - ★ Pass real-time fetched directory
          const fileMatches = await findFileCompletionMatches(inputValue, actualCurrentDir);

          fileMatches.forEach(file => {
            // Determine if it's a directory (ends with /)
            const isDir = file.endsWith('/');
            const prefix = lastSpaceIndex >= 0 ? inputValue.slice(0, lastSpaceIndex + 1) : '';

            // Build full path
            let fullPath: string;
            if (matchTarget.includes('/')) {
              // If input contains path, need to concatenate directory part
              const dirPart = matchTarget.slice(0, matchTarget.lastIndexOf('/') + 1);
              fullPath = dirPart + file;
            } else {
              // If input doesn't contain path, use filename directly
              fullPath = file;
            }

            items.push({
              text: prefix + fullPath,
              type: isDir ? 'directory' : 'file',
              displayText: file
            });
          });
        }
      } catch (error) {
        logger.error(LOG_MODULE.TERMINAL, 'autocomplete.error', 'File completion error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // If no matches, exit
    if (items.length === 0) {
      resetCompletionState();
      return;
    }

    // Deduplicate: check if all completion texts for final result are the same
    const uniqueTexts = new Set(items.map(item => item.text));

    // If only one unique completion text (even from different sources), apply directly
    if (uniqueTexts.size === 1) {
      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.single_match', 'All items have same completion text, applying directly', { text: items[0].text });
      applyCompletion(items[0]);
      return;
    }

    // Set completion state
    setCompletionItems(items);
    setCompletionIndex(0);

    // Multiple matches, show list and gray hint
    setShowCompletionList(true);
    setIsAutoCompleteMode(true);
    const firstItem = items[0];
    const completion = firstItem.text.slice(inputValue.length);
    setAutoCompleteText(completion);
    setMatchedCommands(historyMatches);
    setMatchIndex(0);
  };

  // Apply completion
  const applyCompletion = (item: CompletionItem) => {
    onInputChange(item.text);
    resetCompletionState();
    // If it's a directory, automatically refresh file list
    if (item.type === 'directory') {
      setFileListCache([]);
    }
    // Focus back on command input
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(item.text.length, item.text.length);
      }
    });
  };

  // Reset completion state
  const resetCompletionState = () => {
    setIsAutoCompleteMode(false);
    setAutoCompleteText('');
    setMatchedCommands([]);
    setMatchIndex(-1);
    setShowCompletionList(false);
    setCompletionItems([]);
    setCompletionIndex(0);
    setIsFileCompletionMode(false);
    setFileCompletionMatches([]);
    setFileCompletionIndex(-1);
    setFileCompletionHint('');
  };

  // Navigate in completion list
  const navigateCompletionList = (direction: 'up' | 'down') => {
    if (!showCompletionList || completionItems.length === 0) return;

    let newIndex = completionIndex;
    if (direction === 'up') {
      newIndex = completionIndex > 0 ? completionIndex - 1 : completionItems.length - 1;
    } else {
      newIndex = completionIndex < completionItems.length - 1 ? completionIndex + 1 : 0;
    }

    setCompletionIndex(newIndex);
    const selectedItem = completionItems[newIndex];
    const completion = selectedItem.text.slice(inputValue.length);
    setAutoCompleteText(completion);

    // Scroll to visible area
    if (completionListRef.current) {
      const listEl = completionListRef.current;
      const itemEl = listEl.children[newIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  // Select history command
  const handleSelectHistory = (cmd: string) => {
    onInputChange(cmd);
    setShowHistory(false);
    setSelectedHistoryIndex(-1);
    setHistorySearchQuery('');
    setHistoryAutoCompleteText('');
    resetCompletionState();
    // Focus switch to command input, move cursor to end of text
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const length = cmd.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }, 50);
  };

  // Delete history command
  const handleDeleteHistory = (e: React.MouseEvent, cmd: string) => {
    e.stopPropagation();
    setCommandHistory(commandHistory.filter(h => h !== cmd));
  };

  // Keyboard shortcut handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Detect Ctrl key press (double-click to switch mode)
      if (e.key === 'Control') {
        const now = Date.now();
        const timeSinceLastCtrl = now - lastCtrlPressTimeRef.current;

        // If two Ctrl key presses within 300ms, treat as double-click
        if (timeSinceLastCtrl < 300 && timeSinceLastCtrl > 0) {
          e.preventDefault();
          e.stopPropagation();

          // Switch input mode
          setIsSwitchingMode(true);
          setTimeout(() => {
            // First read current mode, then update state, finally execute side effects
            setInputMode(prev => {
              const newMode = prev === 'terminal' ? 'input' : 'terminal';

              // Side effects go to next microtask, not in state updater
              queueMicrotask(() => {
                if (newMode === 'terminal' && window.electron && connectionId) {
                  window.electron.sshFocusTerminal(connectionId);
                }
                if (newMode === 'input' && inputRef.current) {
                  inputRef.current.focus();
                }
              });

              return newMode;
            });
            setIsSwitchingMode(false);
          }, 150);

          lastCtrlPressTimeRef.current = 0;
          return;
        }

        lastCtrlPressTimeRef.current = now;
        setCtrlKeyHeld(true);
      }

      // Alt key shows history panel (only when input box has focus)
      if (e.key === 'Alt' && document.activeElement === inputRef.current) {
        e.preventDefault();
        if (!showHistory) {
          setShowHistory(true);
          setHistorySearchQuery('');
          setHistoryIndex(-1);
          setSelectedHistoryIndex(-1);
          setHistoryAutoCompleteText('');
          resetCompletionState();
        }
      }

      if (e.key === 'Escape') {
        if (showHistory) {
                  setShowHistory(false);
                  setHistoryIndex(-1);
                  setSelectedHistoryIndex(-1);
                  setHistorySearchQuery('');
                  resetCompletionState();
                  setTimeout(() => {
                    if (inputRef.current) {
                      inputRef.current.focus();
                    }
                  }, 50);
        } else if (showCompletionList || isAutoCompleteMode) {
          // ESC exits auto-completion mode
          resetCompletionState();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setCtrlKeyHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showHistory, setShowHistory, isAutoCompleteMode, showCompletionList, inputMode, connectionId]);

  return (
    <div className="px-4 py-2 border-t flex flex-col gap-3 flex-shrink-0 relative" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}>
      {showHistory && (
        <div ref={historyRef} className="absolute bottom-full left-4 right-4 mb-2 max-h-[300px] flex flex-col rounded-2xl shadow-2xl border overflow-hidden backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200 z-[60]"
             style={{
               backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
               borderColor: 'var(--border-color)'
             }}>
          <div className="p-3 border-b flex items-center gap-3 bg-black/5" style={{ borderColor: 'var(--border-color)' }}>
            <Search className="w-4 h-4 opacity-40" />
            <div className="flex-1 relative">
              <input
                autoFocus
                value={historySearchQuery}
                onChange={(e) => {
                  setHistorySearchQuery(e.target.value);
                  setSelectedHistoryIndex(-1); // Reset selection state when search query changes
                  setHistoryAutoCompleteText(''); // Reset completion text
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredHistory.length > 0) {
                    // Press Enter to select currently selected history command (if any), otherwise select first
                    e.preventDefault();
                    const selectedIndex = selectedHistoryIndex >= 0 ? selectedHistoryIndex : 0;
                    handleSelectHistory(filteredHistory[selectedIndex]);
                  } else if (e.key === 'ArrowUp') {
                    // Select history command upward
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      const newIndex = selectedHistoryIndex > 0 ? selectedHistoryIndex - 1 : filteredHistory.length - 1;
                      setSelectedHistoryIndex(newIndex);
                    }
                  } else if (e.key === 'ArrowDown') {
                    // Select history command downward
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      const newIndex = selectedHistoryIndex < filteredHistory.length - 1 ? selectedHistoryIndex + 1 : 0;
                      setSelectedHistoryIndex(newIndex);
                    }
                  } else if (e.key === 'Tab') {
                    // Press Tab for auto-completion
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      // If already has completion text, confirm completion
                      if (historyAutoCompleteText) {
                        setHistorySearchQuery(historySearchQuery + historyAutoCompleteText);
                        setHistoryAutoCompleteText('');
                        setSelectedHistoryIndex(0);
                      } else {
                        // Otherwise start completion
                        const completion = filteredHistory[0].slice(historySearchQuery.length);
                        setHistoryAutoCompleteText(completion);
                        setSelectedHistoryIndex(0);
                      }
                    }
                  } else if (e.key === 'Escape') {
                    // ESC closes history panel
                    setShowHistory(false);
                    setHistoryIndex(-1);
                    setSelectedHistoryIndex(-1);
                    setHistorySearchQuery('');
                    setHistoryAutoCompleteText('');
                    resetCompletionState();
                    setTimeout(() => {
                      if (inputRef.current) {
                        inputRef.current.focus();
                      }
                    }, 50);
                  }
                }}
                placeholder={t.terminal.searchHistory}
                className="w-full bg-transparent border-none outline-none text-xs font-bold"
                style={{ color: 'var(--text-main)' }}
              />
              {/* Auto-completion text display */}
              {historyAutoCompleteText && (
                <div
                  className="absolute left-0 top-0 pointer-events-none font-mono text-xs select-none"
                  style={{
                    color: 'var(--text-dim)',
                    paddingLeft: '2px' // Slight offset for alignment
                  }}
                >
                  <span className="invisible">{historySearchQuery}</span>
                  <span>{historyAutoCompleteText}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { if(confirm(t.terminal.clearHistory + '?')) setCommandHistory([]); }}
                className="text-[10px] font-bold text-rose-500 hover:opacity-80 flex items-center gap-1"
              >
                <Eraser className="w-3 h-3" /> {t.terminal.clearHistory}
              </button>
              <button
                onClick={() => {
                  setShowHistory(false);
                  setHistoryIndex(-1);
                  setSelectedHistoryIndex(-1);
                  resetCompletionState();
                  setTimeout(() => {
                    if (inputRef.current) {
                      inputRef.current.focus();
                    }
                  }, 50);
                }}
                className="p-1.5 hover:bg-black/10 rounded-lg transition-colors text-slate-400 hover:text-rose-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar py-1">
            {filteredHistory.length > 0 ? filteredHistory.map((cmd, i) => (
              <div
                key={i}
                className={`group flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                  selectedHistoryIndex === i ? 'bg-primary/20 text-primary' : 'hover:bg-primary/10'
                }`}
                onClick={() => handleSelectHistory(cmd)}
              >
                <Command className={`w-3.5 h-3.5 ${
                  selectedHistoryIndex === i ? 'text-primary opacity-100' : 'opacity-30 group-hover:text-primary group-hover:opacity-100'
                }`} />
                <div className="flex-1 font-mono text-xs truncate" style={{
                  color: selectedHistoryIndex === i ? 'var(--primary)' : 'var(--text-main)'
                }}>{cmd}</div>
                <button
                  onClick={(e) => handleDeleteHistory(e, cmd)}
                  className={`p-1 hover:text-rose-500 transition-all ${
                    selectedHistoryIndex === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )) : (
              <div className="py-8 text-center opacity-20 text-[10px] font-bold uppercase tracking-widest">
                {t.terminal.noHistory}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        {isExecutingCommand ? (
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
        ) : (
          <div className="relative">
            {/* Input mode indicator */}
            <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full overflow-hidden">
              <div
                className={`w-full h-full transition-all duration-200 ${
                  inputMode === 'terminal'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              />
            </div>
            {/* Transition animation effect */}
            {isSwitchingMode && (
              <div className="absolute -inset-2 rounded-full animate-ping opacity-50 bg-primary" />
            )}
            <Zap
              className={`w-4 h-4 transition-all duration-300 ${
                inputMode === 'terminal'
                  ? 'text-amber-500'
                  : 'text-green-500'
              }`}
            />
          </div>
        )}

        <div className="flex-1 relative min-w-0">
          <input
            ref={inputRef}
            value={inputValue}
            onFocus={handleInputFocus}
            onChange={(e) => {
              onInputChange(e.target.value);
              // When input changes, exit completion mode
              if (showCompletionList || isAutoCompleteMode) {
                resetCompletionState();
              }
            }}
            onKeyDown={(e) => {
              // Handle Ctrl+C interrupt command
              if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                if (onInterrupt) {
                  onInterrupt();
                }
                return;
              }

              // Handle Command + ↑ (Mac) or Ctrl + ↑ (Windows/Linux) to show history window
              const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
              const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
              if (modifierPressed && e.key === 'ArrowUp') {
                e.preventDefault();
                setShowHistory(true);
                  setHistorySearchQuery('');
                  setHistoryIndex(-1);
                  setSelectedHistoryIndex(-1);
                  setHistoryAutoCompleteText('');
                  resetCompletionState();
                return;
              }

              // Handle Tab auto-completion
              if (e.key === 'Tab') {
                e.preventDefault();
                performAutoComplete();
                return;
              }

              // Handle up/down arrow keys (in completion list mode)
              if (showCompletionList) {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  navigateCompletionList('up');
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  navigateCompletionList('down');
                  return;
                }
              }

              // Handle up/down arrow keys (normal history browsing mode)
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                // Normal history browsing mode
                if (commandHistory.length > 0) {
                  const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : commandHistory.length - 1;
                  setHistoryIndex(newIndex);
                  onInputChange(commandHistory[newIndex]);
                }
                return;
              }

              if (e.key === 'ArrowDown') {
                e.preventDefault();
                // Normal history browsing mode
                if (historyIndex > 0) {
                  const newIndex = historyIndex - 1;
                  setHistoryIndex(newIndex);
                  onInputChange(commandHistory[newIndex]);
                } else if (historyIndex === 0) {
                  // Back from first history command to empty input
                  setHistoryIndex(-1);
                  onInputChange('');
                }
                return;
              }

              // Handle Enter to execute command
              if (e.key === 'Enter') {
                setHistoryIndex(-1); // Reset history index
                const fullCommand = inputValue + autoCompleteText; // Execute full command (including completion part)
                resetCompletionState();

                // Note: no longer pre-update directory state
                // Directory update for cd command will completely depend on shell output prompt parsing
                // This ensures directory state only updates when cd command truly succeeds

                onExecute(fullCommand);
              }

              // If user starts typing, reset related state
              if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                setHistoryIndex(-1);
                if (showCompletionList || isAutoCompleteMode) {
                  resetCompletionState();
                }
              }
            }}
            className="w-full bg-transparent border-none focus:outline-none font-mono text-sm"
            style={{ color: 'var(--text-main)' }}
                placeholder={isConnected ? t.terminal.commandPlaceholder : (connectionError ? t.terminal.connectionFailed : t.terminal.connectingEllipsis)}
            disabled={!isConnected || isExecutingCommand}
          />
          {/* Auto-completion text display (gray hint) */}
          {isAutoCompleteMode && autoCompleteText && (
            <div
              className="absolute left-0 top-0 pointer-events-none font-mono text-sm select-none"
              style={{
                color: 'var(--text-dim)',
                opacity: 0.5
              }}
            >
              <span className="invisible">{inputValue}</span>
              <span>{autoCompleteText}</span>
            </div>
          )}
          {/* Completion candidate list */}
          {showCompletionList && completionItems.length > 1 && (
            <div
              ref={completionListRef}
              className="absolute left-0 bottom-full mb-2 w-full max-h-[200px] overflow-y-auto rounded-lg shadow-lg border z-50"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                borderColor: 'var(--border-color)'
              }}
            >
              {completionItems.map((item, index) => (
                <div
                  key={`${item.type}-${item.text}-${index}`}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors border-l-2 ${
                    completionIndex === index ? 'bg-primary border-primary font-semibold' : 'border-transparent'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyCompletion(item)}
                  onMouseEnter={() => setCompletionIndex(index)}
                >
                  {/* Icon: show different icon based on type */}
                  {item.type === 'history' && (
                    <History className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {item.type === 'file' && (
                    <File className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {item.type === 'directory' && (
                    <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {/* Display text */}
                  <span
                    className={`font-mono text-xs truncate flex-1 ${completionIndex === index ? 'text-white' : ''}`}
                    style={completionIndex !== index ? { color: 'var(--text-main)' } : undefined}
                  >
                    {item.displayText}
                  </span>
                  {/* Type label */}
                  <span className="text-[9px] uppercase tracking-wider opacity-30 flex-shrink-0">
                    {item.type === 'history' ? 'history' : item.type === 'directory' ? 'dir' : 'file'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {connectionError && (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all text-slate-500 hover:text-primary"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Reconnect</span>
            </button>
          )}
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setHistorySearchQuery('');
              setHistoryIndex(-1);
              setSelectedHistoryIndex(-1);
              setHistoryAutoCompleteText('');
              resetCompletionState();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${showHistory ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10' : 'border-transparent hover:border-primary/20 hover:bg-primary/5 text-slate-500 hover:text-primary'}`}
            disabled={!isConnected}
          >
            <History className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">{t.terminal.history}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
