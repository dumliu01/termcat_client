/**
 * 内置插件：传输管理器（底部面板）
 *
 * 自管理传输状态：
 * - 监听 Electron IPC 事件（onTransferStart/Progress/Complete/Error）
 * - 监听文件浏览器插件的 TRANSFER_START 事件（插件间通信）
 * - 对外发出 ITEM_ADDED 事件，供宿主自动切换 tab
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { BuiltinPlugin } from '../types';
import type { BottomPanelProps } from '../types';
import type { TransferItem } from '@/utils/types';
import { TransferPanel } from './components/TransferPanel';
import { builtinPluginManager } from '../builtin-plugin-manager';
import { FILE_BROWSER_EVENTS, TRANSFER_EVENTS } from '../events';
import { getLocale } from './i18n';

export { TRANSFER_EVENTS } from '../events';

// ==================== 工具函数 ====================

function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond === 0) return '0 B/s';
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ==================== 包装器组件 ====================

/**
 * 自管理状态的 TransferPanel 包装器。
 * 内部持有 transfers 状态，监听 Electron IPC + 插件事件总线。
 */
const TransferManagerWrapper: React.FC<BottomPanelProps> = ({ connectionId, theme, isVisible }) => {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const connectionIdRef = useRef(connectionId);
  connectionIdRef.current = connectionId;

  // ---------- 添加传输项（去重） ----------
  const addTransfer = useCallback((item: TransferItem) => {
    setTransfers(prev => {
      if (prev.some(t => t.id === item.id)) return prev;
      return [item, ...prev].slice(0, 100);
    });
    builtinPluginManager.emit(TRANSFER_EVENTS.ITEM_ADDED, item);
  }, []);

  // ---------- 监听文件浏览器插件的传输事件 ----------
  useEffect(() => {
    const disposable = builtinPluginManager.on(FILE_BROWSER_EVENTS.TRANSFER_START, (payload) => {
      addTransfer(payload as TransferItem);
    });
    return () => disposable.dispose();
  }, [addTransfer]);

  // ---------- 监听 Electron IPC 传输事件 ----------
  useEffect(() => {
    if (!connectionId) return;

    let startUnsub: (() => void) | undefined;
    let progressUnsub: (() => void) | undefined;
    let completeUnsub: (() => void) | undefined;
    let errorUnsub: (() => void) | undefined;

    // onTransferStart
    startUnsub = (window as any).electron?.onTransferStart?.((data: any) => {
      const id = (data && (data.transferId ?? data.id)) || null;
      if (!id) return;
      const name = data.name ?? (data.remotePath ? data.remotePath.split('/').pop() : 'transfer');
      const totalBytes = data.total ?? data.size ?? 0;
      addTransfer({
        id,
        name,
        size: totalBytes > 0 ? formatBytes(totalBytes) : 'Unknown',
        sizeBytes: totalBytes,
        progress: 0,
        transferred: data.transferred ?? 0,
        speed: '0 B/s',
        type: data.type ?? 'upload',
        status: 'running',
        timestamp: new Date().toLocaleString(),
        localPath: data.localPath,
        remotePath: data.remotePath,
        connectionId: data.connectionId ?? connectionIdRef.current ?? undefined,
        isDirectory: !!data.isDirectory,
      } as TransferItem);
    });

    // onTransferProgress
    progressUnsub = window.electron?.onTransferProgress?.((data: any) => {
      const id = (data && (data.transferId ?? data.id)) || null;
      if (!id) return;
      setTransfers(prev => prev.map(t => {
        if (t.id !== id) return t;
        const transferred = data.transferred ?? t.transferred ?? 0;
        let speedStr = t.speed ?? '0 B/s';
        if (typeof data.speed === 'number') {
          speedStr = formatSpeed(data.speed);
        } else if (typeof data.startTime === 'number' && data.startTime > 0) {
          const elapsedSec = Math.max(0.001, (Date.now() - data.startTime) / 1000);
          speedStr = formatSpeed(Math.round(transferred / elapsedSec));
        } else if (data.speed) {
          speedStr = data.speed;
        }
        return {
          ...t,
          progress: data.progress ?? t.progress,
          speed: speedStr,
          transferred,
        };
      }));
    });

    // onTransferComplete
    completeUnsub = window.electron?.onTransferComplete?.((data: any) => {
      const id = (data && (data.transferId ?? data.id)) || null;
      if (!id) return;
      setTransfers(prev => prev.map(t => {
        if (t.id !== id) return t;
        let speedStr = t.speed ?? '0 B/s';
        if (typeof data.speed === 'number') {
          speedStr = formatSpeed(data.speed);
        } else if (typeof data.startTime === 'number' && data.startTime > 0) {
          const transferred = data.transferred ?? t.transferred ?? 0;
          const elapsedSec = Math.max(0.001, (Date.now() - data.startTime) / 1000);
          speedStr = formatSpeed(Math.round(transferred / elapsedSec));
        } else if (data.speed) {
          speedStr = data.speed;
        }
        return {
          ...t,
          status: 'completed' as const,
          progress: 100,
          speed: speedStr,
          transferred: data.transferred ?? t.transferred,
        };
      }));
    });

    // onTransferError
    errorUnsub = window.electron?.onTransferError?.((data: any) => {
      const id = (data && (data.transferId ?? data.id)) || null;
      if (!id) return;
      setTransfers(prev => prev.map(t =>
        t.id === id ? { ...t, status: 'failed' as const, error: data.error ?? data.message } : t
      ));
    });

    return () => {
      startUnsub?.();
      progressUnsub?.();
      completeUnsub?.();
      errorUnsub?.();
    };
  }, [connectionId, addTransfer]);

  const handleClear = useCallback(() => {
    setTransfers([]);
  }, []);

  return React.createElement(TransferPanel, {
    transfers,
    theme,
    onClearTransfers: handleClear,
  });
};

// ==================== 插件定义 ====================

export const transferManagerPlugin: BuiltinPlugin = {
  id: 'builtin-transfer-manager',
  displayName: '传输管理',
  description: '文件上传/下载传输进度管理',
  version: '1.0.0',
  getLocalizedName: (lang) => getLocale(lang).displayName,
  getLocalizedDescription: (lang) => getLocale(lang).description,

  activate(context) {
    context.registerBottomPanel({
      id: 'transfer',
      title: 'Transfer',
      getLocalizedTitle: (lang) => getLocale(lang).tabTitle,
      icon: ArrowUpDown,
      priority: 20,
      component: TransferManagerWrapper,
    });
  },
};
