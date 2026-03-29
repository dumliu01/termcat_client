/**
 * AI Agent Module Type Definitions
 *
 * All AI-related types extracted from existing code, independent of React/UI
 */

// ==================== Basic Enums ====================

/** WebSocket message types */
export enum AIMessageType {
  // Client sends
  QUESTION = 'question',
  CONFIRM_EXECUTE = 'confirm_execute',
  CANCEL_EXECUTE = 'cancel_execute',
  STOP_TASK = 'stop_task',
  USER_CHOICE_RESPONSE = 'user_choice_response',

  TOOL_PERMISSION_RESPONSE = 'tool_permission_response',
  USER_FEEDBACK_RESPONSE = 'user_feedback_response',

  // Server sends
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

/** Task types */
export enum TaskType {
  ANSWER = 'answer',
  COMMAND = 'command',
  OPERATION = 'operation',
}

// ==================== Message Interfaces ====================

/** Option interface */
export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

/** Choice data */
export interface ChoiceData {
  issue: string;
  question: string;
  options: ChoiceOption[];
  allowCustomInput: boolean;
  customInputPlaceholder?: string;
  context?: Record<string, any>;
}

/** WebSocket message interface */
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
  mode?: 'normal' | 'agent' | 'code' | 'x-agent';
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
  // Server-injected statistics (COMPLETE message)
  stats?: {
    input_tokens?: number;
    output_tokens?: number;
    gems_cost?: number;
    gems_remaining?: number;
    show_stats?: boolean;
  };
  // Tool invocation related (Code mode)
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_use_id?: string;
  is_error?: boolean;
  // Remote execution request (Code mode, from remote_terminal_proxy)
  execution_id?: string;
  tool_type?: string;
  exit_code?: number;
  // Tool permission request related (Code mode)
  permission_id?: string;
  allowed?: boolean;
  reason?: string;
  // User feedback related (Code mode)
  action?: string;
  message?: string;
  // User choice related
  issue?: string;
  question?: string;
  options?: ChoiceOption[];
  allow_custom_input?: boolean;
  custom_input_placeholder?: string;
  choice?: string;
  custom_input?: string;
  cancelled?: boolean;
}

// ==================== Operation Steps ====================

/** Risk levels */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Step status */
export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

/** Operation step */
export interface OperationStep {
  index: number;
  description: string;
  command?: string;
  risk?: RiskLevel;
  expected_result?: string;
  status?: StepStatus;
}

// ==================== Task State ====================

/** AI task types */
export type AITaskType = 'answer' | 'command' | 'operation' | 'step_detail' | 'user_choice' | 'tool_use';

/** AI task status values */
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

/** Token usage */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costGems: number;
  showTokens?: boolean;
  showGems?: boolean;
}

/** AI task state */
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
  // Step detail information
  stepIndex?: number;
  stepDescription?: string;
  stepCommand?: string;
  stepRisk?: RiskLevel;
  stepOutput?: string;
  stepSuccess?: boolean;
  // Tool invocation related (Code mode)
  toolName?: string;
  toolInput?: Record<string, any>;
  toolUseId?: string;
  toolOutput?: string;
  toolError?: boolean;
  // Password related
  passwordPrompt?: string;
  // User choice related
  choiceData?: ChoiceData;
  userChoice?: string;
  userCustomInput?: string;
}

// ==================== Attachments ====================

/** Attached file */
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string; // Base64 encoded
  previewUrl?: string; // Thumbnail URL for image attachments
}

// ==================== Agent Configuration & State ====================

/** AI Agent running mode */
export type AIAgentMode = 'normal' | 'agent' | 'code' | 'x-agent';

/** SSH mode */
export type SshMode = 'associated' | 'independent';

/** AI Agent status */
export type AIAgentStatus = 'idle' | 'thinking' | 'generating' | 'waiting_user';

/** AI Agent configuration */
export interface AIAgentConfig {
  mode: AIAgentMode;
  model: string;
  sessionId: string;
  hostId?: string;
  language?: string;
  sshMode?: SshMode;
  osType?: string;    // Remote server OS type, e.g. "linux/ubuntu", "macos"
  osVersion?: string; // Remote server OS version, e.g. "22.04"
  shell?: string;     // Remote server shell type, e.g. "bash", "zsh"
}

// ==================== Command Execution ====================

/** Command execution result */
export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
}

/** Command suggestion */
export interface AICmdSuggestion {
  command: string;
  explanation: string;
  risk: RiskLevel;
}

// ==================== Event Types ====================

/** AIAgent event mappings */
export interface AIAgentEvents {
  // Streaming response
  'answer:chunk': (content: string, isComplete: boolean) => void;
  'answer:complete': (fullContent: string, tokenUsage?: TokenUsage) => void;

  // Command suggestion (normal mode)
  'command:suggestion': (suggestion: AICmdSuggestion) => void;

  // Agent mode events
  'plan': (plan: OperationStep[], description: string, taskId: string) => void;
  'step:update': (stepIndex: number, status: StepStatus) => void;
  'step:detail': (stepIndex: number, detail: StepDetailEvent) => void;

  // Human-computer interaction requests
  'execute:request': (stepIndex: number, command: string, risk: RiskLevel, description: string, taskId: string) => void;
  'choice:request': (stepIndex: number, data: ChoiceData, taskId: string) => void;
  'password:request': (stepIndex: number, command: string, taskId: string) => void;
  'interactive:prompt': (prompt: string) => void;

  // Tool invocation (Code mode)
  'tool:use': (toolName: string, toolInput: Record<string, any>, toolUseId: string, taskId: string) => void;
  'tool:result': (toolUseId: string, output: string, isError: boolean) => void;

  // Tool permission request (Code mode)
  'tool:permission_request': (permissionId: string, toolName: string, toolInput: Record<string, any>, taskId: string, toolUseId: string, risk?: string, description?: string, title?: string, allowPermanent?: boolean) => void;

  // User feedback request (Code mode)
  'feedback:request': (taskId: string) => void;

  // Status change
  'status:change': (status: AIAgentStatus) => void;
  'task:start': (taskId: string) => void;
  'task:complete': (summary: string) => void;
  'task:error': (error: string, code?: number) => void;

  // Token usage
  'token:usage': (usage: TokenUsage) => void;

  // Ops task detection (normal mode suggests switching to agent)
  'ops:detected': (keywords: string[]) => void;
}

/** Step detail event data */
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

// ==================== Callback Types ====================

/** Message callback */
export type AIMessageCallback = (message: AIMessage) => void;
