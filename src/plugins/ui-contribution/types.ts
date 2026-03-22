/**
 * UI 贡献点类型定义
 *
 * 插件通过这些类型描述 UI，App 的模板组件负责渲染。
 */

// ==================== 通用类型 ====================

/** 主题颜色 — 映射到 App 预定义色板 */
export type ThemeColor =
  | 'primary'    // indigo
  | 'success'    // emerald
  | 'warning'    // orange
  | 'danger'     // red
  | 'info'       // cyan
  | 'muted'      // slate
  | (string & {});  // 允许自定义 hex/rgb

/** 操作按钮 */
export interface ActionItem {
  id: string;
  icon?: string;
  label?: string;
  tooltip?: string;
}

/** 右键菜单项 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  separator?: boolean;
}

// ==================== 模板类型 ====================

/** 支持的模板类型 */
export type TemplateType =
  // P0
  | 'header'
  | 'key-value'
  | 'metric-bars'
  | 'table'
  | 'bar-chart'
  | 'divider'
  // P1
  | 'list'
  | 'tree-view'
  | 'log-stream'
  | 'button-group'
  | 'text'
  // P2
  | 'metric-ring'
  | 'sparkline'
  | 'area-chart'
  | 'columns'
  | 'grid'
  | 'progress'
  | 'tabs'
  | 'form'
  | 'status-bar'
  | 'notification';

/** 模板变体 — compact 紧凑模式，card 卡片模式 */
export type TemplateVariant = 'default' | 'compact' | 'card';

/** 区域描述 */
export interface SectionDescriptor {
  /** 区域 ID（用于局部更新） */
  id?: string;
  /** 使用的模板类型 */
  template: TemplateType;
  /** 模板数据 */
  data: TemplateData;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认折叠 */
  collapsed?: boolean;
  /** 模板变体 */
  variant?: TemplateVariant;
}

/** 所有模板数据的联合类型 */
export type TemplateData =
  | HeaderData
  | KeyValueData
  | MetricBarsData
  | TableData
  | ChartData
  | DividerData
  | ListData
  | TreeViewData
  | LogStreamData
  | ButtonGroupData
  | TextData
  | MetricRingData
  | SparklineData
  | AreaChartData
  | ColumnsData
  | GridData
  | ProgressData
  | TabsData
  | FormData
  | StatusBarData
  | NotificationData;

// ==================== 具体模板数据 ====================

/** header 模板 */
export interface HeaderData {
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: { text: string; color?: ThemeColor };
  actions?: ActionItem[];
}

/** key-value 模板 */
export interface KeyValueData {
  pairs: Array<{
    key: string;
    value: string | number;
    icon?: string;
    color?: ThemeColor;
    copyable?: boolean;
  }>;
  layout?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
}

/** metric-bar 单项 */
export interface MetricBarData {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  color?: ThemeColor;
  detail?: string;
}

/** metric-bars 模板 */
export interface MetricBarsData {
  items: MetricBarData[];
}

/** table 模板 */
export interface TableData {
  columns: Array<{
    id: string;
    label: string;
    width?: number | string;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    format?: 'text' | 'number' | 'bytes' | 'percent' | 'badge';
  }>;
  rows: Array<Record<string, string | number>>;
  maxVisibleRows?: number;
  virtualScroll?: boolean;
  rowHeight?: number;
  defaultSort?: { column: string; order: 'asc' | 'desc' };
  onRowClick?: string;
}

/** bar-chart / line-chart 模板 */
export interface ChartData {
  series: Array<{
    name: string;
    data: number[];
    color?: ThemeColor;
    type?: 'bar' | 'line';
  }>;
  maxPoints?: number;
  height?: number;
  yUnit?: string;
  legend?: boolean;
}

/** divider 模板 */
export interface DividerData {
  label?: string;
}

// ==================== P1 模板数据 ====================

/** list 模板 */
export interface ListData {
  items: Array<{
    id: string;
    label: string;
    icon?: string;
    description?: string;
    color?: ThemeColor;
    badge?: { text: string; color?: ThemeColor };
    actions?: ActionItem[];
  }>;
  selectable?: boolean;
  maxVisibleItems?: number;
  virtualScroll?: boolean;
  itemHeight?: number;
}

