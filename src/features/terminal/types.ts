import { User, AITaskState, AIOperationStep, AICmdSuggestion, AIModelInfo } from '@/utils/types';

// Attached file
export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;  // Base64 encoded content
  previewUrl?: string;  // Image attachment thumbnail URL
}

// AI Ops message type definition
export interface AIOpsMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestion?: AICmdSuggestion;
  taskState?: AITaskState;
  files?: AttachedFile[];  // Added: attachment list
  timestamp: number;
}

// Message mode
export type AIOpsMode = 'ask' | 'agent' | 'code' | 'x-agent';

// SSH mode
export type SshMode = 'associated' | 'independent';

// AIOps panel props
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
  /** Embedded mode: does not render outer aside container, parent component controls layout */
  embedded?: boolean;
}

// Risk level color mapping
export type RiskLevel = 'low' | 'medium' | 'high';

// Step status
export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed';

// ── Split Pane Layout Tree Types ──

/** Pane leaf node — wraps a terminal session */
export interface PaneNode {
  type: 'pane';
  paneId: string;
  sessionId: string;
}

/** Split internal node — divides space into two children */
export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical'; // horizontal = top/bottom, vertical = left/right
  ratio: number; // 0.1 ~ 0.9, proportion of `first` child
  first: LayoutNode;
  second: LayoutNode;
}

/** Union layout node */
export type LayoutNode = PaneNode | SplitNode;

/** Tab — contains a layout tree and an active pane pointer */
export interface Tab {
  id: string;
  layout: LayoutNode;
  activePaneId: string;
}

/** Drop edge for drag-to-merge */
export type DropEdge = 'top' | 'bottom' | 'left' | 'right' | 'center';

