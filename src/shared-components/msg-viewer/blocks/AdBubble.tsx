/**
 * Ad message bubble (dual rendering mode)
 *
 * - api mode: Markdown + CTA button
 * - script mode: iframe sandbox
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { AdBlock, MsgViewerActions } from '../types';

const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-redirect-to-opener';
const DEFAULT_IFRAME_HEIGHT = 250;
const MAX_IFRAME_HEIGHT = 600;

interface Props {
  block: AdBlock;
  language: 'zh' | 'en';
  actions: MsgViewerActions;
}

export const AdBubble: React.FC<Props> = React.memo(({ block, language, actions }) => {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 px-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          {language === 'en' ? 'Agent' : 'AI 助手'}
        </span>
      </div>

      <div className="max-w-[90%] p-4 rounded-2xl bg-black/20 border border-white/5 text-[var(--text-main)] rounded-tl-none select-text space-y-3">
        {block.renderMode === 'script' ? (
          <ScriptContent block={block} />
        ) : (
          <ApiContent block={block} language={language} actions={actions} />
        )}
        <div className="flex justify-end">
          <span className="text-[8px] text-slate-600 select-none">
            {block.platformLabel || (language === 'zh' ? '推荐' : 'Recommended')}
          </span>
        </div>
      </div>
    </div>
  );
});

const ApiContent: React.FC<{ block: AdBlock; language: 'zh' | 'en'; actions: MsgViewerActions }> = ({ block, language, actions }) => (
  <>
    <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="text-indigo-300 font-bold">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          img: ({ src, alt }) => (
            <img src={src} alt={alt || 'ad'} className="rounded-lg max-w-full h-auto" loading="lazy" referrerPolicy="no-referrer" />
          ),
        }}
      >
        {block.markdownContent}
      </ReactMarkdown>
    </div>
    {block.actionText && (
      <button
        onClick={() => actions.onAdAction?.(block.id)}
        className="flex items-center gap-1.5 mt-2 px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/20 transition-colors"
      >
        <span>{block.actionText}</span>
        {block.actionType === 'url' && <ExternalLink className="w-3 h-3" />}
      </button>
    )}
  </>
);

const ScriptContent: React.FC<{ block: AdBlock }> = ({ block }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(block.scriptSize?.height || DEFAULT_IFRAME_HEIGHT);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'ad-resize' && typeof event.data.height === 'number') {
      setIframeHeight(Math.min(Math.max(event.data.height, 50), MAX_IFRAME_HEIGHT));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const usePageUrl = !!block.scriptPageUrl;
  if (!block.scriptPageUrl && !block.scriptHtml) return null;

  return (
    <iframe
      ref={iframeRef}
      {...(usePageUrl
        ? { src: block.scriptPageUrl }
        : { srcDoc: block.scriptHtml, sandbox: IFRAME_SANDBOX }
      )}
      style={{
        width: block.scriptSize?.width || '100%',
        height: iframeHeight,
        border: 'none',
        borderRadius: '8px',
        background: 'transparent',
        display: 'block',
      }}
      title="ad-content"
      loading="lazy"
    />
  );
};
