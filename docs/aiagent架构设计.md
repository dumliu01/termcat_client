# termcat_client 运维 AIAgent 独立模块架构设计

## 1. 背景与目标

termcat_client 现有 AI Agent 功能分散在 20+ 个文件中（React hooks、UI 组件、WebSocket 服务），与 React/DOM 紧耦合。本方案将核心逻辑提取为独立模块，实现：

1. **无 UI 依赖**，可命令行/headless 运行
2. **抽象 SSH 执行接口**，支持关联 SSH 和独立 SSH
3. **事件驱动架构**，UI 层通过订阅事件实现展示

## 2. 模块结构

```
src/modules/ai-agent/
├── index.ts                        # 统一导出
├── types.ts                        # 所有类型定义
├── AIAgent.ts                      # 核心类：EventEmitter 状态机 + 协议处理
├── AIAgentConnection.ts            # WebSocket 连接管理（多实例，非单例）
├── ICommandExecutor.ts             # 命令执行器接口
├── executors/
│   ├── ElectronShellExecutor.ts    # Electron IPC shell 执行器（关联/独立 SSH）
│   └── DirectSSHExecutor.ts        # 直接 SSH 执行器（预留，给 auto_tuning 用）
└── utils/
    ├── markerDetector.ts           # <<<EXIT_CODE>>> / <<<CMD_END>>> 标记检测
    ├── pagerDetector.ts            # 分页器检测（less/more/systemctl）
    ├── interactiveDetector.ts      # 交互式提示检测（y/n 确认等）
    └── shellCommandBuilder.ts      # sudo 密码处理、命令构建
```

## 3. 核心接口设计

### 3.1 ICommandExecutor — 命令执行器抽象

```typescript
export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface ExecuteOptions {
  timeoutMs?: number;   // 默认 600000（10分钟）
  password?: string;    // sudo 密码
}

export interface ICommandExecutor {
  initialize(): Promise<void>;
  execute(command: string, options?: ExecuteOptions): Promise<CommandResult>;
  cleanup(): Promise<void>;
  isReady(): boolean;
}
```

**两种实现：**

| 实现 | 场景 | 说明 |
|------|------|------|
| `ElectronShellExecutor` | Electron 环境 | 封装 `window.electron.sshShellWrite` + 标记检测 + 分页器/交互式处理。构造参数接收 `sessionId` 和 `sshMode: 'associated' \| 'independent'`，内部决定用 `sessionId` 还是 `sessionId__ai_shell` |
| `DirectSSHExecutor` | 非 Electron 环境（预留） | 直接用 SSH 连接，给 auto_tuning 等场景使用 |

### 3.2 AIAgentConnection — WebSocket 连接管理

从现有 `aiWebSocketService.ts` 提取，去除单例模式，支持多实例：

```typescript
export class AIAgentConnection {
  constructor(config: { wsUrl: string; token: string; maxReconnectAttempts?: number });

  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  send(message: Partial<AIMessage>): void;

  // 业务方法
  sendQuestion(prompt, options?): void;
  confirmExecute(taskId, stepIndex, result, options?): void;
  cancelExecute(taskId, stepIndex): void;
  stopTask(taskId, frontendTaskId?): void;
  sendUserChoice(taskId, stepIndex, choice, options?): void;

  // 事件监听
  onMessage(callback): () => void;        // 全局消息回调
  onTaskMessage(taskId, callback): () => void;  // 任务特定回调
}
```

### 3.3 AIAgent — 核心类

```typescript
export class AIAgent extends EventEmitter {
  constructor(connection: AIAgentConnection, config: AIAgentConfig);

  // === 核心 API ===
  setExecutor(executor: ICommandExecutor): void;
  ask(prompt: string, files?: AttachedFile[]): void;
  stop(): void;
  configure(config: Partial<AIAgentConfig>): void;
  destroy(): void;

  // === 人机交互 API ===
  confirmExecute(stepIndex: number, command: string, password?: string): Promise<void>;
  submitExecuteResult(stepIndex, command, result, error?): void;
  cancelExecute(stepIndex: number): void;
  sendUserChoice(stepIndex: number, choice: string, customInput?: string): void;
  cancelUserChoice(stepIndex: number): void;

  // === 自动模式 API（headless 使用） ===
  enableAutoExecute(): void;
  enableAutoChoice(): void;
  setPassword(password: string): void;

  // === 状态查询 ===
  getStatus(): AIAgentStatus;
  getTaskId(): string | null;
  getConfig(): Readonly<AIAgentConfig>;
}
```

