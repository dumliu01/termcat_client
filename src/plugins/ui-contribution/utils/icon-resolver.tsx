/**
 * 字符串图标名 → lucide-react 组件解析
 *
 * 只引入常用图标子集，避免打包全量 lucide 图标。
 */

import React from 'react';
import {
  Activity, X, ChevronDown, ChevronRight, ChevronUp,
  ArrowUp, ArrowDown, ArrowUpDown,
  Monitor, Settings, Zap, Folder, File, FolderOpen,
  Terminal, Play, Square, Trash2, RefreshCw, Copy,
  CircleCheck, CircleX, Circle, AlertTriangle, Info,
  Download, Upload, Search, Filter, Plus, Minus,
  Eye, EyeOff, Lock, Unlock, Globe, Server, Database,
  HardDrive, Cpu, MemoryStick, Network, Wifi,
  ScrollText, FileText, Code, Hash, Clock,
} from 'lucide-react';

type IconComponent = React.ComponentType<{ className?: string }>;

const ICON_MAP: Record<string, IconComponent> = {
  'activity': Activity,
  'x': X,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-up-down': ArrowUpDown,
  'monitor': Monitor,
  'settings': Settings,
  'zap': Zap,
  'folder': Folder,
  'file': File,
  'folder-open': FolderOpen,
  'terminal': Terminal,
  'play': Play,
  'square': Square,
  'trash-2': Trash2,
  'refresh-cw': RefreshCw,
  'copy': Copy,
  'circle-check': CircleCheck,
  'circle-x': CircleX,
  'circle': Circle,
  'alert-triangle': AlertTriangle,
  'info': Info,
  'download': Download,
  'upload': Upload,
  'search': Search,
  'filter': Filter,
  'plus': Plus,
  'minus': Minus,
  'eye': Eye,
  'eye-off': EyeOff,
  'lock': Lock,
  'unlock': Unlock,
  'globe': Globe,
  'server': Server,
  'database': Database,
  'hard-drive': HardDrive,
  'cpu': Cpu,
  'memory-stick': MemoryStick,
  'network': Network,
  'wifi': Wifi,
  'scroll-text': ScrollText,
  'file-text': FileText,
  'code': Code,
  'hash': Hash,
  'clock': Clock,
};

/** 根据图标名获取 lucide 组件，不存在则返回 null */
export function resolveIcon(name?: string): IconComponent | null {
  if (!name) return null;
  return ICON_MAP[name] || null;
}
