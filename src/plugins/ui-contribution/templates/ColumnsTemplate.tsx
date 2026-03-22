import React from 'react';
import type { TemplateProps, ColumnsData } from '../types';
import { getTemplate } from './index';

export const ColumnsTemplate: React.FC<TemplateProps<ColumnsData>> = ({ data, onEvent }) => {
  const gap = data.gap ?? 8;
  const widths = data.widths || data.columns.map(() => '1fr');
  const gridCols = widths.join(' ');

  return (
    <div
      className="px-4 py-2"
      style={{ display: 'grid', gridTemplateColumns: gridCols, gap: `${gap}px` }}
    >
      {data.columns.map((sections, colIdx) => (
        <div key={colIdx} className="flex flex-col min-w-0">
          {sections.map((section, secIdx) => {
            const Template = getTemplate(section.template);
            if (!Template) return null;
            return <Template key={section.id || secIdx} data={section.data} variant={section.variant} onEvent={onEvent} />;
          })}
        </div>
      ))}
    </div>
  );
};
