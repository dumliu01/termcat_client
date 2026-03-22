export type OSType = 'linux' | 'windows' | 'mac';
// 对齐 AITerm 的多主题枚举：极暗、常规深色、优雅灰、工业灰、浅色
export type ThemeType = 'dark' | 'regular' | 'dim' | 'urban' | 'light';
export type TerminalThemeType = 'classic' | 'solarized' | 'monokai' | 'dracula' | 'matrix';
export type TierType = 'Standard' | 'Pro' | 'Adv';

// AI 模型类型（模型ID）
export type AIModelType = string;

// AI 模型信息（从服务端获取）
export interface AIModelInfo {
  id: string;           // 模型 ID（如 glm-4-flash）
  name: string;         // 显示名称（如 GLM-4 Flash）
  provider: string;     // 提供商标识（如 zhipu）
  provider_name: string; // 提供商名称（如 智谱AI）
}

export interface ModelConfig {
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  token: string;
  gems: number;
  tier: TierType;
  tierExpiry?: string;
  nickname?: string;
  gender?: 'male' | 'female' | 'other';
  birthday?: string;
  modelConfig?: ModelConfig;
  adsDisabled?: boolean;
}

export interface HostGroup {
  id: string;
  name: string;
  color?: string;
}

export interface Tunnel {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
}

export interface TunnelStatus {
  id: string;
  name: string;
  type: 'L' | 'R' | 'D';
  listenPort: number;
  targetAddress: string;
  targetPort: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  connectionCount: number;
}

export interface Proxy {
  id: string;
  name: string;
  type: 'SOCKS5' | 'HTTP' | 'HTTPS';
  hostname: string;
  port: number;
  username?: string;
  password?: string;
}

export interface Host {
  id: string;
  name: string;
  hostname: string;
  username: string;
  authType: 'password' | 'ssh_key';
  password?: string;
  sshKey?: string;
  port: number;
  os: OSType;
  tags: string[];
  notes?: string;
  groupId?: string;
  advanced?: {
    smartAccel: boolean;
    execChannel: boolean;
  };
  terminal?: {
    encoding: string;
    backspaceSeq: string;
    deleteSeq: string;
  };
  connectionType?: 'direct' | 'jump' | 'local';  // 连接方式，默认 direct
  targetHost?: string;                  // 跳板机模式下的目标主机地址
  proxyId?: string;
  proxy?: Proxy;  // 完整的代理配置对象
  tunnels?: Tunnel[];
  localConfig?: import('@/core/terminal/types').LocalTerminalConfig;
}

export interface TerminalLine {
  id: string;
  content: string;
  type: 'input' | 'output' | 'error' | 'system' | 'ai-suggestion';
  timestamp: number;
}

export interface AICmdSuggestion {
  command: string;
  explanation: string;
  risk: 'low' | 'medium' | 'high';
}

// AI Agent 相关类型
export type AITaskType = 'answer' | 'command' | 'operation' | 'step_detail' | 'user_choice' | 'tool_use';

export interface AIOperationStep {
  index: number;
  description: string;
  command?: string;
  risk?: 'low' | 'medium' | 'high';
  expected_result?: string;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
}

// 选择选项
export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

// 选择数据
export interface ChoiceData {
  issue: string;
  question: string;
  options: ChoiceOption[];
  allowCustomInput: boolean;
  customInputPlaceholder?: string;
  context?: Record<string, any>;
}

export interface AITaskState {
  taskId: string;
  taskType: AITaskType;
  status: 'running' | 'executing' | 'waiting_confirm' | 'waiting_password' | 'waiting_user_confirm' | 'waiting_user_choice' | 'user_choice_submitted' | 'waiting_tool_permission' | 'waiting_feedback' | 'completed' | 'error';
  content: string;  // 累积的回答内容
  command?: string;
  explanation?: string;
  risk?: 'low' | 'medium' | 'high';
  alternatives?: string[];
  retryAttempt?: number;  // 重试次数（如果是重试消息）
  warnings?: string[];
  plan?: AIOperationStep[];
  currentStep?: number;
  totalSteps?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costGems: number;
  };
  error?: string;
  // 步骤详细信息字段（用于 step_detail 类型）
  stepIndex?: number;
  stepDescription?: string;
  stepCommand?: string;
  stepRisk?: 'low' | 'medium' | 'high';
  stepOutput?: string;
  stepSuccess?: boolean;
  // 工具调用相关（Code 模式）
  toolName?: string;
  toolInput?: Record<string, any>;
  toolUseId?: string;
  toolOutput?: string;
  toolError?: boolean;
  permissionId?: string;
  // 密码输入相关
  passwordPrompt?: string;  // 密码提示信息
  // 用户选择相关（新增）
  choiceData?: ChoiceData;
  userChoice?: string;
  userCustomInput?: string;
}

export interface Session {
  id: string;
  host: Host;
  lines: TerminalLine[];
  customName?: string;
  connectionId?: string;
  initialDirectory?: string;
}

export type ViewState = 'dashboard' | 'terminal' | 'settings' | 'extensions';

export interface ProcessInfo {
  pid: string;
  mem: string;
  cpu: string;
  name: string;
}

export interface FileItem {
  name: string;
  size: string;
  type: string;
  mtime: string;
  permission: string;
  userGroup: string;
  isDir: boolean;
}

export interface SystemMetrics {
  cpu: number;
  cpuCores: number;
  memPercent: number;
  memUsed: string;
  memTotal: string;
  swapPercent: number;
  swapUsed: string;
  swapTotal: string;
  load: string;
  uptime: string;
  upSpeed: string;
  downSpeed: string;
  ping: number;
  processes: ProcessInfo[];
  disks: { path: string; used: string; total: string; percent: number }[];
  // 网络历史数据 - 上行(柱状)和下行(曲线)分开存储
  netUpHistory: number[];   // 上传速度历史 (KB/s)
  netDownHistory: number[]; // 下载速度历史 (KB/s)
  pingHistory: number[];
  ethName: string;
  // 保持向后兼容
  mem?: number;
  swap?: number;
}

export interface TransferItem {
  id: string;
  name: string;
  size: string;
  sizeBytes?: number;        // 总字节数
  progress: number;
  transferred?: number;       // 已传输字节数
  speed: string;
  type: 'upload' | 'download';
  status: 'running' | 'completed' | 'failed' | 'paused' | 'queued';
  timestamp: string;
  localPath?: string;        // 本地路径
  remotePath?: string;       // 远程路径
  error?: string;            // 错误信息
  connectionId?: string;     // 连接ID
  isDirectory?: boolean;     // 是否为目录
}

export interface TransferProgress {
  transferId: string;
  progress: number;
  speed: number;
  transferred: number;
  total: number;
}

export interface TransferComplete {
  transferId: string;
  success: boolean;
  error?: string;
}

export interface TransferError {
  transferId: string;
  error: string;
}
