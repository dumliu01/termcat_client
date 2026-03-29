/**
 * Markdown renderer
 *
 * Standardized rendering for AI responses, ads, and other Markdown content.
 * Supports code block copy and optional execution.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StableCodeBlock, getCodeBlockKey } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  /** List of executable code languages */
  executableCodeLangs?: string[];
  onExecuteCommand?: (command: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({ content, executableCodeLangs, onExecuteCommand }) => {
  return (
    <ReactMarkdown
      className="markdown-body text-[var(--text-main)]"
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ node, ...props }) => <h1 className="text-sm font-black mb-2 leading-tight" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xs font-bold mb-1 mt-2 leading-tight" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-[11px] font-semibold mb-1 mt-2 leading-tight" {...props} />,
        p: ({ node, ...props }) => <div className="text-xs leading-relaxed mb-1.5" {...props} />,
        ul: ({ node, ...props }) => (
          <ul className="list-disc pl-4 space-y-0.5 text-xs leading-relaxed" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal pl-4 space-y-0.5 text-xs leading-relaxed" {...props} />
        ),
        li: ({ node, ...props }) => <li className="pl-0.5" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
        code: ({ node, inline, className, children, ...props }: any) => {
          const text = String(children ?? '').trim();

          // Inline code
          if (inline) {
            return (
              <code className="px-1 py-0.5 rounded bg-white/5 text-[11px] font-mono" {...props}>
                {children}
              </code>
            );
          }

          const isSingleLineShort = !text.includes('\n') && text.length > 0 && text.length <= 40;

          // Short single-line block: compact tag style
          if (isSingleLineShort) {
            return (
              <span className="inline-flex px-2 py-0.5 mx-0.5 rounded-md bg-[#020617] border border-white/10 text-[11px] font-mono align-middle">
                {text}
              </span>
            );
          }

          // Regular multi-line code block
          return (
            <StableCodeBlock
              key={getCodeBlockKey(text)}
              text={text}
              className={className}
              executableLangs={executableCodeLangs}
              onExecuteCommand={onExecuteCommand}
            />
          );
        },
        blockquote: ({ node, ...props }) => (
          <blockquote
            className="border-l-2 border-indigo-500/60 pl-3 ml-1 text-xs leading-relaxed text-[var(--text-dim)]"
            {...props}
          />
        ),
        hr: () => <hr className="my-3 border-white/10" />,
        a: ({ node, ...props }) => (
          <a className="text-indigo-300 underline decoration-dotted underline-offset-2" target="_blank" rel="noreferrer" {...props} />
        ),
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse border border-white/10 rounded-lg" {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-white/5" {...props} />,
        th: ({ node, ...props }) => (
          <th className="px-3 py-1.5 text-left text-[11px] font-semibold border border-white/10 text-[var(--text-dim)]" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="px-3 py-1.5 text-xs border border-white/10" {...props} />
        ),
        del: ({ node, ...props }) => <del className="text-[var(--text-dim)]" {...props} />,
        input: ({ node, type, checked, ...props }) => {
          if (type === 'checkbox') {
            return <input type="checkbox" checked={checked} disabled className="mr-1.5 accent-indigo-500" />;
          }
          return <input type={type} {...props} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
