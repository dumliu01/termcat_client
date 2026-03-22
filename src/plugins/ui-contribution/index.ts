/**
 * UI 贡献点系统 — 统一导出
 */

export { panelDataStore, panelEventBus } from './panel-data-store';
export { PanelRenderer } from './PanelRenderer';
export { getTemplate, registerTemplate, templateRegistry } from './templates';
export { resolveIcon } from './utils/icon-resolver';
export { themeColorToBg, themeColorToText, themeColorToHex } from './utils/theme-colors';

export type {
  ThemeColor,
  ActionItem,
  ContextMenuItem,
  TemplateType,
  TemplateVariant,
  TemplateData,
  SectionDescriptor,
  PanelRegistration,
  PanelSlot,
  TemplateProps,
  // P0
  HeaderData,
  KeyValueData,
  MetricBarData,
  MetricBarsData,
  TableData,
  ChartData,
  DividerData,
  // P1
  ListData,
  TreeNodeData,
  TreeViewData,
  LogStreamData,
  ButtonGroupData,
  TextData,
  // P2
  MetricRingData,
  SparklineData,
  AreaChartData,
  ColumnsData,
  GridData,
  ProgressData,
  TabsData,
  FormData,
  StatusBarData,
  NotificationData,
} from './types';
