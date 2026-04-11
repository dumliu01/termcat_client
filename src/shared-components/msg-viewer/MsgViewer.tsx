/**
 * MsgViewer — Universal rich message display component
 *
 * Based on react-virtuoso virtualized list, supports:
 * - Multiple block types (text, command, plan, tool, ad, etc.)
 * - Streaming output
 * - Auto-scroll (loading indicator as data item, followOutput auto-tracks)
 * - Customizable empty state
 *
 * Contains no business logic, all interactions through actions callbacks.
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Sparkles, Copy } from 'lucide-react';
import type { MsgViewerProps, MsgBlock, LoadingBlock } from './types';
import { BlockRenderer } from './blocks/BlockRenderer';

/** Fixed ID for loading placeholder block */
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
  // Append loading indicator as a data item at the end, not as a Footer.
  // This allows Virtuoso's followOutput to auto-track new items and scroll.
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

  // Render single message item
  const renderItem = useCallback((index: number) => {
    const block = displayBlocks[index];
    if (!block) return null;

    // Loading block doesn't need "copy reply" button
    if (block.type === 'loading') {
      return (
        <div className="py-3">
          <BlockRenderer block={block} language={language} actions={actions} passwordState={passwordState} />
        </div>
      );
    }

    // Determine if "copy reply" button needs to be shown
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

  // During streaming output, the last block content grows (height changes) but block count stays the same,
  // followOutput won't trigger. Use RAF to batch scroll to bottom, max once per frame.
  // Skip the initial mount to avoid visible scroll jump when restoring cached messages.
  const scrollRAFRef = useRef(0);
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (!autoScroll || displayBlocks.length === 0) return;
    cancelAnimationFrame(scrollRAFRef.current);
    scrollRAFRef.current = requestAnimationFrame(() => {
      virtuosoRef?.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER });
    });
  }, [displayBlocks, autoScroll]);

  // Change followOutput to a function: force follow when autoScroll is true,
  // to avoid Virtuoso's internal atBottom detection temporarily losing track due to rapid height changes.
  const handleFollowOutput = useCallback(
    (): 'smooth' | false => autoScroll ? 'smooth' : false,
    [autoScroll],
  );

  // When mounting with pre-existing blocks (e.g. restored from cache after pane switch),
  // start Virtuoso at the last item to avoid a visible scroll-from-top animation.
  const initialItemIndex = useMemo(() => {
    return displayBlocks.length > 0 ? displayBlocks.length - 1 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only compute on initial mount

  // Empty state (placed after all hooks to avoid conditional return causing hooks order inconsistency)
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
      initialTopMostItemIndex={initialItemIndex}
      followOutput={handleFollowOutput}
      atBottomThreshold={200}
      atBottomStateChange={(atBottom) => onAutoScrollChange?.(atBottom)}
      itemContent={(index) => renderItem(index)}
    />
  );
};
