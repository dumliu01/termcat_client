import { User, AITaskState, AIOperationStep, AICmdSuggestion, AIModelInfo } from '@/utils/types';

// 附件文件
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;  // Base64 编码的内容
  previewUrl?: string;  // 图片附件缩略图 URL
}

// AI 运维消息类型定义
export interface AIOpsMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestion?: AICmdSuggestion;
  taskState?: AITaskState;
  files?: AttachedFile[];  // 新增：附件列表
  timestamp: number;
}

// 消息模式
export type AIOpsMode = 'ask' | 'agent' | 'code' | 'codex';

// SSH 模式
export type SshMode = 'associated' | 'independent';

// AIOps 面板属性
export interface AIOpsPanelProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onExecute: (cmd: string) => void;
  user: User | null;
  sessionId?: string;
  hostId?: string;
  hostName?: string;
  isVisible: boolean;
  onClose: () => void;
  width?: number;
  availableModels?: AIModelInfo[];
  onGemsUpdated?: (newBalance: number) => void;
  /** 嵌入模式：不渲染外层 aside 容器，由父组件控制布局 */
  embedded?: boolean;
}

// 风险等级颜色映射
export type RiskLevel = 'low' | 'medium' | 'high';

// 步骤状态
export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

