#!/usr/bin/env npx tsx
/**
 * TermCat AI Agent CLI
 *
 * 基于 ai-agent 模块的命令行客户端，用于在终端中交互式测试 AI Agent。
 * 通过 SSH 直连目标主机执行命令，将结果回报给 agent_server。
 *
 * 用法：
 *   npx tsx src/modules/ai-agent/cli/cli-agent.ts [options]
 *
 * Options:
 *   --server <url>        API/WS server URL (default: http://localhost:5001)
 *   --email <email>       Login email
 *   --password <pwd>      Login password
 *   --host <host>         SSH target host (required for command execution)
 *   --ssh-port <port>     SSH port (default: 22)
 *   --ssh-user <user>     SSH username
 *   --ssh-password <pwd>  SSH password
 *   --ssh-key <path>      SSH private key file path (e.g. ~/.ssh/id_rsa)
 *   --mode <mode>         AI mode: agent | normal (default: agent)
 *   --model <model>       AI model name (default: glm-4-flash)
 *   --session <id>        Session ID (default: cli-<timestamp>)
 *   --auto                Enable auto-execute mode
 *   --debug               Show raw WebSocket messages
 *   --log <file>          Write execution log to file (JSON Lines format)
 */

// 必须在其他 import 之前安装 WebSocket
import { installWebSocket } from './NodeWebSocket';
installWebSocket();

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIAgentConnection } from '../AIAgentConnection';
import { AIAgent } from '../AIAgent';
import { NodeSSHShellExecutor, OSInfo } from '../executors/NodeSSHShellExecutor';
import { MockExecutor } from '../executors/MockExecutor';
import { TerminalRenderer } from './TerminalRenderer';
import type { OperationStep, ChoiceData, TokenUsage, RiskLevel, AIAgentMode, StepDetailEvent } from '../types';
import type { ICommandExecutor } from '../ICommandExecutor';

// ==================== 参数解析 ====================

interface CliOptions {
  server: string;
  email: string;
  password: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  sshKey: string;
  mode: AIAgentMode;
  model: string;
  sessionId: string;
  auto: boolean;
  debug: boolean;
  logFile: string;
}

/**
 * 解析布尔 flag，支持三种形式：
 *   --debug         → true（后面不跟值或跟其他 flag）
 *   --debug true    → true
 *   --debug false   → false
 *
 * 返回 { value, skip }，skip 表示是否消费了下一个参数。
 */
function parseBoolFlag(args: string[], currentIndex: number): { value: boolean; skip: boolean } {
  const next = args[currentIndex + 1];
  if (next === 'true') {
    return { value: true, skip: true };
  }
  if (next === 'false') {
    return { value: false, skip: true };
  }
  // 没有值或下一个是另一个 flag → 视为 true
  return { value: true, skip: false };
}

function parseArgs(): Partial<CliOptions> {
  const args = process.argv.slice(2);
  const opts: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server':
        opts.server = args[++i];
        break;
      case '--email':
        opts.email = args[++i];
        break;
      case '--password':
        opts.password = args[++i];
        break;
      case '--host':
        opts.sshHost = args[++i];
        break;
      case '--ssh-port':
        opts.sshPort = parseInt(args[++i], 10);
        break;
      case '--ssh-user':
        opts.sshUser = args[++i];
        break;
      case '--ssh-password':
        opts.sshPassword = args[++i];
        break;
      case '--ssh-key':
      case '--ssh-identity':
      case '-i':
        opts.sshKey = args[++i];
        break;
      case '--mode':
        opts.mode = args[++i] as AIAgentMode;
        break;
      case '--model':
        opts.model = args[++i];
        break;
      case '--session':
        opts.sessionId = args[++i];
        break;
      case '--auto': {
        const r = parseBoolFlag(args, i);
        opts.auto = r.value;
        if (r.skip) i++;
        break;
      }
      case '--debug': {
        const r = parseBoolFlag(args, i);
        opts.debug = r.value;
        if (r.skip) i++;
        break;
      }
      case '--log':
        opts.logFile = args[++i];
        break;
      case '--help':
        printUsage();
        process.exit(0);
    }
  }
  return opts;
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/modules/ai-agent/cli/cli-agent.ts [options]