/** tree-view 模板 */
export interface TreeNodeData {
  id: string;
  label: string;
  icon?: string;
  children?: TreeNodeData[];
  expanded?: boolean;
  selectable?: boolean;
}

export interface TreeViewData {
  nodes: TreeNodeData[];
  defaultExpandAll?: boolean;
}

/** log-stream 模板 */
export interface LogStreamData {
  lines: Array<{
    timestamp?: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
  }>;
  maxLines?: number;
  autoScroll?: boolean;
}

/** button-group 模板 */
export interface ButtonGroupData {
  buttons: Array<{
    id: string;
    label: string;
    icon?: string;
    color?: ThemeColor;
    variant?: 'solid' | 'outline' | 'ghost';
    disabled?: boolean;
  }>;
  layout?: 'horizontal' | 'vertical';
}

/** text 模板 */
export interface TextData {
  content: string;
  format?: 'plain' | 'code' | 'pre';
  color?: ThemeColor;
  size?: 'xs' | 'sm' | 'base';
}

// ==================== P2 模板数据 ====================

/** metric-ring 环形仪表盘 */
export interface MetricRingData {
  items: Array<{
    label: string;
    value: number;
    max?: number;
    unit?: string;
    color?: ThemeColor;
  }>;
  size?: number;
  strokeWidth?: number;
}

/** sparkline 迷你趋势线 */
export interface SparklineData {
  series: Array<{
    name?: string;
    data: number[];
    color?: ThemeColor;
  }>;
  height?: number;
  showDots?: boolean;
  showArea?: boolean;
}

/** area-chart 面积图 */
export interface AreaChartData {
  series: Array<{
    name: string;
    data: number[];
    color?: ThemeColor;
  }>;
  maxPoints?: number;
  height?: number;
  yUnit?: string;
  legend?: boolean;
  stacked?: boolean;
}

/** columns 列布局 */
export interface ColumnsData {
  columns: SectionDescriptor[][];
  widths?: string[];
  gap?: number;
}

/** grid 网格布局 */
export interface GridData {
  items: SectionDescriptor[];
  columns?: number;
  gap?: number;
}

/** progress 进度指示器 */
export interface ProgressData {
  items: Array<{
    label: string;
    value: number;
    max?: number;
    status?: 'running' | 'success' | 'error' | 'pending';
    description?: string;
    color?: ThemeColor;
  }>;
  layout?: 'vertical' | 'horizontal';
}

/** tabs 标签页 */
export interface TabsData {
  tabs: Array<{
    id: string;
    label: string;
    icon?: string;
    badge?: string;
    sections: SectionDescriptor[];
  }>;
  activeTab?: string;
}

/** form 简单表单 */
export interface FormData {
  fields: Array<{
    id: string;
    type: 'text' | 'number' | 'select' | 'toggle' | 'textarea';
    label: string;
    value?: string | number | boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
    required?: boolean;
    disabled?: boolean;
  }>;
  submitLabel?: string;
  layout?: 'vertical' | 'horizontal';
}

/** status-bar 状态栏条目 */
export interface StatusBarData {
  items: Array<{
    id: string;
    icon?: string;
    label: string;
    value?: string;
    color?: ThemeColor;
    tooltip?: string;
    clickable?: boolean;
  }>;
}

/** notification 通知 */
export interface NotificationData {
  items: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title?: string;
    message: string;
    dismissible?: boolean;
    timestamp?: string;
  }>;
}

// ==================== 面板注册 ====================

/** 面板插槽位置 */
export type PanelSlot = 'sidebar-left' | 'sidebar-right' | 'bottom-panel';

/** 面板注册选项 */
export interface PanelRegistration {
  id: string;
  title: string;
  icon: string;
  slot: PanelSlot;
  defaultSize?: number;
  defaultVisible?: boolean;
  priority?: number;
  sections?: SectionDescriptor[];
}

// ==================== 模板组件 Props ====================

/** 模板组件统一 Props */
export interface TemplateProps<T = TemplateData> {
  data: T;
  variant?: TemplateVariant;
  onEvent?: (eventId: string, payload: unknown) => void;
}