### 3.4 事件定义

AIAgent 通过 EventEmitter 发出以下事件，UI 层订阅：

```typescript
interface AIAgentEvents {
  // 流式回复
  'answer:chunk'       (content: string, isComplete: boolean): void;
  'answer:complete'    (fullContent: string, tokenUsage?: TokenUsage): void;

  // 命令建议（normal 模式）
  'command:suggestion' (suggestion: AICmdSuggestion): void;

  // Agent 模式事件
  'plan'               (plan: OperationStep[], description: string, taskId: string): void;
  'step:update'        (stepIndex: number, status: StepStatus): void;
  'step:detail'        (stepIndex: number, detail: StepDetailEvent): void;

  // 人机交互请求（UI 需响应）
  'execute:request'    (stepIndex, command, risk, description, taskId): void;
  'choice:request'     (stepIndex, data: ChoiceData, taskId): void;
  'password:request'   (stepIndex, command, taskId): void;
  'interactive:prompt' (prompt: string): void;

  // 状态变更
  'status:change'      (status: AIAgentStatus): void;
  'task:start'         (taskId: string): void;
  'task:complete'      (summary: string): void;
  'task:error'         (error: string): void;

  // Token 使用
  'token:usage'        (usage: TokenUsage): void;

  // 运维任务检测（normal 模式提示切换 agent）
  'ops:detected'       (keywords: string[]): void;
}
```

## 4. 数据流与状态机

### 4.1 状态流转

```
idle ──ask()──► thinking ──收到ANSWER──► generating ──is_complete──► idle
                   │                                                   ▲
                   │──收到OPERATION_PLAN──► generating                  │
                   │                          │                        │
                   │              收到EXECUTE_REQUEST                   │
                   │                          │                        │
                   │                          ▼                        │
                   │                    waiting_user                   │
                   │                          │                        │
                   │              confirmExecute()                     │
                   │                          │                        │
                   │                          ▼                        │
                   │                      thinking ──收到COMPLETE──────┘
                   │                          │
                   │              收到ERROR────┘──► idle
```

### 4.2 消息处理映射

| WebSocket 消息类型 | AIAgent 处理 | 发出事件 |
|---|---|---|
| `ANSWER` | 累积内容，检测运维关键字 | `answer:chunk`, `answer:complete`, `ops:detected` |
| `COMMAND` | 解析命令建议 | `command:suggestion` |
| `OPERATION_PLAN` | 记录计划 | `plan` |
| `OPERATION_STEP` | 更新步骤状态 | `step:update` |
| `STEP_DETAIL` | 更新步骤详情 | `step:detail` |
| `EXECUTE_REQUEST` | 自动执行或等待用户 | `execute:request`（非自动模式） |
| `USER_CHOICE_REQUEST` | 自动选择或等待用户 | `choice:request`（非自动模式） |
| `TOKEN_USAGE` | 转发 | `token:usage` |
| `COMPLETE` | 重置状态 | `task:complete` |
| `ERROR` | 重置状态 | `task:error` |

### 4.3 命令执行流程

```
execute:request 事件
       │
       ├─ autoExecuteEnabled? ──是──► executor.execute() ──► submitExecuteResult()
       │                                                          │
       │                                                    connection.confirmExecute()
       │
       └─ 否 ──► emit('execute:request') ──► UI 展示确认按钮
                                                    │
                                              用户点击确认
                                                    │
                                        agent.confirmExecute(stepIndex, command, password?)
                                                    │
                                              executor.execute()
                                                    │
                                              submitExecuteResult()
```

## 5. ElectronShellExecutor 内部架构

