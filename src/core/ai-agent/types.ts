/**
 * AI Agent 模块类型定义
 *
 * 从现有代码提取的所有 AI 相关类型，独立于 React/UI
 */

// ==================== 基础枚举 ====================

/** WebSocket 消息类型 */
export enum AIMessageType {
  // 客户端发送
  QUESTION = 'question',
  CONFIRM_EXECUTE = 'confirm_execute',
  CANCEL_EXECUTE = 'cancel_execute',
  STOP_TASK = 'stop_task',
  USER_CHOICE_RESPONSE = 'user_choice_response',

  TOOL_PERMISSION_RESPONSE = 'tool_permission_response',
  USER_FEEDBACK_RESPONSE = 'user_feedback_response',

  // 服务端发送
  ANSWER = 'answer',
  COMMAND = 'command',
  OPERATION_PLAN = 'operation_plan',
  OPERATION_STEP = 'operation_step',
  STEP_DETAIL = 'step_detail',
  EXECUTE_REQUEST = 'execute_request',
  EXECUTE_CANCEL = 'execute_cancel',
  EXECUTE_RESULT = 'execute_result',
  USER_CHOICE_REQUEST = 'user_choice_request',
  TOOL_PERMISSION_REQUEST = 'tool_permission_request',
  USER_FEEDBACK_REQUEST = 'user_feedback_request',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',
  COMPLETE = 'complete',
  TOKEN_USAGE = 'token_usage',
}

/** 任务类型 */
export enum TaskType {
  ANSWER = 'answer',
  COMMAND = 'command',
  OPERATION = 'operation',
}

// ==================== 消息接口 ====================

/** 选项接口 */
export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

/** 选择数据 */
export interface ChoiceData {
  issue: string;
  question: string;
  options: ChoiceOption[];
  allowCustomInput: boolean;
  customInputPlaceholder?: string;
  context?: Record<string, any>;
}

/** WebSocket 消息接口 */
export interface AIMessage {
  type: AIMessageType;
  task_id?: string;
  frontend_task_id?: string;
  prompt?: string;
  content?: string;
  command?: string;
  explanation?: string;
  risk?: RiskLevel;
  alternatives?: string[];
  warnings?: string[];
  context?: Record<string, any>;
  model?: string;
  mode?: 'normal' | 'agent' | 'code' | 'codex';
  host_id?: string;
  session_id?: string;
  is_complete?: boolean;
  task_type?: TaskType;
  plan?: OperationStep[];
  total_steps?: number;
  description?: string;
  step_index?: number;
  step_description?: string;
  status?: string;
  success?: boolean;
  auto_execute?: boolean;
  output?: string;
  error?: string;
  code?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_gems?: number;
  show_tokens?: boolean;
  show_gems?: boolean;
  summary?: string;
  retry_attempt?: number;
  files?: AttachedFile[];
  // 服务端注入的统计数据（COMPLETE 消息）
  stats?: {
    input_tokens?: number;
    output_tokens?: number;
    gems_cost?: number;
    gems_remaining?: number;
    show_stats?: boolean;
  };
  // 工具调用相关（Code 模式）
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_use_id?: string;
  is_error?: boolean;
  // 远程执行请求（Code 模式，来自 remote_terminal_proxy）
  execution_id?: string;
  tool_type?: string;
  exit_code?: number;
  // 工具权限请求相关（Code 模式）
  permission_id?: string;
  allowed?: boolean;
  reason?: string;
  // 用户反馈相关（Code 模式）
  action?: string;
  message?: string;
  // 用户选择相关
  issue?: string;
  question?: string;
  options?: ChoiceOption[];
  allow_custom_input?: boolean;
  custom_input_placeholder?: string;
  choice?: string;
  custom_input?: string;
  cancelled?: boolean;
}

// ==================== 操作步骤 ====================

/** 风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high';

/** 步骤状态 */
export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

/** 操作步骤 */
export interface OperationStep {
  index: number;
  description: string;
  command?: string;
  risk?: RiskLevel;
  expected_result?: string;
  status?: StepStatus;
}

// ==================== 任务状态 ====================

/** AI 任务类型 */
export type AITaskType = 'answer' | 'command' | 'operation' | 'step_detail' | 'user_choice' | 'tool_use';

/** AI 任务状态值 */
export type AITaskStatus =
  | 'running'
  | 'executing'
  | 'waiting_confirm'
  | 'waiting_password'
  | 'waiting_user_confirm'
  | 'waiting_user_choice'
  | 'user_choice_submitted'
  | 'waiting_tool_permission'
  | 'waiting_feedback'
  | 'completed'
  | 'error';

