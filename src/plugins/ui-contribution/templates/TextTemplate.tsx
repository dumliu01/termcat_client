import React from 'react';
import type { TemplateProps, TextData } from '../types';
import { themeColorToText } from '../utils/theme-colors';

export const TextTemplate: React.FC<TemplateProps<TextData>> = ({ data }) => {
  const sizeClass = data.size === 'xs' ? 'text-[11px]' : data.size === 'base' ? 'text-sm' : 'text-xs';
  const colorClass = data.color ? themeColorToText(data.color) : 'text-[var(--text-main)]';

  if (data.format === 'code') {
    return (
      <div className="px-4 py-2">
        <code className={`${sizeClass} ${colorClass} font-mono bg-[var(--bg-hover)] rounded px-2 py-1 inline-block`}>
          {data.content}
        </code>
      </div>
    );
  }

  if (data.format === 'pre') {
    return (
      <pre className={`${sizeClass} ${colorClass} font-mono px-4 py-2 overflow-x-auto whitespace-pre`}>
        {data.content}
      </pre>
    );
  }

  return (
    <p className={`${sizeClass} ${colorClass} px-4 py-2 leading-relaxed`}>
      {data.content}
    </p>
  );
};