```
┌─────────────────────────────────────────────┐
│           ElectronShellExecutor              │
│                                             │
│  ┌─────────────┐   ┌─────────────────────┐  │
│  │ Shell Write  │   │  Shell Data Listener │  │
│  │ (execute)    │   │  (onShellData)       │  │
│  └──────┬──────┘   └──────────┬──────────┘  │
│         │                      │             │
│         │    ┌─────────────────┤             │
│         │    │                 │             │
│         ▼    ▼                 ▼             │
│  ┌──────────────┐  ┌───────────────────┐    │
│  │ Output Buffer│  │ Detection Pipeline │    │
│  └──────┬───────┘  │                   │    │
│         │          │ 1. Echo Cleanup    │    │
│         │          │ 2. Pager Detect    │◄─auto quit 'q'
│         │          │ 3. Interactive     │◄─auto 'y' after 30s
│         │          │ 4. Marker Detect   │    │
│         │          └────────┬──────────┘    │
│         │                   │               │
│         │         isCommandComplete()?      │
│         │                   │               │
│         ▼                   ▼               │
│  ┌──────────────────────────────┐           │
│  │ Extract exitCode + clean     │           │
│  │ → resolve(CommandResult)     │           │
│  └──────────────────────────────┘           │
└─────────────────────────────────────────────┘
```

**关键特性：**
- **关联模式 (`associated`)**: 复用终端的 `sessionId`，共享环境
- **独立模式 (`independent`)**: 使用 `sessionId__ai_shell`，隔离执行
- **依赖注入**: 构造函数接受可选的 `ElectronShellAPI`，支持测试 mock

## 6. 逻辑提取来源映射

| 新模块文件 | 提取自 | 提取内容 |
|---|---|---|
| `types.ts` | `types/index.ts`, `types/aiOps.ts`, `aiWebSocketService.ts` | 所有 AI 相关类型定义 |
| `AIAgentConnection.ts` | `services/aiWebSocketService.ts` | WebSocket 连接、消息收发、重连 |
| `AIAgent.ts` | `hooks/useAIMessageHandler.ts` | 消息处理状态机（10 种消息类型处理） |
| `AIAgent.ts` | `ai-ops/hooks/useAIOpsState.ts` | 状态管理（status、taskId、config） |
| `AIAgent.ts` | `ai-ops/hooks/useCommandExecution.ts` | 命令执行流程（confirm、cancel、submit） |
| `ElectronShellExecutor.ts` | `ai-ops/hooks/useShellSession.ts` | Shell 生命周期、标记检测、分页器、交互式提示 |
| `ElectronShellExecutor.ts` | `ai-ops/hooks/useInteractivePrompt.ts` | 交互式提示处理、超时自动响应 |
| `utils/markerDetector.ts` | `ai-ops/utils/shellCommandBuilder.ts` + `useShellSession.ts` | 标记构建与检测 |
| `utils/pagerDetector.ts` | `ai-ops/utils/pagerDetector.ts` | 分页器检测（直接复制） |
| `utils/interactiveDetector.ts` | `ai-ops/utils/interactiveDetector.ts` | 交互式提示检测（直接复制） |
| `utils/shellCommandBuilder.ts` | `ai-ops/utils/shellCommandBuilder.ts` | sudo 密码处理 |

## 7. 迁移策略（渐进式）

### 第 1 步：创建独立模块 ✅ 已完成

- 新建 `src/modules/ai-agent/` 目录及所有文件
- 定义 types.ts、ICommandExecutor 接口
- 实现 AIAgentConnection、AIAgent、ElectronShellExecutor
- 实现 utils（markerDetector、pagerDetector、interactiveDetector、shellCommandBuilder）
- TypeScript 编译通过，零新增类型错误

### 第 2 步：UI 层适配 ✅ 已完成

- 创建 `src/hooks/useAIAgent.ts`：一个 hook 替代原有 8+ 个 hooks
  - 内部创建/持有 AIAgent + AIAgentConnection + ElectronShellExecutor 实例
  - 将 AIAgent 事件（answer:chunk, plan, execute:request 等）映射为 React state
  - 管理消息列表、密码输入、文件附件、交互式提示等全部 UI 状态
  - 暴露 sendMessage/confirmExecute/submitPassword 等回调
- 创建 `src/components/AIOpsPanel.agent.tsx`：使用 `useAIAgent()` 的面板组件
  - 与原版 AIOpsPanel.tsx 功能一致，UI 子组件完全复用
  - 代码量大幅减少（原版需 8 个 hook 初始化 + 复杂组装，新版只需 1 个 hook）