/** Token 使用量 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costGems: number;
  showTokens?: boolean;
  showGems?: boolean;
}

/** AI 任务状态 */
export interface AITaskState {
  taskId: string;
  taskType: AITaskType;
  status: AITaskStatus;
  content: string;
  command?: string;
  explanation?: string;
  risk?: RiskLevel;
  alternatives?: string[];
  retryAttempt?: number;
  warnings?: string[];
  plan?: OperationStep[];
  currentStep?: number;
  totalSteps?: number;
  tokenUsage?: TokenUsage;
  error?: string;
  // 步骤详细信息
  stepIndex?: number;
  stepDescription?: string;
  stepCommand?: string;
  stepRisk?: RiskLevel;
  stepOutput?: string;
  stepSuccess?: boolean;
  // 工具调用相关（Code 模式）
  toolName?: string;
  toolInput?: Record<string, any>;
  toolUseId?: string;
  toolOutput?: string;
  toolError?: boolean;
  // 密码相关
  passwordPrompt?: string;
  // 用户选择相关
  choiceData?: ChoiceData;
  userChoice?: string;
  userCustomInput?: string;
}

// ==================== 附件 ====================

/** 附件文件 */
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string; // Base64 编码
  previewUrl?: string; // 图片附件缩略图 URL
}

// ==================== Agent 配置与状态 ====================

/** AI Agent 运行模式 */
export type AIAgentMode = 'normal' | 'agent' | 'code' | 'codex';

/** SSH 模式 */
export type SshMode = 'associated' | 'independent';

/** AI Agent 状态 */
export type AIAgentStatus = 'idle' | 'thinking' | 'generating' | 'waiting_user';

/** AI Agent 配置 */
export interface AIAgentConfig {
  mode: AIAgentMode;
  model: string;
  sessionId: string;
  hostId?: string;
  language?: string;
  sshMode?: SshMode;
  osType?: string;    // 远程服务器 OS 类型，如 "linux/ubuntu", "macos"
  osVersion?: string; // 远程服务器 OS 版本，如 "22.04"
  shell?: string;     // 远程服务器 shell 类型，如 "bash", "zsh"
}

// ==================== 命令执行 ====================

/** 命令执行结果 */
export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
}

/** 命令建议 */
export interface AICmdSuggestion {
  command: string;
  explanation: string;
  risk: RiskLevel;
}

// ==================== 事件类型 ====================

/** AIAgent 发出的事件映射 */
export interface AIAgentEvents {
  // 流式回复
  'answer:chunk': (content: string, isComplete: boolean) => void;
  'answer:complete': (fullContent: string, tokenUsage?: TokenUsage) => void;

  // 命令建议（normal 模式）
  'command:suggestion': (suggestion: AICmdSuggestion) => void;

  // Agent 模式事件
  'plan': (plan: OperationStep[], description: string, taskId: string) => void;
  'step:update': (stepIndex: number, status: StepStatus) => void;
  'step:detail': (stepIndex: number, detail: StepDetailEvent) => void;

  // 人机交互请求
  'execute:request': (stepIndex: number, command: string, risk: RiskLevel, description: string, taskId: string) => void;
  'choice:request': (stepIndex: number, data: ChoiceData, taskId: string) => void;
  'password:request': (stepIndex: number, command: string, taskId: string) => void;
  'interactive:prompt': (prompt: string) => void;

  // 工具调用（Code 模式）
  'tool:use': (toolName: string, toolInput: Record<string, any>, toolUseId: string, taskId: string) => void;
  'tool:result': (toolUseId: string, output: string, isError: boolean) => void;

  // 工具权限请求（Code 模式）
  'tool:permission_request': (permissionId: string, toolName: string, toolInput: Record<string, any>, taskId: string, toolUseId: string, risk?: string, description?: string) => void;

  // 用户反馈请求（Code 模式）
  'feedback:request': (taskId: string) => void;

  // 状态变更
  'status:change': (status: AIAgentStatus) => void;
  'task:start': (taskId: string) => void;
  'task:complete': (summary: string) => void;
  'task:error': (error: string, code?: number) => void;

  // Token 使用
  'token:usage': (usage: TokenUsage) => void;

  // 运维任务检测（normal 模式提示切换 agent）
  'ops:detected': (keywords: string[]) => void;
}

/** 步骤详情事件数据 */
export interface StepDetailEvent {
  taskId: string;
  stepIndex: number;
  description: string;
  command?: string;
  risk?: RiskLevel;
  status: string;
  output?: string;
  success?: boolean;
  retryAttempt?: number;
  autoExecute?: boolean;
}

// ==================== 回调类型 ====================

/** 消息回调 */
export type AIMessageCallback = (message: AIMessage) => void;
