import React, { useRef, useEffect } from 'react';
import type { TemplateProps, LogStreamData } from '../types';

const levelColors: Record<string, string> = {
  debug: 'text-slate-400',
  info:  'text-cyan-400',
  warn:  'text-orange-400',
  error: 'text-red-400',
};

export const LogStreamTemplate: React.FC<TemplateProps<LogStreamData>> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxLines = data.maxLines ?? 200;
  const lines = data.lines.slice(-maxLines);

  useEffect(() => {
    if (data.autoScroll !== false && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data.lines.length, data.autoScroll]);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto font-mono text-[11px] leading-[18px] px-3 py-2"
      style={{ maxHeight: '240px' }}
    >
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 hover:bg-[var(--bg-hover)]">
          {line.timestamp && (
            <span className="text-[var(--text-dim)] flex-shrink-0 select-none">{line.timestamp}</span>
          )}
          {line.level && (
            <span className={`flex-shrink-0 uppercase w-[42px] ${levelColors[line.level] || 'text-[var(--text-dim)]'}`}>
              {line.level}
            </span>
          )}
          <span className="text-[var(--text-main)] break-all">{line.message}</span>
        </div>
      ))}
    </div>
  );
};
