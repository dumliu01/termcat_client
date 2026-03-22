/**
 * 面板数据存储 + 事件总线
 *
 * 集中管理所有模板驱动面板的数据状态和交互事件。
 */

import type { Disposable } from '../types';
import type { PanelRegistration, SectionDescriptor, TemplateData } from './types';

// ==================== Panel Data Store ====================

class PanelDataStore {
  /** 已注册面板元数据 */
  private panels = new Map<string, PanelRegistration>();
  /** 面板当前 section 数据 */
  private panelSections = new Map<string, SectionDescriptor[]>();
  /** 面板列表变化回调（注册/注销） */
  private globalCallbacks = new Set<() => void>();
  /** 面板数据变化回调（per-panel） */
  private dataCallbacks = new Map<string, Set<() => void>>();

  /** 注册面板 */
  registerPanel(pluginId: string, registration: PanelRegistration): Disposable {
    this.panels.set(registration.id, registration);
    if (registration.sections) {
      this.panelSections.set(registration.id, registration.sections);
    }
    this.notifyGlobal();

    return {
      dispose: () => {
        this.panels.delete(registration.id);
        this.panelSections.delete(registration.id);
        this.dataCallbacks.delete(registration.id);
        this.notifyGlobal();
      },
    };
  }

  /** 移除面板 */
  unregisterPanel(panelId: string): void {
    this.panels.delete(panelId);
    this.panelSections.delete(panelId);
    this.dataCallbacks.delete(panelId);
    this.notifyGlobal();
  }

  /** 全量替换面板 sections */
  setPanelData(panelId: string, sections: SectionDescriptor[]): void {
    this.panelSections.set(panelId, sections);
    this.notifyPanelData(panelId);
  }

  /** 局部更新某个 section 的数据 */
  updateSection(panelId: string, sectionId: string, data: TemplateData): void {
    const sections = this.panelSections.get(panelId);
    if (!sections) return;

    const idx = sections.findIndex(s => s.id === sectionId);
    if (idx === -1) return;

    // 浅拷贝数组以触发 React re-render
    const updated = [...sections];
    updated[idx] = { ...updated[idx], data };
    this.panelSections.set(panelId, updated);
    this.notifyPanelData(panelId);
  }

  /** 获取已注册面板列表 */
  getPanels(slot?: string): PanelRegistration[] {
    const all = Array.from(this.panels.values());
    if (!slot) return all;
    return all.filter(p => p.slot === slot).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /** 获取面板当前 sections */
  getSections(panelId: string): SectionDescriptor[] {
    return this.panelSections.get(panelId) || [];
  }

  /** 监听面板列表变化 */
  onPanelListChange(callback: () => void): Disposable {
    this.globalCallbacks.add(callback);
    return { dispose: () => { this.globalCallbacks.delete(callback); } };
  }

  /** 监听某个面板的数据变化 */
  onPanelDataChange(panelId: string, callback: () => void): Disposable {
    if (!this.dataCallbacks.has(panelId)) {
      this.dataCallbacks.set(panelId, new Set());
    }
    this.dataCallbacks.get(panelId)!.add(callback);
    return {
      dispose: () => {
        this.dataCallbacks.get(panelId)?.delete(callback);
      },
    };
  }

  private notifyGlobal(): void {
    for (const cb of this.globalCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  private notifyPanelData(panelId: string): void {
    const cbs = this.dataCallbacks.get(panelId);
    if (!cbs) return;
    for (const cb of cbs) {
      try { cb(); } catch { /* ignore */ }
    }
  }
}

// ==================== Panel Event Bus ====================

class PanelEventBus {
  /** panelId -> eventId -> handlers */
  private handlers = new Map<string, Map<string, Set<(payload: unknown) => void>>>();

  /** 注册事件处理器 */
  on(panelId: string, eventId: string, handler: (payload: unknown) => void): Disposable {
    if (!this.handlers.has(panelId)) {
      this.handlers.set(panelId, new Map());
    }
    const panelHandlers = this.handlers.get(panelId)!;
    if (!panelHandlers.has(eventId)) {
      panelHandlers.set(eventId, new Set());
    }
    panelHandlers.get(eventId)!.add(handler);

    return {
      dispose: () => {
        panelHandlers.get(eventId)?.delete(handler);
      },
    };
  }

  /** 触发事件 */
  emit(panelId: string, eventId: string, payload: unknown): void {
    const panelHandlers = this.handlers.get(panelId);
    if (!panelHandlers) return;
    const eventHandlers = panelHandlers.get(eventId);
    if (!eventHandlers) return;
    for (const handler of eventHandlers) {
      try { handler(payload); } catch { /* ignore */ }
    }
  }

  /** 清除某面板的所有事件 */
  clearPanel(panelId: string): void {
    this.handlers.delete(panelId);
  }
}

// 单例
export const panelDataStore = new PanelDataStore();
export const panelEventBus = new PanelEventBus();