- TypeScript 编译通过，零新增类型错误

### 第 3 步：兼容层过渡 ✅ 已完成

- `aiWebSocketService.ts` 改为薄封装，内部委托给 AIAgentConnection
- 保留原有 API 和类型导出，现有代码无需修改即可继续工作
- `TerminalView.tsx` 已切换为使用 `AIOpsAgentPanel`（从 `AIOpsPanel.agent.tsx` 导入）
- TypeScript 编译通过，零新增类型错误

### 第 4 步：headless 模式验证 ✅ 已完成

- 实现 `MockExecutor`（`executors/MockExecutor.ts`）：可配置的模拟命令执行器，支持精确匹配、正则匹配、默认响应、执行历史
- 实现 `MockAIAgentConnection`（`testing/MockAIAgentConnection.ts`）：模拟 WebSocket 连接，支持消息序列、agent 流程模拟、发送消息查询
- 编写 headless 验证脚本（`examples/headless-validation.ts`），包含 15 个测试用例：
  1. 基础问答流程（normal 模式状态机）
  2. Agent 自动执行模式（async executor + confirmExecute）
  3. 手动确认执行模式
  4. 用户选择流程
  5. 自动选择模式（auto-select recommended）
  6. 错误处理
  7. 停止任务
  8. Token 使用量事件
  9. 命令建议（normal 模式）
  10. 运维关键字检测
  11. Session 过滤
  12. 动态配置
  13. MockExecutor 功能验证
  14. 取消执行
  15. 取消用户选择
- 运行结果：67 个断言全部通过，AIAgent 模块完全脱离 React/DOM 环境运行
- 运行方式：`npx tsx src/modules/ai-agent/examples/headless-validation.ts`

## 8. 使用示例

### 8.1 在 Electron UI 中使用

```typescript
import { AIAgent, AIAgentConnection, ElectronShellExecutor } from '@/modules/ai-agent';

// 建立连接
const connection = new AIAgentConnection({ wsUrl: 'ws://localhost:8080', token });
await connection.connect();

// 创建 Agent
const agent = new AIAgent(connection, {
  mode: 'agent',
  model: 'glm-4-flash',
  sessionId: 'session-123',
  sshMode: 'independent',
});

// 设置执行器
const executor = new ElectronShellExecutor({ sessionId: 'session-123', sshMode: 'independent' });
agent.setExecutor(executor);

// 监听事件 → 更新 React state
agent.on('answer:chunk', (content) => setAnswer(prev => prev + content));
agent.on('plan', (plan) => setPlan(plan));
agent.on('execute:request', (stepIndex, command, risk, desc, taskId) => {
  showConfirmDialog({ stepIndex, command, risk, desc, taskId });
});
agent.on('status:change', (status) => setAIStatus(status));

// 发送提问
agent.ask('检查 nginx 状态并重启');
```

### 8.2 Headless / CLI 模式

```typescript
import { AIAgent, AIAgentConnection } from '@/modules/ai-agent';

const connection = new AIAgentConnection({ wsUrl, token });
await connection.connect();

const agent = new AIAgent(connection, {
  mode: 'agent',
  model: 'glm-4-flash',
  sessionId: 'session-123',
});

// 自动模式：无需人工确认
agent.enableAutoExecute();
agent.enableAutoChoice();
agent.setPassword('sudo-password');

// 设置执行器（可用 mock 或 DirectSSHExecutor）
agent.setExecutor(mockExecutor);

// 监听结果
agent.on('task:complete', (summary) => console.log('Done:', summary));
agent.on('task:error', (error) => console.error('Error:', error));

// 执行
agent.ask('检查磁盘使用率，清理 /tmp 超过 7 天的文件');
```

## 9. 验证方式

1. **编译验证**: `npx tsc --noEmit` — 零新增错误 ✅
2. **单元测试**: 用 mock executor 测试 AIAgent 状态机（ask → plan → execute request → confirm → complete）
3. **集成测试**: 在 Electron 环境中用 `useAIAgent()` hook 替代原有 hooks，验证 UI 功能不变
4. **Headless 测试**: CLI 脚本创建 AIAgent + mock executor，验证完整流程无 UI 依赖
