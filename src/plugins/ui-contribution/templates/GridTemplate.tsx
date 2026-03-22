import React from 'react';
import type { TemplateProps, GridData } from '../types';
import { getTemplate } from './index';

export const GridTemplate: React.FC<TemplateProps<GridData>> = ({ data, onEvent }) => {
  const columns = data.columns || 2;
  const gap = data.gap ?? 8;

  return (
    <div
      className="px-4 py-2"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {data.items.map((section, idx) => {
        const Template = getTemplate(section.template);
        if (!Template) return null;
        return (
          <div key={section.id || idx} className="min-w-0 rounded border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
            <Template data={section.data} variant={section.variant} onEvent={onEvent} />
          </div>
        );
      })}
    </div>
  );
};
