#!/usr/bin/env npx tsx
/**
 * TermCat AI Agent CLI
 *
 * Command-line client based on ai-agent module, used for interactive testing of AI Agent in terminal.
 * Executes commands by SSH directly to target host, reports results back to agent_server.
 *
 * Usage:
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

// Must install WebSocket before other imports
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

// ==================== Argument Parsing ====================

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
 * Parse boolean flag, supports three forms:
 *   --debug         → true (no value follows or followed by another flag)
 *   --debug true    → true
 *   --debug false   → false
 *
 * Returns { value, skip }, where skip indicates whether next argument was consumed.
 */
function parseBoolFlag(args: string[], currentIndex: number): { value: boolean; skip: boolean } {
  const next = args[currentIndex + 1];
  if (next === 'true') {
    return { value: true, skip: true };
  }
  if (next === 'false') {
    return { value: false, skip: true };
  }
  // No value or next is another flag → treat as true
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

// ==================== Login ====================

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

// ==================== Readline Utilities ====================

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

/** Reuse main readline for single confirmation */
let _mainRl: readline.Interface | null = null;

function setMainRL(rl: readline.Interface): void {
  _mainRl = rl;
}

/**
 * confirmQuestion supports cancellation mechanism.
 * Returns null if cancelled, caller should skip subsequent processing.
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
        // Cancelled (generation doesn't match), ignore user input
        return;
      }
      _activeConfirm = null;
      resolve(answer.trim());
    });
  });
}

/**
 * Cancel currently active confirmQuestion.
 * Clears readline prompt line, resolves promise with null.
 */
function cancelActiveConfirm(): void {
  _confirmGeneration++;
  if (_activeConfirm) {
    const { resolve } = _activeConfirm;
    _activeConfirm = null;
    // Clear current line prompt text
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

// ==================== Main Program ====================

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

  // ==================== Log File ====================

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

  // ==================== Login ====================

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

  // ==================== SSH Connection ====================

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

  // Auth method: prefer private key, then password
  let sshPrivateKey: string | undefined;

  if (sshKeyPath) {
    // Private key path specified on command line
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
    // No private key or password specified, check default private key files
    const defaultKeys = ['id_rsa', 'id_ed25519', 'id_ecdsa'];
    for (const keyName of defaultKeys) {
      const keyPath = path.join(os.homedir(), '.ssh', keyName);
      if (fs.existsSync(keyPath)) {
        try {
          sshPrivateKey = fs.readFileSync(keyPath, 'utf-8');
          renderer.printInfo(`Using default SSH key: ${keyPath}`);
          break;
        } catch {
          // Can't read, skip
        }
      }
    }

    // If no default private key found, prompt for password
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

      // Detect remote server OS info
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

  // ==================== WebSocket Connection ====================

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

  // ==================== Create Agent ====================

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

  // REPL ↔ Event coordination
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

  // Deduplicate interaction requests: track displayed choice requests and execution requests
  const displayedChoices = new Set<string>();
  const displayedExecutions = new Set<string>();

  // Interaction state lock: prevent multiple interaction prompts competing for readline simultaneously
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

  // ==================== Command Execution Helper ====================

  /**
   * Execute command and report result back to agent_server
   *
   * Server notifies pending command via step_detail, client executes and reports
   * result via agent.submitExecuteResult().
   */
  async function executeAndReport(stepIndex: number, command: string): Promise<void> {
    renderer.startSpinner(`Executing: ${command}`);
    writeLog({ event: 'exec_start', stepIndex, command });

    try {
      const result = await executor.execute(command);
      renderer.stopSpinner();
      // After command execution completes, cancel any residual interactive prompts
      // (executor timeout auto-handles, but readline is still waiting)
      if (pendingInteraction === 'interactive') {
        cancelActiveConfirm();
        pendingInteraction = 'none';
      }
      renderer.printStepResult(stepIndex, result.success, result.output);
      writeLog({ event: 'exec_result', stepIndex, command, success: result.success, exitCode: result.exitCode, output: result.output });
      agent.submitExecuteResult(stepIndex, command, result);
    } catch (err: any) {
      renderer.stopSpinner();
      // Also cancel residual interactive prompts after command execution failure
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

  // ==================== Event Listeners ====================

  // Listen to executor's interactive prompt events (only BaseShellExecutor supports)
  if ('on' in executor && typeof executor.on === 'function') {
    executor.on('interactive:prompt', (prompt: string) => {
      // If interaction is in progress, queue the interaction request
      if (pendingInteraction !== 'none') {
        pendingQueue.push({ type: 'interactive', prompt });
        return;
      }
      pendingInteraction = 'interactive';

      renderer.stopSpinner();
      console.log('\n');
      renderer.printWarning('⚠️  Command requires interactive confirmation:');
      console.log('\x1b[90m' + prompt + '\x1b[0m'); // Show prompt in gray
      console.log('');
      confirmQuestion('Your response [y/n] (or press Enter to auto-confirm "y" in 30s): ').then((response) => {
        if (response === null) {
          // Cancelled (command has completed), no need to process further
          // pendingInteraction has been reset in cancelActiveConfirm call
          return;
        }
        if (response.trim() && 'sendInteractiveResponse' in executor && typeof executor.sendInteractiveResponse === 'function') {
          // User entered response
          executor.sendInteractiveResponse(response.trim());
        }
        // If user didn't input (just pressed Enter), let executor's 30-second timeout handle it automatically
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

  // execute:request event (some server versions may send this message)
  agent.on('execute:request', (stepIndex: number, command: string, risk: RiskLevel) => {
    renderer.stopSpinner();
    if (autoExecute) return; // AIAgent handles internally in auto mode

    // Generate unique key to prevent duplicate display
    const execKey = `${stepIndex}:${command}`;
    if (displayedExecutions.has(execKey)) {
      return; // Already displayed, ignore duplicate message
    }
    displayedExecutions.add(execKey);

    // If interaction is in progress, queue the execution request
    if (pendingInteraction !== 'none') {
      pendingQueue.push({ type: 'execute', stepIndex, command, risk });
      return;
    }
    pendingInteraction = 'execute';

    const prompt = renderer.printExecutePrompt(stepIndex, command, risk);
    confirmQuestion(prompt).then((answer) => {
      if (answer === null) return; // Cancelled
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
   * step:detail event handling —— Core execution trigger point
   *
   * Server protocol: sends step_detail (with command) to mean "please client execute this command",
   * then keeps connection waiting for confirm_execute result.
   *
   * When step_detail carries command and status is not completed/error,
   * treat as execution request.
   */
  agent.on('step:detail', (stepIndex: number, detail: StepDetailEvent) => {
    // Completed, errored, or failed steps: result is displayed by executeAndReport, skip here
    if (detail.status === 'completed' || detail.status === 'error' || detail.status === 'failed') {
      return;
    }

    // Steps with command: trigger execution
    if (detail.command) {
      renderer.stopSpinner();
      const command = detail.command;
      const risk = detail.risk || 'low';

      // Generate unique key to prevent duplicate display
      const execKey = `${stepIndex}:${command}`;
      if (displayedExecutions.has(execKey)) {
        return; // Already displayed, ignore duplicate message
      }
      displayedExecutions.add(execKey);

      if (autoExecute) {
        // Auto mode: execute directly
        executeAndReport(stepIndex, command);
        return;
      }

      // If interaction is in progress, queue the execution request
      if (pendingInteraction !== 'none') {
        pendingQueue.push({ type: 'execute', stepIndex, detail });
        return;
      }
      pendingInteraction = 'execute';

      // Manual mode: confirm then execute
      const prompt = renderer.printExecutePrompt(stepIndex, command, risk);
      confirmQuestion(prompt).then((answer) => {
        if (answer === null) return; // Cancelled
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

    // Generate unique key to prevent duplicate display
    const choiceKey = `${stepIndex}:${data.question}`;
    if (displayedChoices.has(choiceKey)) {
      // Already displayed this choice request, ignore duplicate message
      return;
    }
    displayedChoices.add(choiceKey);

    // If interaction is in progress, queue the choice request
    if (pendingInteraction !== 'none') {
      pendingQueue.push({ type: 'choice', stepIndex, data });
      return;
    }
    pendingInteraction = 'choice';

    renderer.printChoicePrompt(data.question, data.options);
    confirmQuestion(`\nSelect (1-${data.options.length}): `).then((choiceStr) => {
      if (choiceStr === null) return; // Cancelled
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
    cancelActiveConfirm(); // Cancel any residual readline prompts
    renderer.printTaskComplete(summary);
    isStreaming = false;
    displayedChoices.clear(); // Clear displayed choice records
    displayedExecutions.clear(); // Clear displayed execution records
    pendingInteraction = 'none'; // Reset interaction lock
    pendingQueue.length = 0; // Clear queued interaction requests
    notifyReplResume();
  });

  agent.on('task:error', (error: string) => {
    renderer.stopSpinner();
    cancelActiveConfirm(); // Cancel any residual readline prompts
    renderer.printError(`Task error: ${error}`);
    isStreaming = false;
    displayedChoices.clear(); // Clear displayed choice records
    displayedExecutions.clear(); // Clear displayed execution records
    pendingInteraction = 'none'; // Reset interaction lock
    pendingQueue.length = 0; // Clear queued interaction requests
    notifyReplResume();
  });

  // ==================== REPL Loop ====================

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

      // Special commands
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

      // Send question, wait for task completion
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