Options:
  --server <url>        API/WS server URL (default: http://localhost:5001)
  --email <email>       Login email
  --password <pwd>      Login password

  --host <host>         SSH target host (required for command execution)
  --ssh-port <port>     SSH port (default: 22)
  --ssh-user <user>     SSH username
  --ssh-password <pwd>  SSH password
  --ssh-key <path>      SSH private key file path (e.g. ~/.ssh/id_rsa)
  -i <path>             Alias for --ssh-key

  --mode <mode>         AI mode: agent | normal (default: agent)
  --model <model>       AI model name (default: glm-4-flash)
  --session <id>        Session ID (default: cli-<timestamp>)
  --auto                Enable auto-execute mode (skip confirmation)
  --debug               Show raw WebSocket messages
  --log <file>          Write execution log to file (JSON Lines format)
  --help                Show this help
`);
}

// ==================== 登录 ====================

async function login(serverUrl: string, email: string, password: string): Promise<string> {
  const url = `${serverUrl}/api/v1/auth/login`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Login failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const token = data.token || data.data?.token;
  if (!token) {
    throw new Error(`Login response missing token: ${JSON.stringify(data)}`);
  }
  return token;
}

// ==================== Readline 工具 ====================

function createMainRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/** 复用主 readline 进行单次确认 */
let _mainRl: readline.Interface | null = null;

function setMainRL(rl: readline.Interface): void {
  _mainRl = rl;
}

/**
 * confirmQuestion 支持取消机制。
 * 返回 null 表示被取消，调用方应跳过后续处理。
 */
let _confirmGeneration = 0;
let _activeConfirm: { gen: number; resolve: (v: string | null) => void } | null = null;

function confirmQuestion(prompt: string): Promise<string | null> {
  const gen = ++_confirmGeneration;
  return new Promise((resolve) => {
    if (!_mainRl) {
      resolve('');
      return;
    }
    _activeConfirm = { gen, resolve };
    _mainRl.question(prompt, (answer) => {
      if (gen !== _confirmGeneration) {
        // 已被取消（generation 不匹配），忽略用户输入
        return;
      }
      _activeConfirm = null;
      resolve(answer.trim());
    });
  });
}

/**
 * 取消当前活跃的 confirmQuestion。
 * 清除 readline 提示行，并以 null 解析 promise。
 */
function cancelActiveConfirm(): void {
  _confirmGeneration++;
  if (_activeConfirm) {
    const { resolve } = _activeConfirm;
    _activeConfirm = null;
    // 清除当前行的提示文本
    process.stderr.write('\r\x1b[K');
    resolve(null);
  }
}

function askPassword(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    process.stderr.write(prompt);
    let password = '';

    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) {
          stdin.setRawMode(wasRaw ?? false);
        }
        process.stderr.write('\n');
        rl.resume();
        resolve(password);
      } else if (c === '\x7f' || c === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stderr.write('\b \b');
        }
      } else if (c === '\x03') {
        process.exit(0);
      } else {
        password += c;
        process.stderr.write('*');
      }
    };

    rl.pause();
    stdin.resume();
    stdin.on('data', onData);
  });
}

// ==================== 主程序 ====================

async function main(): Promise<void> {
  const renderer = new TerminalRenderer();
  renderer.printBanner();

  const cliOpts = parseArgs();
  const serverUrl = cliOpts.server || 'http://localhost:5001';
  const wsUrl = serverUrl.replace(/^http/, 'ws');
  let mode: AIAgentMode = cliOpts.mode || 'agent';
  let model = cliOpts.model || 'glm-4-flash';
  const sessionId = cliOpts.sessionId || `cli-${Date.now()}`;
  let autoExecute = cliOpts.auto || false;
  const debug = cliOpts.debug || false;

  // ==================== 日志文件 ====================

  let logStream: fs.WriteStream | null = null;
  if (cliOpts.logFile) {
    const logPath = cliOpts.logFile.startsWith('~')
      ? path.join(os.homedir(), cliOpts.logFile.slice(1))
      : path.resolve(cliOpts.logFile);
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(JSON.stringify({ event: 'session_start', ts: new Date().toISOString(), sessionId }) + '\n');
    renderer.printInfo(`Log file: ${logPath}`);
  }

  function writeLog(entry: Record<string, any>): void {
    if (!logStream) return;
    logStream.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  }

  renderer.printServerInfo(serverUrl, wsUrl);

  const rl = createMainRL();
  setMainRL(rl);

  // ==================== 登录 ====================

  let email = cliOpts.email || '';
  let password = cliOpts.password || '';

  if (!email) {
    email = await ask(rl, 'Email: ');
  }
  if (!password) {
    password = await askPassword(rl, 'Password: ');
  }

  let token: string;
  try {
    token = await login(serverUrl, email, password);
    renderer.printSuccess('Login successful');
  } catch (err: any) {
    renderer.printError(`Login failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // ==================== SSH 连接 ====================

  let sshHost = cliOpts.sshHost || '';
  let sshUser = cliOpts.sshUser || '';
  let sshPassword = cliOpts.sshPassword || '';
  let sshKeyPath = cliOpts.sshKey || '';
  const sshPort = cliOpts.sshPort || 22;

  if (!sshHost) {
    sshHost = await ask(rl, 'SSH Host: ');
  }
  if (!sshUser) {
    sshUser = await ask(rl, 'SSH User: ');
  }

  // 认证方式：优先使用私钥，其次密码
  let sshPrivateKey: string | undefined;

  if (sshKeyPath) {
    // 命令行指定了私钥路径
    const resolvedPath = sshKeyPath.startsWith('~')
      ? path.join(os.homedir(), sshKeyPath.slice(1))
      : path.resolve(sshKeyPath);
    try {
      sshPrivateKey = fs.readFileSync(resolvedPath, 'utf-8');
      renderer.printInfo(`Using SSH key: ${resolvedPath}`);
    } catch (err: any) {
      renderer.printError(`Failed to read SSH key: ${resolvedPath} (${err.message})`);
      process.exit(1);
    }
  } else if (!sshPassword) {
    // 未指定私钥也未指定密码，检查默认私钥文件
    const defaultKeys = ['id_rsa', 'id_ed25519', 'id_ecdsa'];
    for (const keyName of defaultKeys) {
      const keyPath = path.join(os.homedir(), '.ssh', keyName);
      if (fs.existsSync(keyPath)) {
        try {
          sshPrivateKey = fs.readFileSync(keyPath, 'utf-8');
          renderer.printInfo(`Using default SSH key: ${keyPath}`);
          break;
        } catch {
          // 无法读取，跳过
        }
      }
    }

    // 如果没有找到任何默认私钥，提示输入密码
    if (!sshPrivateKey) {
      sshPassword = await askPassword(rl, 'SSH Password (or use --ssh-key): ');
    }
  }

  let executor: ICommandExecutor;
  let osInfo: OSInfo | undefined;

  if (sshHost) {
    const sshConfig: { host: string; port: number; username: string; password?: string; privateKey?: string } = {
      host: sshHost,
      port: sshPort,
      username: sshUser,
    };

    if (sshPrivateKey) {
      sshConfig.privateKey = sshPrivateKey;
    } else {
      sshConfig.password = sshPassword;
    }

    const sshExecutor = new NodeSSHShellExecutor(sshConfig);

    try {
      await sshExecutor.initialize();
      const authMethod = sshPrivateKey ? 'key' : 'password';
      renderer.printSuccess(`SSH connected to ${sshUser}@${sshHost}:${sshPort} (${authMethod})`);
      executor = sshExecutor;

      // 检测远程服务器操作系统信息
      osInfo = await sshExecutor.detectOSInfo();
      if (osInfo) {
        renderer.printInfo(`Remote OS: ${osInfo.osType} ${osInfo.osVersion} (${osInfo.shell})`);
      }
    } catch (err: any) {
      renderer.printError(`SSH connection failed: ${err.message}`);
      renderer.printWarning('Falling back to mock executor (commands will not actually run)');
      const mock = new MockExecutor({ delayMs: 0 });
      await mock.initialize();
      executor = mock;
    }
  } else {
    renderer.printWarning('No SSH host specified, using mock executor');
    const mock = new MockExecutor({ delayMs: 0 });
    await mock.initialize();
    executor = mock;
  }

  // ==================== WebSocket 连接 ====================

  const connection = new AIAgentConnection({
    wsUrl,
    token,
    maxReconnectAttempts: 0,
    reconnectDelay: 2000,
  });

  if (debug || logStream) {
    connection.onMessage((msg) => {
      if (debug) {
        const fields = [
          `type=${msg.type}`,
          `task_id=${msg.task_id || '-'}`,
          msg.session_id ? `session_id=${msg.session_id}` : null,
          msg.step_index !== undefined ? `step_index=${msg.step_index}` : null,
          msg.command ? `command=${msg.command}` : null,
          msg.status ? `status=${msg.status}` : null,
          msg.risk ? `risk=${msg.risk}` : null,
          msg.summary ? `summary=${msg.summary}` : null,
        ].filter(Boolean).join(' ');
        console.log(`\x1b[90m[WS] ${fields}\x1b[0m`);
      }
      writeLog({ event: 'ws_message', ...msg });
    });
  }

  try {
    await Promise.race([
      connection.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
      ),
    ]);
    renderer.printSuccess('WebSocket connected');
  } catch (err: any) {
    renderer.printError(`WebSocket connection failed: ${err.message}`);
    renderer.printInfo(`Attempted: ${wsUrl}/ws/ai`);
    connection.disconnect();
    rl.close();
    process.exit(1);
  }

  // ==================== 创建 Agent ====================

  const agent = new AIAgent(connection, {
    mode,
    model,
    sessionId,
    osType: osInfo?.osType,
    osVersion: osInfo?.osVersion,
    shell: osInfo?.shell,
  });
  agent.setExecutor(executor);

  if (autoExecute) {
    agent.enableAutoExecute();
    agent.enableAutoChoice();
    renderer.printInfo('Auto-execute mode enabled');
  }

  // REPL ←→ 事件 协调
  let replResolve: (() => void) | null = null;
  let taskDone = false;

  function waitForTask(): Promise<void> {
    if (taskDone) {
      taskDone = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => { replResolve = resolve; });
  }

  function notifyReplResume(): void {
    if (debug) {
      renderer.printInfo(`[REPL] notifyReplResume called, replResolve=${!!replResolve}, taskDone=${taskDone}`);
    }
    taskDone = true;
    if (replResolve) {
      const resolve = replResolve;
      replResolve = null;
      resolve();
    }
  }

  // 交互请求去重：记录已显示的选择请求和执行请求
  const displayedChoices = new Set<string>();
  const displayedExecutions = new Set<string>();

  // 交互状态锁：防止多个交互提示同时争抢 readline
  let pendingInteraction: 'none' | 'execute' | 'choice' | 'interactive' = 'none';

  interface PendingItem {
    type: 'execute' | 'choice' | 'interactive';
    stepIndex?: number;
    detail?: StepDetailEvent;
    data?: ChoiceData;
    prompt?: string;
    command?: string;
    risk?: RiskLevel;
  }

  const pendingQueue: PendingItem[] = [];

  function processPendingQueue(): void {
    if (pendingQueue.length === 0) return;
    const next = pendingQueue.shift()!;
    switch (next.type) {
      case 'execute':
        if (next.detail) {
          agent.emit('step:detail', next.stepIndex!, next.detail);
        } else if (next.command) {
          agent.emit('execute:request', next.stepIndex!, next.command, next.risk || 'low');
        }
        break;
      case 'choice':
        agent.emit('choice:request', next.stepIndex!, next.data!);
        break;
      case 'interactive':
        if ('emit' in executor && typeof executor.emit === 'function') {
          executor.emit('interactive:prompt', next.prompt!);
        }
        break;
    }
  }

  // ==================== 命令执行辅助 ====================

  /**
   * 执行命令并将结果发回 agent_server
   *
   * 服务端通过 step_detail 告知待执行命令，客户端执行后通过
   * agent.submitExecuteResult() 回报结果。
   */
  async function executeAndReport(stepIndex: number, command: string): Promise<void> {
    renderer.startSpinner(`Executing: ${command}`);
    writeLog({ event: 'exec_start', stepIndex, command });

    try {
      const result = await executor.execute(command);
      renderer.stopSpinner();
      // 命令执行完毕后，取消可能残留的交互式提示（executor 超时自动处理了，readline 还在等）
      if (pendingInteraction === 'interactive') {
        cancelActiveConfirm();
        pendingInteraction = 'none';
      }
      renderer.printStepResult(stepIndex, result.success, result.output);
      writeLog({ event: 'exec_result', stepIndex, command, success: result.success, exitCode: result.exitCode, output: result.output });
      agent.submitExecuteResult(stepIndex, command, result);
    } catch (err: any) {
      renderer.stopSpinner();
      // 命令执行失败后也取消残留的交互式提示
      if (pendingInteraction === 'interactive') {
        cancelActiveConfirm();
        pendingInteraction = 'none';
      }
      const errorMsg = err.message || String(err);
      renderer.printError(`Execution error: ${errorMsg}`);
      writeLog({ event: 'exec_error', stepIndex, command, error: errorMsg });
      agent.submitExecuteResult(stepIndex, command, {
        success: false,
        output: '',
        exitCode: -1,
      }, errorMsg);
    }
  }

  // ==================== 事件监听 ====================

  // 监听 executor 的交互式提示事件（仅 BaseShellExecutor 支持）
  if ('on' in executor && typeof executor.on === 'function') {
    executor.on('interactive:prompt', (prompt: string) => {
      // 如果当前有交互正在进行，将交互请求排队
      if (pendingInteraction !== 'none') {
        pendingQueue.push({ type: 'interactive', prompt });
        return;
      }
      pendingInteraction = 'interactive';

      renderer.stopSpinner();
      console.log('\n');
      renderer.printWarning('⚠️  Command requires interactive confirmation:');
      console.log('\x1b[90m' + prompt + '\x1b[0m'); // 灰色显示提示内容
      console.log('');
      confirmQuestion('Your response [y/n] (or press Enter to auto-confirm "y" in 30s): ').then((response) => {
        if (response === null) {
          // 被取消（命令已执行完毕），不需要再处理
          // pendingInteraction 已在 cancelActiveConfirm 调用处重置
          return;
        }
        if (response.trim() && 'sendInteractiveResponse' in executor && typeof executor.sendInteractiveResponse === 'function') {
          // 用户输入了响应
          executor.sendInteractiveResponse(response.trim());
        }
        // 如果用户没输入（直接回车），让 executor 的 30 秒超时自动处理
        pendingInteraction = 'none';
        processPendingQueue();
      });
    });
  }

  let isStreaming = false;

  agent.on('status:change', (status: string) => {
    if (status === 'thinking') {
      renderer.startSpinner('Thinking...');
    } else if (status === 'generating') {
      renderer.stopSpinner();
      if (!isStreaming) {
        isStreaming = true;
        console.log();
      }
    } else if (status === 'idle') {
      renderer.stopSpinner();
    }
  });

  agent.on('answer:chunk', (content: string, isComplete: boolean) => {
    renderer.writeChunk(content);
    if (isComplete) {
      renderer.newLine();
      isStreaming = false;
    }
  });

  agent.on('plan', (plan: OperationStep[], description: string) => {
    renderer.stopSpinner();
    if (description) {
      console.log(`\n${description}`);
    }
    renderer.printPlan(plan);
  });

  // execute:request 事件（某些服务端版本可能发送此消息）
  agent.on('execute:request', (stepIndex: number, command: string, risk: RiskLevel) => {
    renderer.stopSpinner();
    if (autoExecute) return; // 自动模式下 AIAgent 内部处理

    // 生成唯一标识，防止重复显示
    const execKey = `${stepIndex}:${command}`;
    if (displayedExecutions.has(execKey)) {
      return; // 已经显示过，忽略重复消息
    }
    displayedExecutions.add(execKey);

    // 如果当前有交互正在进行，将执行请求排队
    if (pendingInteraction !== 'none') {
      pendingQueue.push({ type: 'execute', stepIndex, command, risk });
      return;
    }
    pendingInteraction = 'execute';

    const prompt = renderer.printExecutePrompt(stepIndex, command, risk);
    confirmQuestion(prompt).then((answer) => {
      if (answer === null) return; // 被取消
      if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        agent.cancelExecute(stepIndex);
        renderer.printWarning(`Step ${stepIndex + 1} cancelled`);
      } else {
        executeAndReport(stepIndex, command);
      }
      pendingInteraction = 'none';
      processPendingQueue();
    });
  });

  /**
   * step_detail 事件处理 —— 核心执行触发点
   *
   * 服务端协议：发送 step_detail（携带 command）表示"请客户端执行此命令"，
   * 然后保持连接等待 confirm_execute 结果。
   *
   * 当 step_detail 携带 command 且 status 不是 completed/error 时，
   * 视为执行请求。
   */
  agent.on('step:detail', (stepIndex: number, detail: StepDetailEvent) => {
    // 已完成、已出错或已失败的步骤：结果由 executeAndReport 负责展示，此处跳过
    if (detail.status === 'completed' || detail.status === 'error' || detail.status === 'failed') {
      return;
    }

    // 有命令的步骤：触发执行
    if (detail.command) {
      renderer.stopSpinner();
      const command = detail.command;
      const risk = detail.risk || 'low';

      // 生成唯一标识，防止重复显示
      const execKey = `${stepIndex}:${command}`;
      if (displayedExecutions.has(execKey)) {
        return; // 已经显示过，忽略重复消息
      }
      displayedExecutions.add(execKey);

      if (autoExecute) {
        // 自动模式：直接执行
        executeAndReport(stepIndex, command);
        return;
      }

      // 如果当前有交互正在进行，将执行请求排队
      if (pendingInteraction !== 'none') {
        pendingQueue.push({ type: 'execute', stepIndex, detail });
        return;
      }
      pendingInteraction = 'execute';

      // 手动模式：确认后执行
      const prompt = renderer.printExecutePrompt(stepIndex, command, risk);
      confirmQuestion(prompt).then((answer) => {
        if (answer === null) return; // 被取消
        if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
          agent.cancelExecute(stepIndex);
          renderer.printWarning(`Step ${stepIndex + 1} skipped`);
        } else {
          executeAndReport(stepIndex, command);
        }
        pendingInteraction = 'none';
        processPendingQueue();
      });
    }
  });

  agent.on('choice:request', (stepIndex: number, data: ChoiceData) => {
    renderer.stopSpinner();
    if (autoExecute) return;

    // 生成唯一标识，防止重复显示
    const choiceKey = `${stepIndex}:${data.question}`;
    if (displayedChoices.has(choiceKey)) {
      // 已经显示过这个选择请求，忽略重复消息
      return;
    }
    displayedChoices.add(choiceKey);

    // 如果当前有交互正在进行，将选择请求排队
    if (pendingInteraction !== 'none') {
      pendingQueue.push({ type: 'choice', stepIndex, data });
      return;
    }
    pendingInteraction = 'choice';

    renderer.printChoicePrompt(data.question, data.options);
    confirmQuestion(`\nSelect (1-${data.options.length}): `).then((choiceStr) => {
      if (choiceStr === null) return; // 被取消
      const choiceIdx = parseInt(choiceStr, 10) - 1;
      if (choiceIdx >= 0 && choiceIdx < data.options.length) {
        agent.sendUserChoice(stepIndex, data.options[choiceIdx].value);
      } else {
        agent.sendUserChoice(stepIndex, data.options[0]?.value || '');
      }
      pendingInteraction = 'none';
      processPendingQueue();
    });
  });

  agent.on('token:usage', (usage: TokenUsage) => {
    renderer.printTokenUsage(usage);
  });

  agent.on('task:complete', (summary: string) => {
    renderer.stopSpinner();
    cancelActiveConfirm(); // 取消任何残留的 readline 提示
    renderer.printTaskComplete(summary);
    isStreaming = false;
    displayedChoices.clear(); // 清理已显示的选择记录
    displayedExecutions.clear(); // 清理已显示的执行记录
    pendingInteraction = 'none'; // 重置交互锁
    pendingQueue.length = 0; // 清空排队的交互请求
    notifyReplResume();
  });

  agent.on('task:error', (error: string) => {
    renderer.stopSpinner();
    cancelActiveConfirm(); // 取消任何残留的 readline 提示
    renderer.printError(`Task error: ${error}`);
    isStreaming = false;
    displayedChoices.clear(); // 清理已显示的选择记录
    displayedExecutions.clear(); // 清理已显示的执行记录
    pendingInteraction = 'none'; // 重置交互锁
    pendingQueue.length = 0; // 清空排队的交互请求
    notifyReplResume();
  });

  // ==================== REPL 循环 ====================

  renderer.newLine();
  renderer.printModeInfo(mode, model);
  renderer.printInfo('Type /help for commands, /quit to exit');
  renderer.newLine();

  const runRepl = async () => {
    while (true) {
      let userInput: string;
      try {
        userInput = await ask(rl, '> ');
      } catch {
        break;
      }

      if (!userInput) continue;

      // 特殊命令
      if (userInput.startsWith('/')) {
        const parts = userInput.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
          case '/quit':
          case '/exit':
          case '/q':
            renderer.printInfo('Bye!');
            agent.destroy();
            connection.disconnect();
            await executor.cleanup();
            rl.close();
            process.exit(0);
            break;

          case '/help':
            renderer.printHelp();
            break;

          case '/mode': {
            const newMode = parts[1] as AIAgentMode;
            if (newMode === 'agent' || newMode === 'normal') {
              mode = newMode;
              agent.configure({ mode });
              renderer.printSuccess(`Mode switched to: ${mode}`);
            } else {
              renderer.printError('Usage: /mode agent|normal');
            }
            break;
          }

          case '/model': {
            const newModel = parts[1];
            if (newModel) {
              model = newModel;
              agent.configure({ model });
              renderer.printSuccess(`Model switched to: ${model}`);
            } else {
              renderer.printError('Usage: /model <name>');
            }
            break;
          }

          case '/auto':
            autoExecute = !autoExecute;
            if (autoExecute) {
              agent.enableAutoExecute();
              agent.enableAutoChoice();
              renderer.printSuccess('Auto-execute mode enabled');
            } else {
              agent.disableAutoExecute();
              agent.disableAutoChoice();
              renderer.printSuccess('Auto-execute mode disabled');
            }
            break;

          case '/status':
            renderer.printModeInfo(mode, model);
            renderer.printInfo(`Session: ${sessionId}`);
            const authInfo = sshPrivateKey ? 'key' : 'password';
            renderer.printInfo(`SSH: ${sshHost ? `${sshUser}@${sshHost}:${sshPort} (${authInfo})` : 'not connected'}`);
            renderer.printInfo(`Auto-execute: ${autoExecute ? 'on' : 'off'}`);
            renderer.printInfo(`Agent status: ${agent.getStatus()}`);
            break;

          case '/stop':
            agent.stop();
            renderer.printWarning('Task stopped');
            notifyReplResume();
            break;

          default:
            renderer.printError(`Unknown command: ${cmd}. Type /help for help.`);
        }
        continue;
      }

      // 发送问题，等待任务完成
      taskDone = false;
      if (debug) {
        renderer.printInfo(`[REPL] Sending question, ws=${connection.isConnected()}, agentStatus=${agent.getStatus()}`);
      }
      try {
        if (!connection.isConnected()) {
          renderer.printError('WebSocket disconnected, cannot send question.');
          continue;
        }
        writeLog({ event: 'user_question', question: userInput });
        agent.ask(userInput);
      } catch (err: any) {
        renderer.printError(`Failed to send question: ${err.message}`);
        continue;
      }
      if (debug) {
        renderer.printInfo(`[REPL] Waiting for task completion...`);
      }
      await waitForTask();
      if (debug) {
        renderer.printInfo(`[REPL] Task done, returning to prompt.`);
      }
    }
  };

  try {
    await runRepl();
  } catch (err: any) {
    renderer.printError(`Unexpected error: ${err.message}`);
  } finally {
    writeLog({ event: 'session_end', ts: new Date().toISOString() });
    agent.destroy();
    connection.disconnect();
    await executor.cleanup();
    rl.close();
    if (logStream) {
      logStream.end();
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
