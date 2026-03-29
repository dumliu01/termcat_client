/**
 * Code block component
 *
 * Completely independent scroll state management, unaffected by external re-renders.
 * Supports copy and optional execution button.
 */

import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { Copy, Play } from 'lucide-react';

/** Global storage: save code block scroll state */
const codeBlockScrollState = new Map<string, number>();

/** Generate unique identifier for code block */
export const getCodeBlockKey = (text: string): string => text.slice(0, 100);

interface CodeBlockProps {
  text: string;
  className?: string;
  /** List of executable languages (e.g. ['bash','sh']), show execute button when matched */
  executableLangs?: string[];
  onExecuteCommand?: (command: string) => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ text, className, executableLangs, onExecuteCommand }) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const blockKey = getCodeBlockKey(text);
  const isRestoringRef = useRef(false);
  const isMountedRef = useRef(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLPreElement>) => {
    e.stopPropagation();
    if (isRestoringRef.current || !isMountedRef.current) return;
    const el = preRef.current;
    if (el) codeBlockScrollState.set(blockKey, el.scrollTop);
  }, [blockKey]);

  useLayoutEffect(() => {
    const savedScrollTop = codeBlockScrollState.get(blockKey);
    if (savedScrollTop !== undefined && savedScrollTop > 0) {
      const el = preRef.current;
      if (el) {
        isRestoringRef.current = true;
        el.scrollTop = savedScrollTop;
        requestAnimationFrame(() => {
          isRestoringRef.current = false;
          isMountedRef.current = true;
        });
      }
    } else {
      isMountedRef.current = true;
    }
  }, []);

  // Determine if current code block language is executable
  const isExecutable = executableLangs && className && executableLangs.some(
    lang => className.includes(`language-${lang}`)
  );

  return (
    <div className="relative group mt-2 mb-2">
      <pre
        ref={preRef}
        onScroll={handleScroll}
        className="p-2.5 rounded-lg bg-[#0f172a] border border-white/10 overflow-auto text-[11px] font-mono leading-relaxed max-h-56 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        <code className={className}>{text}</code>
      </pre>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={copyToClipboard}
          className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[9px] font-bold text-white/70 hover:text-white transition-all flex items-center gap-1"
          title="Copy"
        >
          {copiedCode === text ? (
            <span className="text-emerald-400">✓</span>
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
        {isExecutable && onExecuteCommand && (
          <button
            onClick={() => onExecuteCommand(text)}
            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-[9px] font-bold text-white transition-all flex items-center gap-1"
            title="Execute"
          >
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

/** Stable code block wrapper: same content doesn't rebuild */
export const StableCodeBlock = React.memo(CodeBlock, (prev, next) => {
  return getCodeBlockKey(prev.text) === getCodeBlockKey(next.text);
});
