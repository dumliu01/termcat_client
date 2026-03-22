/**
 * AI Agent 独立模块
 *
 * 无 UI 依赖的 AI Agent 核心实现，可在命令行/headless 环境运行。
 * UI 层通过订阅事件实现展示。
 *
 * 使用示例：
 *
 * ```typescript
 * import { AIAgent, AIAgentConnection, ElectronShellExecutor } from '@/modules/ai-agent';
 *
 * // 1. 建立 WebSocket 连接
 * const connection = new AIAgentConnection({ wsUrl: 'ws://localhost:8080', token: 'xxx' });
 * await connection.connect();
 *
 * // 2. 创建 Agent
 * const agent = new AIAgent(connection, {
 *   mode: 'agent',
 *   model: 'glm-4-flash',
 *   sessionId: 'session-123',
 * });
 *
 * // 3. 设置命令执行器
 * const executor = new ElectronShellExecutor({ sessionId: 'session-123', sshMode: 'independent' });
 * agent.setExecutor(executor);
 *
 * // 4. 监听事件
 * agent.on('answer:chunk', (content, isComplete) => console.log(content));
 * agent.on('plan', (plan) => console.log('Plan:', plan));
 * agent.on('execute:request', (stepIndex, command, risk) => {
 *   agent.confirmExecute(stepIndex, command);
 * });
 *
 * // 5. 或启用自动模式（headless）
 * agent.enableAutoExecute();
 * agent.enableAutoChoice();
 *
 * // 6. 发送提问
 * agent.ask('检查 nginx 状态并重启');
 * ```
 */

// 核心类
export { AIAgent } from './AIAgent';
export { AIAgentConnection } from './AIAgentConnection';

// 接口
export type { ICommandExecutor } from './ICommandExecutor';
export type { ExecuteOptions } from './ICommandExecutor';

// 执行器
export { ElectronShellExecutor } from './executors/ElectronShellExecutor';
export type { ElectronShellExecutorConfig, ElectronShellAPI } from './executors/ElectronShellExecutor';
// DirectSSHExecutor 及其类型不在此导出，避免 ssh2 原生 .node 模块被 Vite 打包
// CLI 等 Node.js 场景直接 import:
//   import { DirectSSHExecutor, DirectSSHConfig } from './executors/DirectSSHExecutor'
export { LocalShellExecutor } from './executors/LocalShellExecutor';
export type { LocalShellExecutorConfig } from './executors/LocalShellExecutor';
export { MockExecutor } from './executors/MockExecutor';
export type { MockExecutorConfig, ExecutionRecord } from './executors/MockExecutor';

// 测试工具
export { MockAIAgentConnection } from './testing/MockAIAgentConnection';
export type { ScheduledMessage } from './testing/MockAIAgentConnection';

// 类型
export type {
  // 消息
  AIMessage,
  AIMessageCallback,
  ChoiceOption,
  ChoiceData,
  AttachedFile,

  // 操作步骤
  OperationStep,
  RiskLevel,
  StepStatus,

  // 任务状态
  AITaskType,
  AITaskStatus,
  AITaskState,
  TokenUsage,

  // Agent 配置与状态
  AIAgentConfig,
  AIAgentMode,
  AIAgentStatus,
  SshMode,

  // 命令执行
  CommandResult,
  AICmdSuggestion,

  // 事件
  AIAgentEvents,
  StepDetailEvent,
} from './types';

export { AIMessageType, TaskType } from './types';

// 工具函数
export { detectPager, getPagerQuitCommand } from './utils/pagerDetector';
export { detectInteractivePrompt, detectUserTerminalInput } from './utils/interactiveDetector';
export {
  buildCommandWithMarkers,
  extractExitCode,
  cleanOutputMarkers,
  isCommandComplete,
  hasExitCodeMarker,
  hasCmdEndMarker,
} from './utils/markerDetector';
export { buildCommandWithPassword, isSudoCommand } from './utils/shellCommandBuilder';
