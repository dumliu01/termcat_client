import React from 'react';
import type { TemplateProps, KeyValueData } from '../types';
import { themeColorToText } from '../utils/theme-colors';
import { resolveIcon } from '../utils/icon-resolver';

export const KeyValueTemplate: React.FC<TemplateProps<KeyValueData>> = ({ data }) => {
  const layout = data.layout || 'vertical';

  if (layout === 'horizontal') {
    return (
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-y-2 border-b bg-black/[0.02]" style={{ borderColor: 'var(--border-color)' }}>
        {data.pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {pair.icon && (() => { const I = resolveIcon(pair.icon); return I ? <I className="w-3 h-3 text-[var(--text-dim)]" /> : null; })()}
            <span className="text-[11px] text-[var(--text-dim)] font-bold">{pair.key}</span>
            <span className={`text-[11px] font-mono font-bold ${pair.color ? themeColorToText(pair.color) : 'text-[var(--text-main)]'}`}>
              {pair.value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'grid') {
    const cols = data.columns || 2;
    return (
      <div
        className="px-4 py-3 gap-3 border-b"
        style={{ borderColor: 'var(--border-color)', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {data.pairs.map((pair, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-[10px] font-black text-[var(--text-dim)] opacity-70 uppercase">{pair.key}</span>
            <span className={`text-[12px] font-mono font-bold ${pair.color ? themeColorToText(pair.color) : 'text-[var(--text-main)]'}`}>
              {pair.value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // vertical (default)
  return (
    <div className="border-b" style={{ borderColor: 'var(--border-color)' }}>
      {data.pairs.map((pair, i) => (
        <div key={i} className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pair.icon && (() => { const I = resolveIcon(pair.icon); return I ? <I className="w-3.5 h-3.5 text-[var(--text-dim)]" /> : null; })()}
            <span className="text-[11px] text-[var(--text-dim)] font-bold">{pair.key}</span>
          </div>
          <span className={`text-[12px] font-mono font-bold ${pair.color ? themeColorToText(pair.color) : 'text-[var(--text-main)]'} tracking-wide`}>
            {pair.value}
          </span>
        </div>
      ))}
    </div>
  );
};
