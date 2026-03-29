export type OSType = 'linux' | 'windows' | 'mac';
// Multi-theme enumeration aligned with AITerm: dark, regular, dim, urban, light
export type ThemeType = 'dark' | 'regular' | 'dim' | 'urban' | 'light';
export type TerminalThemeType = 'classic' | 'solarized' | 'monokai' | 'dracula' | 'matrix';
export type TierType = 'Standard' | 'Pro' | 'Adv';

// AI model type (model ID)
export type AIModelType = string;

// AI model information (from server)
export interface AIModelInfo {
  id: string;           // Model ID (e.g. glm-4-flash)
  name: string;         // Display name (e.g. GLM-4 Flash)
  provider: string;     // Provider identifier (e.g. zhipu)
  provider_name: string; // Provider name (e.g. 智谱AI)
}

/** AI operation mode info (from server + plugin injection) */
export interface AIModeInfo {
  id: string;                          // Mode identifier: ask, agent, code, x-agent, or plugin-defined
  name: string;                        // Display name
  icon?: string;                       // Icon identifier (lucide icon name)
  allowedModels?: string[];            // Allowed model IDs, empty/undefined = no restriction
  costPerQuestion?: number;            // Gems cost per question
  source: 'server' | 'plugin';        // Origin
  pluginData?: Record<string, any>;    // Plugin extension data (e.g. wsUrl, token)
  locked?: boolean;                    // Whether mode is locked (not purchased)
  price?: number;                      // Unlock price for display
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
  connectionType?: 'direct' | 'jump' | 'local';  // Connection type, default is direct
  targetHost?: string;                  // Target host address in jump host mode
  proxyId?: string;
  proxy?: Proxy;  // Complete proxy configuration object
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

// AI Agent related types
export type AITaskType = 'answer' | 'command' | 'operation' | 'step_detail' | 'user_choice' | 'tool_use';

export interface AIOperationStep {
  index: number;
  description: string;
  command?: string;
  risk?: 'low' | 'medium' | 'high';
  expected_result?: string;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
}

// Choice option
export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

// Choice data
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
  content: string;  // Accumulated response content
  command?: string;
  explanation?: string;
  risk?: 'low' | 'medium' | 'high';
  alternatives?: string[];
  retryAttempt?: number;  // Retry count (for retry messages)
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
  // Step detail fields (for step_detail type)
  stepIndex?: number;
  stepDescription?: string;
  stepCommand?: string;
  stepRisk?: 'low' | 'medium' | 'high';
  stepOutput?: string;
  stepSuccess?: boolean;
  // Tool call related (Code mode)
  toolName?: string;
  toolInput?: Record<string, any>;
  toolUseId?: string;
  toolOutput?: string;
  toolError?: boolean;
  permissionId?: string;
  permissionTitle?: string;  // SDK title (e.g. "Claude wants to run: lsof")
  allowPermanent?: boolean;  // Whether "Always allow" button should show (Code mode only)
  // Password input related
  passwordPrompt?: string;  // Password prompt message
  // User choice related
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
  // Network history data - upload (bar) and download (line) stored separately
  netUpHistory: number[];   // Upload speed history (KB/s)
  netDownHistory: number[]; // Download speed history (KB/s)
  pingHistory: number[];
  ethName: string;
  // Backward compatibility
  mem?: number;
  swap?: number;
}

export interface TransferItem {
  id: string;
  name: string;
  size: string;
  sizeBytes?: number;        // Total bytes
  progress: number;
  transferred?: number;       // Transferred bytes
  speed: string;
  type: 'upload' | 'download';
  status: 'running' | 'completed' | 'failed' | 'paused' | 'queued';
  timestamp: string;
  localPath?: string;        // Local path
  remotePath?: string;       // Remote path
  error?: string;            // Error message
  connectionId?: string;     // Connection ID
  isDirectory?: boolean;     // Whether it is a directory
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
