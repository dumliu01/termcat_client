/**
 * 模板组件注册表
 */

import React from 'react';
import type { TemplateProps, TemplateData, TemplateType } from '../types';
import { HeaderTemplate } from './HeaderTemplate';
import { KeyValueTemplate } from './KeyValueTemplate';
import { MetricBarsTemplate } from './MetricBarsTemplate';
import { TableTemplate } from './TableTemplate';
import { BarChartTemplate } from './BarChartTemplate';
import { ListTemplate } from './ListTemplate';
import { TreeViewTemplate } from './TreeViewTemplate';
import { LogStreamTemplate } from './LogStreamTemplate';
import { ButtonGroupTemplate } from './ButtonGroupTemplate';
import { TextTemplate } from './TextTemplate';
import { MetricRingTemplate } from './MetricRingTemplate';
import { SparklineTemplate } from './SparklineTemplate';
import { AreaChartTemplate } from './AreaChartTemplate';
import { ProgressTemplate } from './ProgressTemplate';
import { TabsTemplate } from './TabsTemplate';
import { FormTemplate } from './FormTemplate';
import { StatusBarTemplate } from './StatusBarTemplate';
import { NotificationTemplate } from './NotificationTemplate';
import { ColumnsTemplate } from './ColumnsTemplate';
import { GridTemplate } from './GridTemplate';

type TemplateComponent = React.ComponentType<TemplateProps<any>>;

const templateRegistry = new Map<string, TemplateComponent>();

// 注册 P0 模板
templateRegistry.set('header', HeaderTemplate);
templateRegistry.set('key-value', KeyValueTemplate);
templateRegistry.set('metric-bars', MetricBarsTemplate);
templateRegistry.set('table', TableTemplate);
templateRegistry.set('bar-chart', BarChartTemplate);

// 注册 P1 模板
templateRegistry.set('list', ListTemplate);
templateRegistry.set('tree-view', TreeViewTemplate);
templateRegistry.set('log-stream', LogStreamTemplate);
templateRegistry.set('button-group', ButtonGroupTemplate);
templateRegistry.set('text', TextTemplate);

// 注册 P2 模板
templateRegistry.set('metric-ring', MetricRingTemplate);
templateRegistry.set('sparkline', SparklineTemplate);
templateRegistry.set('area-chart', AreaChartTemplate);
templateRegistry.set('progress', ProgressTemplate);
templateRegistry.set('tabs', TabsTemplate);
templateRegistry.set('form', FormTemplate);
templateRegistry.set('status-bar', StatusBarTemplate);
templateRegistry.set('notification', NotificationTemplate);
templateRegistry.set('columns', ColumnsTemplate);
templateRegistry.set('grid', GridTemplate);

/** 获取模板组件 */
export function getTemplate(type: TemplateType | string): TemplateComponent | undefined {
  return templateRegistry.get(type);
}

/** 注册自定义模板（供内置插件扩展） */
export function registerTemplate(type: string, component: TemplateComponent): void {
  templateRegistry.set(type, component);
}

export { templateRegistry };
