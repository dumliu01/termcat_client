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
  scrollToBlockId,
  scrollNonce,
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
        <div className="py-3 px-3">
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
      <div className="py-3 px-3">
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

  // Track "is user currently at the bottom" internally so we can avoid
  // yanking the list back to the tail while they are scrolling up through
  // history. This is independent of the `autoScroll` prop: the prop is the
  // parent's *intent*; `atBottomRef` is the user's actual scroll position.
  // Flicker happens when the prop says "follow" but the user has scrolled
  // away — we now gate on both.
  const atBottomRef = useRef(true);
  const handleAtBottomChange = useCallback(
    (atBottom: boolean) => {
      atBottomRef.current = atBottom;
      onAutoScrollChange?.(atBottom);
    },
    [onAutoScrollChange],
  );

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
    if (!autoScroll || !atBottomRef.current || displayBlocks.length === 0) return;
    cancelAnimationFrame(scrollRAFRef.current);
    scrollRAFRef.current = requestAnimationFrame(() => {
      virtuosoRef?.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER });
    });
  }, [displayBlocks, autoScroll]);

  // followOutput also respects the user's current position — never force a
  // smooth animation that would snap them away from mid-history.
  const handleFollowOutput = useCallback(
    (): 'smooth' | false => (autoScroll && atBottomRef.current ? 'smooth' : false),
    [autoScroll],
  );

  // Programmatic "jump to block" — each time `scrollNonce` changes, scroll
  // the virtualized list so the matching block is visible at the top.
  // Sentinel init (undefined) ensures the very first nonce after mount still
  // triggers a scroll; without it, a freshly-mounted MsgViewer with an
  // incoming nonce would short-circuit on `scrollNonce === ref.current` and
  // silently drop the scroll request.
  const lastScrollNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (scrollNonce === undefined || scrollNonce === lastScrollNonceRef.current) return;
    lastScrollNonceRef.current = scrollNonce;
    if (!scrollToBlockId) return;
    const idx = displayBlocks.findIndex((b) => b.id === scrollToBlockId);
    if (idx < 0) return;
    // Two-stage scroll to handle variable-height items. The first jump uses
    // estimated heights and may land imprecisely; after Virtuoso measures
    // the items that rendered into view, a second pass realigns exactly.
    // Without this, far-away targets can be off by hundreds of pixels.
    requestAnimationFrame(() => {
      virtuosoRef?.current?.scrollToIndex({ index: idx, align: 'start', behavior: 'auto' });
      setTimeout(() => {
        virtuosoRef?.current?.scrollToIndex({ index: idx, align: 'start', behavior: 'smooth' });
      }, 120);
    });
  }, [scrollNonce, scrollToBlockId, displayBlocks, virtuosoRef]);

  // On initial mount, if the caller already supplied a `scrollToBlockId`, use
  // it as Virtuoso's starting anchor. `initialTopMostItemIndex` is the most
  // precise way to land on a variable-height item because it's interpreted as
  // "this index sits at the top of the viewport" rather than a height-based
  // scroll offset. Falls back to the last item (original behavior) for
  // pane-restore / streaming scenarios.
  const initialItemIndex = useMemo(() => {
    if (scrollToBlockId) {
      const idx = displayBlocks.findIndex((b) => b.id === scrollToBlockId);
      if (idx >= 0) return idx;
    }
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
      className="flex-1 msg-viewer-selectable msg-viewer-scroll"
      style={{ height: '100%' }}
      data={displayBlocks}
      initialTopMostItemIndex={initialItemIndex}
      followOutput={handleFollowOutput}
      atBottomThreshold={200}
      atBottomStateChange={handleAtBottomChange}
      itemContent={(index) => renderItem(index)}
      // Stable per-message key so items aren't re-mounted (and measured again)
      // when the data array updates (e.g. JSONL watcher appends).
      computeItemKey={(idx) => displayBlocks[idx]?.id ?? idx}
      // Pre-render a generous buffer above / below the viewport so that when
      // the user scrolls upward through previously-unseen history, heights
      // get measured BEFORE the item enters view — avoiding the
      // first-measurement layout shift that looks like flicker.
      increaseViewportBy={{ top: 1200, bottom: 600 }}
    />
  );
};
