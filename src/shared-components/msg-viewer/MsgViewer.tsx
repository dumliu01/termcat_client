/**
 * MsgViewer — 通用富消息展示控件
 *
 * 基于 react-virtuoso 虚拟化列表，支持：
 * - 多种 block 类型（文本、命令、计划、工具、广告等）
 * - 流式输出（streaming）
 * - 自动滚动（loading 指示器作为数据项，followOutput 自动追踪）
 * - 可定制的空状态
 *
 * 不含任何业务逻辑，所有交互通过 actions 回调。
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Sparkles, Copy } from 'lucide-react';
import type { MsgViewerProps, MsgBlock, LoadingBlock } from './types';
import { BlockRenderer } from './blocks/BlockRenderer';

/** loading 占位 block 的固定 ID */
const LOADING_BLOCK_ID = '__msg_viewer_loading__';

export const MsgViewer: React.FC<MsgViewerProps> = ({
  blocks,
  actions,
  language,
  isLoading = false,
  loadingStatus = 'thinking',
  loadingMessage,
  passwordState,
  autoScroll = true,
  onAutoScrollChange,
  virtuosoRef,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
}) => {
  // 将 loading 指示器作为数据项追加到末尾，而非 Footer。
  // 这样 Virtuoso 的 followOutput 能自动追踪新增项并滚动。
  const displayBlocks = useMemo<MsgBlock[]>(() => {
    if (!isLoading) return blocks;
    const loadingBlock: LoadingBlock = {
      id: LOADING_BLOCK_ID,
      timestamp: Date.now(),
      type: 'loading',
      loadingStatus,
      message: loadingMessage,
    };
    return [...blocks, loadingBlock];
  }, [blocks, isLoading, loadingStatus, loadingMessage]);

  // 渲染单个消息项
  const renderItem = useCallback((index: number) => {
    const block = displayBlocks[index];
    if (!block) return null;

    // loading block 不需要"复制回复"按钮
    if (block.type === 'loading') {
      return (
        <div className="py-3">
          <BlockRenderer block={block} language={language} actions={actions} passwordState={passwordState} />
        </div>
      );
    }

    // 判断是否需要显示"复制回复"按钮
    const isAssistantType = block.type === 'assistant_text' || block.type === 'command_suggestion' ||
      block.type === 'operation_plan' || block.type === 'step_detail' || block.type === 'tool_use';
    const nextBlock = displayBlocks[index + 1];
    const isLastOfReply = isAssistantType && (!nextBlock || nextBlock.type === 'user_text');

    let replyStartIndex = index;
    if (isLastOfReply && actions.onCopyReply) {
      for (let i = index; i >= 0; i--) {
        if (displayBlocks[i].type === 'user_text') {
          replyStartIndex = i + 1;
          break;
        }
        if (i === 0) replyStartIndex = 0;
      }
    }

    return (
      <div className="py-3">
        <BlockRenderer
          block={block}
          language={language}
          actions={actions}
          passwordState={passwordState}
        />
        {isLastOfReply && actions.onCopyReply && (
          <div className="flex justify-end mt-2 mr-3">
            <button
              onClick={() => actions.onCopyReply!(replyStartIndex, index)}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
            >
              <Copy className="w-3 h-3" />
              {language === 'zh' ? '复制回复' : 'Copy Reply'}
            </button>
          </div>
        )}
      </div>
    );
  }, [displayBlocks, language, actions, passwordState]);

  // 流式输出时，最后一个 block 内容增长（高度变化）但 block 数量不变，
  // followOutput 不会触发。用 RAF 批量滚到底部，每帧最多一次。
  const scrollRAFRef = useRef(0);
  useEffect(() => {
    if (!autoScroll || displayBlocks.length === 0) return;
    cancelAnimationFrame(scrollRAFRef.current);
    scrollRAFRef.current = requestAnimationFrame(() => {
      virtuosoRef?.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER });
    });
  }, [displayBlocks, autoScroll]);

  // followOutput 改为函数：当 autoScroll 为 true 时强制跟随，
  // 避免 Virtuoso 内部 atBottom 检测因快速高度变化而暂时丢失。
  const handleFollowOutput = useCallback(
    (): 'smooth' | false => autoScroll ? 'smooth' : false,
    [autoScroll],
  );

  // 空状态（放在所有 hooks 之后，避免条件 return 导致 hooks 顺序不一致）
  if (blocks.length === 0 && !isLoading) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 select-text">
        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-3xl flex items-center justify-center text-indigo-500">
            {emptyIcon || <Sparkles className="w-8 h-8" />}
          </div>
          <div className="space-y-1 px-8">
            <h4 className="text-sm font-black" style={{ color: 'var(--text-main)' }}>
              {emptyTitle || (language === 'en' ? 'AI Operations Assistant' : 'AI 运维助手')}
            </h4>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-dim)' }}>
              {emptySubtitle || (language === 'en' ? 'Describe the operation you want to perform...' : '描述你想执行的操作...')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      className="flex-1 no-scrollbar msg-viewer-selectable"
      style={{ height: '100%' }}
      data={displayBlocks}
      followOutput={handleFollowOutput}
      atBottomThreshold={200}
      atBottomStateChange={(atBottom) => onAutoScrollChange?.(atBottom)}
      itemContent={(index) => renderItem(index)}
    />
  );
};
