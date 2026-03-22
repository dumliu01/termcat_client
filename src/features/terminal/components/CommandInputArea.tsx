import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Zap, History, Search, Eraser, Command, Trash2, X, RefreshCw, File, Folder } from 'lucide-react';
import { logger, LOG_MODULE } from '@/base/logger/logger';

// 补全候选项类型
interface CompletionItem {
  text: string;        // 完整的补全文本
  type: 'history' | 'file' | 'directory';  // 类型：历史命令 / 文件 / 目录
  displayText: string; // 显示文本（可能是相对于输入的部分）
}

interface CommandInputAreaProps {
  inputValue: string;
  onInputChange: (val: string) => void;
  onExecute: (cmd: string) => void;
  onInterrupt?: () => void; // 新增：中断命令的回调
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
  connectionId?: string; // SSH连接ID，用于获取当前目录文件列表
  connectionType?: 'local' | 'ssh'; // 连接类型
  initialDirectory?: string; // 初始目录（home 目录）
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
  initialDirectory = ''
}, ref) => {
  const isLocal = connectionType === 'local';
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 表示当前不在历史浏览模式

  // 准匹配状态
  const [isAutoCompleteMode, setIsAutoCompleteMode] = useState(false);
  const [autoCompleteText, setAutoCompleteText] = useState(''); // 补全的文本部分
  const [matchedCommands, setMatchedCommands] = useState<string[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);

  // 统一的补全候选列表状态
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [showCompletionList, setShowCompletionList] = useState(false);
  const completionListRef = useRef<HTMLDivElement>(null);

  // 文件自动补全状态
  const [isFileCompletionMode, setIsFileCompletionMode] = useState(false);
  const [fileCompletionMatches, setFileCompletionMatches] = useState<string[]>([]);
  const [fileCompletionIndex, setFileCompletionIndex] = useState(-1);
  const [fileCompletionHint, setFileCompletionHint] = useState(''); // 灰色提示文本
  const [currentDirectory, setCurrentDirectory] = useState<string>(initialDirectory);
  const [fileListCache, setFileListCache] = useState<string[]>([]);

  // 历史面板选中状态
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  // 历史搜索自动补全状态
  const [historyAutoCompleteText, setHistoryAutoCompleteText] = useState('');

  // 输入模式状态：'terminal' = 终端直接输入模式，'input' = 输入栏输入模式
  const [inputMode, setInputMode] = useState<'terminal' | 'input'>('input');
  // 双击Ctrl检测 - 使用 ref 避免闭包问题
  const lastCtrlPressTimeRef = useRef<number>(0);
  const [ctrlKeyHeld, setCtrlKeyHeld] = useState(false);
  // 切换动画状态
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);

  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shellDataBufferRef = useRef<string>(''); // 用于解析 shell 数据的缓冲区

  // 当 initialDirectory 变化时，同步到 currentDirectory
  useEffect(() => {
    //console.log('[CommandInputArea] initialDirectory changed:', initialDirectory, 'currentDirectory:', currentDirectory);
    if (initialDirectory && !currentDirectory) {
      //console.log('[CommandInputArea] Setting currentDirectory to:', initialDirectory);
      setCurrentDirectory(initialDirectory);
    }
  }, [initialDirectory, currentDirectory]);

  // 主动获取当前工作目录
  useEffect(() => {
    // 如果已经有当前目录或没有连接ID，不需要获取
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

  // 监听 shell 数据流，从提示符中解析当前目录
  useEffect(() => {
    if (!connectionId || !window.electron) return;

    let lastPromptTime = 0;
    const minInterval = 300; // 最小间隔300ms，避免频繁调用

    const unsubscribe = window.electron.onShellData((connId, data) => {
      if (connId !== connectionId) return;

      // 将数据添加到缓冲区
      shellDataBufferRef.current += data;

      const buffer = shellDataBufferRef.current;

      // 检测命令提示符并尝试从中解析路径
      // 常见提示符格式：
      // 1. user@host:/path/to/dir$ 或 user@host:/path/to/dir#
      // 2. user@host:~$ (home 目录)
      // 3. /path/to/dir $ 或 /path/to/dir #
      // 4. [user@host /path/to/dir]$ 或 [user@host /path/to/dir]#

      // 提取最后一行（可能是提示符）
      const lines = buffer.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      const secondLastLine = lines.length > 1 ? lines[lines.length - 2] : '';

      // 检测是否是提示符（包含 $ 或 #）
      const hasPrompt = /[$#]\s*$/.test(lastLine) || /[$#]\s*$/.test(secondLastLine);

      //console.log('[CommandInputArea] Shell data, buffer length:', buffer.length, 'hasPrompt:', hasPrompt, 'lastLine:', lastLine.slice(0, 100));

      if (hasPrompt) {
        const now = Date.now();
        // 限流：避免频繁调用
        if (now - lastPromptTime < minInterval) {
          //console.log('[CommandInputArea] Skipping due to rate limit');
          return;
        }
        lastPromptTime = now;

logger.debug(LOG_MODULE.TERMINAL, 'terminal.prompt.detected', 'Prompt detected', { lastLine: JSON.stringify(lastLine.slice(-100)), secondLastLine: JSON.stringify(secondLastLine.slice(-100)) });

        //console.log('[CommandInputArea] Prompt detected, parsing directory from prompt...');

        // 辅助函数：移除 ANSI 转义码（颜色代码）和终端控制序列
        const removeAnsiCodes = (str: string): string => {
          // 移除所有 ANSI 转义序列和终端控制序列
          return str
            // 1. 移除 OSC (Operating System Command) 序列 - 终端标题等
            // 格式: ESC ] ... BEL 或 ESC ] ... ESC \
            // 注意：有时候没有明确的结束符，需要匹配到下一个 ESC 或行尾
            .replace(/\x1b\]0;[^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
            .replace(/\x1b\][0-9]*;[^\x07\x1b]*/g, '') // 更宽松的 OSC 匹配
            // 2. 移除终端模式设置 (如 \x1b[?2004h bracketed paste mode)
            .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
            // 3. 移除标准 ANSI 颜色/样式转义码
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/\033\[[0-9;]*m/g, '')
            // 4. 移除可能已被部分解码的格式
            .replace(/\[[\d;]+m/g, '')
            .replace(/\[[0-9;]*m/g, '')
            // 5. 移除回车符
            .replace(/\r/g, '');
        };

        // 清理最后一行和倒数第二行，移除颜色代码
        const cleanLastLine = removeAnsiCodes(lastLine);
        const cleanSecondLastLine = removeAnsiCodes(secondLastLine);

        //console.log('[CommandInputArea] Cleaned lastLine:', JSON.stringify(cleanLastLine.slice(-100)));
       // console.log('[CommandInputArea] Cleaned secondLastLine:', JSON.stringify(cleanSecondLastLine.slice(-100)));

        //console.log('[CommandInputArea] Cleaned lastLine:', cleanLastLine.slice(0, 100));

        // 从提示符中解析路径
        let detectedPath: string | null = null;
        let detectedUsername: string | null = null; // 从提示符提取的用户名

        // 模式1: user@host:/path$ 或 user@host:~/path$ 或 user@host:~$
        // 修复：使用非贪婪匹配和更精确的路径提取
        // 用户名：[a-z_][a-z0-9_-]* (非贪婪，遇到@就停止)
        // 主机名：[\w.-]+ (匹配主机名)
        // 路径：冒号后到 $ 或 # 之前的所有内容
        const pattern1 = /([a-z_][a-z0-9_-]*)@[\w.-]+:(~(?:\/[^\s$#]*)?|\/[^\s$#]*)[$#]/i;
        const match1 = cleanLastLine.match(pattern1) || cleanSecondLastLine.match(pattern1);
        if (match1) {
          detectedUsername = match1[1]; // 直接从正则捕获组获取用户名
          detectedPath = match1[2]; // 直接从正则捕获组获取路径
        //('[CommandInputArea] Pattern1 matched:', detectedPath, 'username:', detectedUsername);
        }

        // 模式2: [user@host /path]$ 或 [user@host ~]$
        if (!detectedPath) {
          const pattern2 = /\[[\w.@_-]+\s+(\/[^\]]*|~)\][$#]/;
          const match2 = cleanLastLine.match(pattern2) || cleanSecondLastLine.match(pattern2);
          if (match2 && match2[1]) {
            if (match2[1] === '~') {
              detectedPath = '~';
            } else {
              detectedPath = match2[1];
            }
            // 从提示符提取用户名（使用更安全的方式）
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

        // 模式3: 纯路径格式 /path $ 或 /path #
        if (!detectedPath) {
          const pattern3 = /(\/[^\s$#]*)[\s]*[$#]/;
          const match3 = cleanLastLine.match(pattern3) || cleanSecondLastLine.match(pattern3);
          if (match3 && match3[1]) {
            detectedPath = match3[1];
          //  console.log('[CommandInputArea] Pattern3 matched:', detectedPath);
          }
        }

        // 清理解析出的路径，移除可能残留的 ANSI 代码
        if (detectedPath) {
          detectedPath = removeAnsiCodes(detectedPath);
        }

        // 处理 ~ 符号：推断用户的 home 目录
        if (detectedPath === '~' || (detectedPath && detectedPath.startsWith('~/'))) {
          //console.log('[CommandInputArea] Detected ~ path:', detectedPath, 'initialDirectory:', initialDirectory);

          let homeDir: string | null = null;

          // 方案1: 优先使用 initialDirectory（最可靠）
          // initialDirectory 通常是 /home/dum 或 /root
          if (initialDirectory && initialDirectory.startsWith('/home/')) {
            // 从 /home/dum/dum_dev 中提取 /home/dum
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

          // 方案2: 如果 initialDirectory 不可用或与 detectedUsername 不匹配，优先使用 currentDirectory 推断
          if (!homeDir && currentDirectory && currentDirectory.startsWith('/home/')) {
            const parts = currentDirectory.split('/').filter(Boolean);
            if (parts.length >= 2) {
              homeDir = '/' + parts[0] + '/' + parts[1];
            }
            //console.log('[CommandInputArea] Inferred home from currentDirectory:', homeDir);
          }

          // 方案3: 如果 detectedUsername 存在且与 initialDirectory 不匹配，使用 initialDirectory 推断的 home
          if (homeDir && detectedUsername && initialDirectory) {
            const expectedHomeFromUsername = detectedUsername === 'root' ? '/root' : `/home/${detectedUsername}`;
            const expectedHomeFromInitial = initialDirectory.startsWith('/home/')
              ? '/' + initialDirectory.split('/').filter(Boolean).slice(0, 2).join('/')
              : initialDirectory.startsWith('/root') ? '/root' : null;

            if (expectedHomeFromInitial && expectedHomeFromUsername !== expectedHomeFromInitial) {
              // 用户名与 initialDirectory 不匹配，使用 initialDirectory 推断的 home
              homeDir = expectedHomeFromInitial;
              //console.log('[CommandInputArea] Username mismatch, correcting home from initialDirectory:', homeDir);
            }
          }

          // 方案4: 最后才使用 detectedUsername（仅当前面都失败时）
          if (!homeDir && detectedUsername) {
            homeDir = detectedUsername === 'root' ? '/root' : `/home/${detectedUsername}`;
            //console.log('[CommandInputArea] Using detectedUsername as home:', detectedUsername, '→', homeDir);
          }

          if (homeDir && homeDir.startsWith('/')) {
            // 如果是 ~ 后面还有子路径，拼接起来
            if (detectedPath === '~' || detectedPath === '~/') {
              //console.log('[CommandInputArea] Resolved ~ to:', homeDir);
              setCurrentDirectory(homeDir);
              if (!isLocal) window.electron.sshUpdateCwd(connectionId, homeDir).catch(() => {});
            } else {
              // detectedPath 是 ~/xxx 格式
              const remainder = detectedPath.slice(2); // 移除 ~/
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
          // 同步到后端
          if (!isLocal) window.electron.sshUpdateCwd(connectionId, detectedPath).catch(() => {});
        } else {
          // 如果无法从提示符解析，回退到获取 cwd
          window.electron.getSessionCwd(connectionId, connectionType)
            .then(pwd => {
              if (pwd) setCurrentDirectory(pwd);
            })
            .catch(() => {});
        }

        // 清空缓冲区
        shellDataBufferRef.current = '';
      } else {
        // 保持缓冲区不要太大（最多保留最后 800 个字符）
        if (shellDataBufferRef.current.length > 800) {
          shellDataBufferRef.current = shellDataBufferRef.current.slice(-800);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [connectionId]);

  // 暴露方法给父组件
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

  // 监听终端获得焦点事件（用户手动点击终端时触发）
  // 用于更新 inputMode 状态，使闪电图标同步
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

  // 输入框获得焦点时更新 inputMode 状态
  const handleInputFocus = () => {
    setInputMode('input');
  };

  // 过滤历史命令 - 使用专门的搜索查询而不是输入框的值
  const filteredHistory = commandHistory.filter(h =>
    h.toLowerCase().includes(historySearchQuery.toLowerCase())
  );

  // 检测是否是 cd 命令
  const isCdCommand = (cmd: string): boolean => {
    const trimmed = cmd.trim();
    return /^cd\s+/i.test(trimmed);
  };

  // 解析 cd 命令的目标目录
  // 注意：返回的是相对于根目录的绝对路径
  const parseCdTarget = (cmd: string, currentDir: string): string | null => {
    const trimmed = cmd.trim();
    const match = trimmed.match(/^cd\s+(.+)$/i);
    if (!match) return null;

    let target = match[1].trim();

    // 移除可能的引号
    if ((target.startsWith('"') && target.endsWith('"')) ||
        (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1);
    }

    // 如果是绝对路径，直接返回
    if (target.startsWith('/')) {
      return target;
    }

    // 如果是相对路径，需要计算
    // 处理 ~ (home 目录)
    if (target.startsWith('~')) {
      // 如果是 ~ 或 ~/xxx，需要获取 home 目录
      // 使用一个简单的默认值，实际路径会在 shell 执行后从提示符解析
      const homeDir = currentDir.startsWith('/home/') ? currentDir : '/root';
      const remainder = target.slice(1); // 移除 ~
      return remainder ? `${homeDir}${remainder}` : homeDir;
    }

    // 处理 ../ 或 ../
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

    // 处理 ./ 或当前目录
    if (target === '.' || target.startsWith('./')) {
      return currentDir;
    }

    // 普通相对路径
    return `${currentDir}/${target}`.replace(/\/+/g, '/').replace(/\/$/, '');
  };

  // 查找匹配的历史命令进行自动补全
  const findAutoCompleteMatches = (input: string) => {
    if (!input.trim()) return [];
    return commandHistory.filter(cmd =>
      cmd.toLowerCase().startsWith(input.toLowerCase())
    );
  };

  // 获取当前目录的文件列表
  const fetchFileList = async () => {
    if (!connectionId || !window.electron || isLocal) return [];

    try {
      // 先获取当前目录
      const pwd = await window.electron.getSessionCwd(connectionId, connectionType);
      if (!pwd) return [];
      setCurrentDirectory(pwd);

      // 列出目录内容
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

  // 解析输入路径，返回目标目录和文件名前缀
  const parseInputPath = (inputPath: string, currentDir: string): { directory: string; prefix: string } => {
    // 如果当前目录为空，使用根目录作为默认值（但这不应该发生）
    let effectiveCurrentDir = currentDir || '/';

    // 检测并清理 currentDir 中可能包含的提示符格式
    // 例如：dum@VM-8-14-ubuntu:~/dum_dev -> 需要提取 ~/dum_dev 部分
    const promptPattern = /[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9_-]+:(.+)$/;
    const promptMatch = effectiveCurrentDir.match(promptPattern);
    if (promptMatch && promptMatch[1]) {
      // 提取提示符后的路径部分
      const pathPart = promptMatch[1];
      // 如果是 ~ 开头，需要进一步处理
      if (pathPart.startsWith('~/')) {
        effectiveCurrentDir = '~' + pathPart.slice(2);
      } else {
        effectiveCurrentDir = pathPart;
      }
    }

logger.debug(LOG_MODULE.TERMINAL, 'inputpath.input', 'Parsing input path', { inputPath, effectiveCurrentDir });

    // 移除可能的引号
    let cleanPath = inputPath;
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
      cleanPath = cleanPath.slice(1, -1);
    }

    // 如果路径中包含 /，需要分离目录和文件名前缀
    const lastSlashIndex = cleanPath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      // 没有 /，表示在当前目录下匹配
      // 如果当前目录以 ~ 开头，需要先展开
      let finalDir = effectiveCurrentDir;
      if (effectiveCurrentDir.startsWith('~')) {
        // 展开 ~ 为 home 目录
        finalDir = resolveHomeDir(effectiveCurrentDir, connectionId);
      }
logger.debug(LOG_MODULE.TERMINAL, 'inputpath.no_slash', 'No slash, using current dir', { finalDir });
      return { directory: finalDir, prefix: cleanPath };
    }

    // 提取目录部分和文件名前缀
    const dirPart = cleanPath.slice(0, lastSlashIndex + 1); // 包含最后的 /
    const prefix = cleanPath.slice(lastSlashIndex + 1);

    // 解析目录为绝对路径
    let targetDir: string;
    if (dirPart.startsWith('/')) {
      // 绝对路径
      targetDir = dirPart.replace(/\/+$/, '') || '/'; // 移除末尾的 /，但如果是根目录则保留
      logger.debug(LOG_MODULE.TERMINAL, 'inputpath.absolute', 'Absolute path', { targetDir });
    } else if (dirPart.startsWith('~/')) {
      // home 目录 - 展开 ~ 为实际 home 目录路径
      targetDir = resolveHomeDir(dirPart, connectionId);
      logger.debug(LOG_MODULE.TERMINAL, 'inputpath.home', 'Home path', { targetDir });
    } else {
      // 相对路径 - 需要先确保 effectiveCurrentDir 是绝对路径
      let baseDir = effectiveCurrentDir;
      if (baseDir.startsWith('~')) {
        // 展开 ~ 为 home 目录
        baseDir = resolveHomeDir(baseDir, connectionId);
      } else if (!baseDir.startsWith('/')) {
        // 如果不是以 / 开头且不是 ~ 开头，说明是无效的目录格式
        // 尝试从提示符格式提取
        const pathMatch = baseDir.match(promptPattern);
        if (pathMatch && pathMatch[1]) {
          baseDir = pathMatch[1].startsWith('/') ? pathMatch[1] : '/' + pathMatch[1];
        } else {
          baseDir = '/'; // 回退到根目录
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

  // 辅助函数：解析 home 目录符号 ~ 为实际路径
  const resolveHomeDir = (pathWithTilde: string, connId?: string): string => {
    // 尝试从当前目录状态推断 home 目录
    let homeDir: string | null = null;

    // 从 effectiveCurrentDir 推断
    const currentFromState = currentDirectory;
    if (currentFromState && currentFromState.startsWith('/home/')) {
      homeDir = '/' + currentFromState.split('/').slice(1, 3).join('/');
    } else if (currentFromState && currentFromState === '/root') {
      homeDir = '/root';
    } else if (currentFromState && currentFromState.startsWith('~')) {
      // 处理 ~username 格式，从 ~dum_dev 提取 dum 作为用户名
const tildeMatch = currentFromState.match(/^~([a-z_][a-z0-9_-]*)/i);
        if (tildeMatch && tildeMatch[1]) {
          const username = tildeMatch[1];
          homeDir = username === 'root' ? '/root' : `/home/${username}`;
          logger.debug(LOG_MODULE.TERMINAL, 'resolvehome.extracted', 'Extracted username from ~format', { username, homeDir });
        }
    } else if (currentFromState) {
      // 尝试从提示符格式提取用户名，如 user@host:path
      const promptPattern = /([a-z_][a-z0-9_-]*?)@/;
      const match = currentFromState.match(promptPattern);
      if (match && match[1]) {
        const username = match[1];
        homeDir = username === 'root' ? '/root' : `/home/${username}`;
      }
    }

    if (!homeDir) {
      // 默认值
      homeDir = '/root';
    }

    // 解析路径
    if (pathWithTilde === '~' || pathWithTilde === '~/') {
      return homeDir;
    } else {
      const remainder = pathWithTilde.startsWith('~/') ? pathWithTilde.slice(2) : pathWithTilde.slice(1);
      return `${homeDir}${remainder ? '/' + remainder : ''}`.replace(/\/+/g, '/');
    }
  };

  // 查找匹配的文件进行自动补全（支持深度匹配）
  // 注意：支持路径深度匹配，如 cd /home/ 按 Tab 会匹配 /home/ 下的文件
  const findFileCompletionMatches = async (input: string, actualCurrentDir?: string) => {
    // 使用传入的目录，如果没有则使用状态中的目录
    const workingDir = actualCurrentDir || currentDirectory;

    // 如果输入为空，不匹配
    if (!input.trim()) {
      return [];
    }

    // 提取最后一个参数（空格后的部分）进行匹配
    const lastSpaceIndex = input.lastIndexOf(' ');
    const matchTarget = lastSpaceIndex >= 0 ? input.slice(lastSpaceIndex + 1) : input;

    // 如果匹配目标是选项参数（以 - 开头），不进行文件匹配
    if (matchTarget.startsWith('-')) {
      return [];
    }

    // 如果匹配目标是空字符串（输入以空格结尾），不进行文件匹配
    if (!matchTarget.trim()) {
      return [];
    }

    logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.match_target', 'Finding file completion matches', { matchTarget, workingDir });

    // 解析输入路径，获取目标目录和文件名前缀
    const { directory: targetDir, prefix: filePrefix } = parseInputPath(matchTarget, workingDir);

    logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.listing', 'Listing directory for completion', { targetDir, prefix: filePrefix });

    try {
      // 获取目标目录的文件列表
      if (isLocal) return [];
      const files = await window.electron.sshListDir(connectionId!, targetDir);

      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.files_in_dir', 'Files in directory', { targetDir, files });

      if (files.length === 0) {
        return [];
      }

      // 匹配以文件名前缀开头的文件
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

  // 执行自动补全（同时收集历史命令和远程文件）
  // 支持深度路径匹配
  const performAutoComplete = async () => {
    // 如果已经在补全模式并且显示列表，Tab确认当前选中项
    if (showCompletionList && completionItems.length > 0) {
      const selectedItem = completionItems[completionIndex];
      applyCompletion(selectedItem);
      return;
    }

    // ★ 优先使用前端解析的 currentDirectory
    // 只在必要时才从后端获取（即 currentDirectory 为空或无效）
    let actualCurrentDir = currentDirectory;

    if (!actualCurrentDir || !actualCurrentDir.startsWith('/')) {
      // 如果前端没有有效的目录，才从后端获取
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
          // 使用默认值
          actualCurrentDir = '/';
        }
      }
    } else {
      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.using_frontend_pwd', 'Using frontend currentDirectory', { actualCurrentDir });
    }

    // 收集所有匹配项
    const items: CompletionItem[] = [];

    // 1. 收集历史命令匹配
    const historyMatches = findAutoCompleteMatches(inputValue);
    historyMatches.forEach(cmd => {
      items.push({
        text: cmd,
        type: 'history',
        displayText: cmd
      });
    });

    // 2. 收集远程文件匹配（如果有SSH连接）
    if (connectionId && window.electron) {
      try {
        // 提取最后一个参数（空格后的部分）进行匹配
        // 如果没有空格，整个输入就是匹配目标（支持第一个词匹配文件）
        const lastSpaceIndex = inputValue.lastIndexOf(' ');
        const matchTarget = lastSpaceIndex >= 0 ? inputValue.slice(lastSpaceIndex + 1) : inputValue;

        // 只有当有匹配目标且不是选项参数时才进行文件补全
        if (matchTarget && !matchTarget.startsWith('-')) {
          // 解析输入路径，获取目标目录 - ★ 使用实时获取的目录
          const { directory: targetDir, prefix: filePrefix } = parseInputPath(matchTarget, actualCurrentDir);

          logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.using_dir', 'Using directory', { actualCurrentDir, targetDir, prefix: filePrefix });

          // 使用新的深度匹配逻辑 - ★ 传入实时获取的目录
          const fileMatches = await findFileCompletionMatches(inputValue, actualCurrentDir);

          fileMatches.forEach(file => {
            // 判断是否是目录（以 / 结尾）
            const isDir = file.endsWith('/');
            const prefix = lastSpaceIndex >= 0 ? inputValue.slice(0, lastSpaceIndex + 1) : '';

            // 构建完整路径
            let fullPath: string;
            if (matchTarget.includes('/')) {
              // 如果输入包含路径，需要拼接目录部分
              const dirPart = matchTarget.slice(0, matchTarget.lastIndexOf('/') + 1);
              fullPath = dirPart + file;
            } else {
              // 如果输入不包含路径，直接使用文件名
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

    // 如果没有匹配项，退出
    if (items.length === 0) {
      resetCompletionState();
      return;
    }

    // 去重：检查是否所有匹配项的最终补全文本相同
    const uniqueTexts = new Set(items.map(item => item.text));

    // 如果只有一个唯一的补全文本（即使来自不同来源），直接应用
    if (uniqueTexts.size === 1) {
      logger.debug(LOG_MODULE.TERMINAL, 'autocomplete.single_match', 'All items have same completion text, applying directly', { text: items[0].text });
      applyCompletion(items[0]);
      return;
    }

    // 设置补全状态
    setCompletionItems(items);
    setCompletionIndex(0);

    // 多个匹配项，显示列表和灰色提示
    setShowCompletionList(true);
    setIsAutoCompleteMode(true);
    const firstItem = items[0];
    const completion = firstItem.text.slice(inputValue.length);
    setAutoCompleteText(completion);
    setMatchedCommands(historyMatches);
    setMatchIndex(0);
  };

  // 应用补全
  const applyCompletion = (item: CompletionItem) => {
    onInputChange(item.text);
    resetCompletionState();
    // 如果是目录，自动刷新文件列表
    if (item.type === 'directory') {
      setFileListCache([]);
    }
    // 焦点回到命令输入框
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(item.text.length, item.text.length);
      }
    });
  };

  // 重置补全状态
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

  // 在补全列表中导航
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

    // 滚动到可见区域
    if (completionListRef.current) {
      const listEl = completionListRef.current;
      const itemEl = listEl.children[newIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  // 选择历史命令
  const handleSelectHistory = (cmd: string) => {
    onInputChange(cmd);
    setShowHistory(false);
    setSelectedHistoryIndex(-1);
    setHistorySearchQuery('');
    setHistoryAutoCompleteText('');
    resetCompletionState();
    // 焦点切换到命令输入框，并将光标移到文本末尾
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const length = cmd.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }, 50);
  };

  // 删除历史命令
  const handleDeleteHistory = (e: React.MouseEvent, cmd: string) => {
    e.stopPropagation();
    setCommandHistory(commandHistory.filter(h => h !== cmd));
  };

  // 键盘快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Ctrl 键按下（双击切换模式）
      if (e.key === 'Control') {
        const now = Date.now();
        const timeSinceLastCtrl = now - lastCtrlPressTimeRef.current;

        // 如果两次 Ctrl 按键间隔在 300ms 以内，视为双击
        if (timeSinceLastCtrl < 300 && timeSinceLastCtrl > 0) {
          e.preventDefault();
          e.stopPropagation();

          // 切换输入模式
          setIsSwitchingMode(true);
          setTimeout(() => {
            // 先读取当前模式，再更新状态，最后执行副作用
            setInputMode(prev => {
              const newMode = prev === 'terminal' ? 'input' : 'terminal';

              // 副作用放到下一个微任务，不在 state updater 中执行
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

      // Alt 键显示历史面板（仅在输入框获得焦点时）
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
          // ESC 退出自动补全模式
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
                  setSelectedHistoryIndex(-1); // 搜索查询改变时重置选中状态
                  setHistoryAutoCompleteText(''); // 重置补全文本
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredHistory.length > 0) {
                    // 按回车选择当前选中的历史命令（如果有选中），否则选择第一个
                    e.preventDefault();
                    const selectedIndex = selectedHistoryIndex >= 0 ? selectedHistoryIndex : 0;
                    handleSelectHistory(filteredHistory[selectedIndex]);
                  } else if (e.key === 'ArrowUp') {
                    // 向上选择历史命令
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      const newIndex = selectedHistoryIndex > 0 ? selectedHistoryIndex - 1 : filteredHistory.length - 1;
                      setSelectedHistoryIndex(newIndex);
                    }
                  } else if (e.key === 'ArrowDown') {
                    // 向下选择历史命令
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      const newIndex = selectedHistoryIndex < filteredHistory.length - 1 ? selectedHistoryIndex + 1 : 0;
                      setSelectedHistoryIndex(newIndex);
                    }
                  } else if (e.key === 'Tab') {
                    // 按Tab进行自动补全
                    e.preventDefault();
                    if (filteredHistory.length > 0) {
                      // 如果已经有补全文本，则确认补全
                      if (historyAutoCompleteText) {
                        setHistorySearchQuery(historySearchQuery + historyAutoCompleteText);
                        setHistoryAutoCompleteText('');
                        setSelectedHistoryIndex(0);
                      } else {
                        // 否则开始补全
                        const completion = filteredHistory[0].slice(historySearchQuery.length);
                        setHistoryAutoCompleteText(completion);
                        setSelectedHistoryIndex(0);
                      }
                    }
                  } else if (e.key === 'Escape') {
                    // ESC 关闭历史面板
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
              {/* 自动补全文本显示 */}
              {historyAutoCompleteText && (
                <div
                  className="absolute left-0 top-0 pointer-events-none font-mono text-xs select-none"
                  style={{
                    color: 'var(--text-dim)',
                    paddingLeft: '2px' // 稍微偏移以对齐
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
            {/* 输入模式指示器 */}
            <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full overflow-hidden">
              <div
                className={`w-full h-full transition-all duration-200 ${
                  inputMode === 'terminal'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              />
            </div>
            {/* 切换动画效果 */}
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
              // 当输入改变时，退出补全模式
              if (showCompletionList || isAutoCompleteMode) {
                resetCompletionState();
              }
            }}
            onKeyDown={(e) => {
              // 处理 Ctrl+C 中断命令
              if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                if (onInterrupt) {
                  onInterrupt();
                }
                return;
              }

              // 处理 Command + ↑ (Mac) 或 Ctrl + ↑ (Windows/Linux) 弹出历史窗口
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

              // 处理 Tab 自动补全
              if (e.key === 'Tab') {
                e.preventDefault();
                performAutoComplete();
                return;
              }

              // 处理上下箭头（补全列表模式下）
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

              // 处理上下箭头（正常历史浏览模式）
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                // 正常的历史浏览模式
                if (commandHistory.length > 0) {
                  const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : commandHistory.length - 1;
                  setHistoryIndex(newIndex);
                  onInputChange(commandHistory[newIndex]);
                }
                return;
              }

              if (e.key === 'ArrowDown') {
                e.preventDefault();
                // 正常的历史浏览模式
                if (historyIndex > 0) {
                  const newIndex = historyIndex - 1;
                  setHistoryIndex(newIndex);
                  onInputChange(commandHistory[newIndex]);
                } else if (historyIndex === 0) {
                  // 从第一个历史命令回到空输入
                  setHistoryIndex(-1);
                  onInputChange('');
                }
                return;
              }

              // 处理 Enter 执行命令
              if (e.key === 'Enter') {
                setHistoryIndex(-1); // 重置历史索引
                const fullCommand = inputValue + autoCompleteText; // 执行完整命令（包括补全部分）
                resetCompletionState();

                // 注意：不再预先更新目录状态
                // cd命令的目录更新将完全依赖 shell 输出的提示符解析
                // 这样可以确保只有当cd命令真正成功时，目录状态才会更新

                onExecute(fullCommand);
              }

              // 如果用户开始输入，重置相关状态
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
          {/* 自动补全文本显示（灰色提示） */}
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
          {/* 补全候选列表 */}
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
                  {/* 图标：根据类型显示不同图标 */}
                  {item.type === 'history' && (
                    <History className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {item.type === 'file' && (
                    <File className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {item.type === 'directory' && (
                    <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${completionIndex === index ? 'text-white' : 'opacity-40'}`} />
                  )}
                  {/* 显示文本 */}
                  <span
                    className={`font-mono text-xs truncate flex-1 ${completionIndex === index ? 'text-white' : ''}`}
                    style={completionIndex !== index ? { color: 'var(--text-main)' } : undefined}
                  >
                    {item.displayText}
                  </span>
                  {/* 类型标签 */}
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
