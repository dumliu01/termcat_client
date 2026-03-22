import React, { useState, useCallback } from 'react';
import type { TemplateProps, FormData } from '../types';

export const FormTemplate: React.FC<TemplateProps<FormData>> = ({ data, onEvent }) => {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const f of data.fields) {
      if (f.value !== undefined) init[f.id] = f.value;
    }
    return init;
  });

  const handleChange = useCallback((fieldId: string, value: string | number | boolean) => {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    onEvent?.('form:change', { fieldId, value });
  }, [onEvent]);

  const handleSubmit = useCallback(() => {
    onEvent?.('form:submit', { values });
  }, [onEvent, values]);

  const isVertical = data.layout !== 'horizontal';

  return (
    <div className={`px-4 py-3 ${isVertical ? 'space-y-3' : 'flex flex-wrap gap-3 items-end'}`}>
      {data.fields.map(field => (
        <div key={field.id} className={`${isVertical ? '' : 'flex-1 min-w-[120px]'}`}>
          <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>

          {field.type === 'text' && (
            <input
              type="text"
              value={String(values[field.id] ?? '')}
              placeholder={field.placeholder}
              disabled={field.disabled}
              onChange={e => handleChange(field.id, e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded border bg-transparent text-[var(--text-main)] disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
            />
          )}

          {field.type === 'number' && (
            <input
              type="number"
              value={values[field.id] !== undefined ? Number(values[field.id]) : ''}
              placeholder={field.placeholder}
              disabled={field.disabled}
              onChange={e => handleChange(field.id, e.target.valueAsNumber)}
              className="w-full text-xs px-2 py-1.5 rounded border bg-transparent text-[var(--text-main)] font-mono disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
            />
          )}

          {field.type === 'textarea' && (
            <textarea
              value={String(values[field.id] ?? '')}
              placeholder={field.placeholder}
              disabled={field.disabled}
              onChange={e => handleChange(field.id, e.target.value)}
              rows={3}
              className="w-full text-xs px-2 py-1.5 rounded border bg-transparent text-[var(--text-main)] resize-none disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
            />
          )}

          {field.type === 'select' && (
            <select
              value={String(values[field.id] ?? '')}
              disabled={field.disabled}
              onChange={e => handleChange(field.id, e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded border bg-transparent text-[var(--text-main)] disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <option value="">{field.placeholder || '—'}</option>
              {field.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {field.type === 'toggle' && (
            <button
              onClick={() => !field.disabled && handleChange(field.id, !values[field.id])}
              className={`relative w-8 h-4 rounded-full transition-colors ${field.disabled ? 'opacity-40' : 'cursor-pointer'} ${
                values[field.id] ? 'bg-indigo-500' : 'bg-slate-400'
              }`}
            >
              <div
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                style={{ left: values[field.id] ? '18px' : '2px' }}
              />
            </button>
          )}
        </div>
      ))}

      {data.submitLabel && (
        <button
          onClick={handleSubmit}
          className="text-xs px-4 py-1.5 rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-medium"
        >
          {data.submitLabel}
        </button>
      )}
    </div>
  );
};
