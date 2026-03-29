/**
 * AI assistant text bubble
 *
 * Supports streaming output, segmented rendering (stable + tail) and Markdown.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import type { AssistantTextBlock } from '../types';
import { getMsgViewerLocale } from '../locales';

interface Props {
  block: AssistantTextBlock;
  language: 'zh' | 'en';
  onExecuteCommand?: (command: string) => void;
}

export const AssistantTextBubble: React.FC<Props> = React.memo(({ block, language, onExecuteCommand }) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastContentLengthRef = useRef(0);

  const content = block.content || '';
  const isStreaming = block.status === 'running';

  useEffect(() => {
    if (isStreaming) setAutoScroll(true);
  }, [isStreaming]);

  // Segmented rendering: stable content doesn't re-render, only tail re-parses each frame
  const { stableContent, tailContent } = useMemo(() => {
    if (!isStreaming || content.length === 0) {
      return { stableContent: content, tailContent: '' };
    }
    const lastDoubleNewline = content.lastIndexOf('\n\n');
    if (lastDoubleNewline === -1) {
      return { stableContent: '', tailContent: content };
    }
    return {
      stableContent: content.slice(0, lastDoubleNewline),
      tailContent: content.slice(lastDoubleNewline),
    };
  }, [content, isStreaming]);

  const handleScroll = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 50);
  }, []);

  useEffect(() => {
    const currentLength = content.length;
    if (currentLength === lastContentLengthRef.current || !autoScroll) {
      lastContentLengthRef.current = currentLength;
      return;
    }
    lastContentLengthRef.current = currentLength;
    const el = scrollContainerRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [content, autoScroll]);

  return (
    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 items-start">
      {/* Header */}
      <div className="flex items-center gap-2 px-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          {language === 'en' ? 'Agent' : 'AI 助手'}
        </span>
      </div>

      {/* Message body */}
      <div className="max-w-[90%] p-4 rounded-2xl bg-black/20 border border-white/5 text-[var(--text-main)] rounded-tl-none select-text space-y-3">
        {isStreaming && (
          <div className="flex items-center gap-2 pb-2 border-b border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[9px] font-bold text-indigo-400">
              {language === 'en' ? 'Generating...' : '生成中...'}
            </span>
          </div>
        )}

        {block.status === 'error' && block.error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{block.error}</span>
          </div>
        )}

        {block.status !== 'error' && (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
          >
            {stableContent && <MarkdownRenderer content={stableContent} executableCodeLangs={block.executableCodeLangs} onExecuteCommand={onExecuteCommand} />}
            {tailContent && <MarkdownRenderer content={tailContent} executableCodeLangs={block.executableCodeLangs} onExecuteCommand={onExecuteCommand} />}
            {!stableContent && !tailContent && <MarkdownRenderer content="" />}
          </div>
        )}

        {block.tokenUsage && (block.tokenUsage.showTokens !== false || block.tokenUsage.showGems !== false) && (() => {
          const loc = getMsgViewerLocale(language);
          return (
            <div className="pt-2 border-t border-white/5 flex items-center gap-3 text-[9px]" style={{ color: 'var(--text-dim)' }}>
              {block.tokenUsage!.showTokens !== false && (<><span>{loc.statsInputTokens}: {block.tokenUsage!.inputTokens.toLocaleString()} {loc.statsTokenUnit}</span>
              <span>{loc.statsOutputTokens}: {block.tokenUsage!.outputTokens.toLocaleString()} {loc.statsTokenUnit}</span></>)}
              {block.tokenUsage!.showGems !== false && (<span className="text-amber-500 font-black ml-auto">{loc.statsCostGems}: {block.tokenUsage!.costGems} {loc.statsGemsUnit}</span>)}
            </div>
          );
        })()}
      </div>
    </div>
  );
});
