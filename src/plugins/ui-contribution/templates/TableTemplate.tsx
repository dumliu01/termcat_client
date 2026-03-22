import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TemplateProps, TableData } from '../types';

/** 虚拟滚动 hook */
function useVirtualScroll(totalCount: number, itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  const totalHeight = totalCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return { startIndex, endIndex, totalHeight, offsetY, onScroll };
}

export const TableTemplate: React.FC<TemplateProps<TableData>> = ({ data, onEvent }) => {
  const [sortColumn, setSortColumn] = useState(data.defaultSort?.column || '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(data.defaultSort?.order || 'desc');

  const handleSort = (colId: string) => {
    if (sortColumn === colId) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colId);
      setSortOrder('desc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortColumn) return data.rows;
    return [...data.rows].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      const numA = typeof valA === 'number' ? valA : parseFloat(String(valA));
      const numB = typeof valB === 'number' ? valB : parseFloat(String(valB));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }

      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();
      if (strA < strB) return sortOrder === 'asc' ? -1 : 1;
      if (strA > strB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data.rows, sortColumn, sortOrder]);

  const gridCols = data.columns.map(col => {
    if (col.width) {
      return typeof col.width === 'number' ? `${col.width}px` : col.width;
    }
    return '1fr';
  }).join(' ');

  const rowHeight = data.rowHeight || 32;
  const maxHeight = data.maxVisibleRows ? data.maxVisibleRows * rowHeight : 200;
  const useVirtual = data.virtualScroll && sortedRows.length > 100;

  const vs = useVirtualScroll(sortedRows.length, rowHeight, maxHeight);
  const visibleRows = useVirtual
    ? sortedRows.slice(vs.startIndex, vs.endIndex)
    : sortedRows;

  return (
    <div className="flex flex-col shrink-0 border-t" style={{ borderColor: 'var(--border-color)' }}>
      {/* Header */}
      <div className="bg-indigo-500/5 px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="gap-2 text-[10px] font-black uppercase text-[var(--text-dim)]" style={{ display: 'grid', gridTemplateColumns: gridCols }}>
          {data.columns.map(col => (
            <button
              key={col.id}
              onClick={col.sortable ? () => handleSort(col.id) : undefined}
              className={`flex items-center gap-1 transition-colors text-left ${
                col.sortable ? 'hover:text-[var(--text-main)] cursor-pointer' : 'cursor-default'
              } ${sortColumn === col.id ? 'text-indigo-500' : ''}`}
              style={{ justifySelf: col.align === 'right' ? 'end' : col.align === 'center' ? 'center' : 'start' }}
            >
              <span>{col.label}</span>
              {col.sortable && sortColumn === col.id && (
                sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
      </div>
      {/* Body */}
      <div
        className="overflow-y-auto no-scrollbar"
        style={{ maxHeight: `${maxHeight}px` }}
        onScroll={useVirtual ? vs.onScroll : undefined}
      >
        {useVirtual && (
          <div style={{ height: `${vs.totalHeight}px`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: `${vs.offsetY}px`, left: 0, right: 0 }}>
              {visibleRows.map((row, i) => {
                const rowIdx = vs.startIndex + i;
                return (
                  <div
                    key={rowIdx}
                    className={`px-4 gap-2 items-center border-b hover:bg-black/5 ${data.onRowClick ? 'cursor-pointer' : ''}`}
                    style={{ display: 'grid', gridTemplateColumns: gridCols, borderColor: 'var(--border-color)', height: `${rowHeight}px` }}
                    onClick={data.onRowClick ? () => onEvent?.(data.onRowClick!, { rowIndex: rowIdx, rowData: row }) : undefined}
                  >
                    {data.columns.map(col => (
                      <span
                        key={col.id}
                        className="text-[11px] font-mono truncate text-[var(--text-dim)]"
                        style={{ textAlign: col.align || 'left' }}
                        title={String(row[col.id] ?? '')}
                      >
                        {row[col.id] ?? '--'}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!useVirtual && sortedRows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className={`px-4 py-1.5 gap-2 items-center border-b hover:bg-black/5 ${data.onRowClick ? 'cursor-pointer' : ''}`}
            style={{ display: 'grid', gridTemplateColumns: gridCols, borderColor: 'var(--border-color)' }}
            onClick={data.onRowClick ? () => onEvent?.(data.onRowClick!, { rowIndex: rowIdx, rowData: row }) : undefined}
          >
            {data.columns.map(col => (
              <span
                key={col.id}
                className="text-[11px] font-mono truncate text-[var(--text-dim)]"
                style={{ textAlign: col.align || 'left' }}
                title={String(row[col.id] ?? '')}
              >
                {row[col.id] ?? '--'}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
