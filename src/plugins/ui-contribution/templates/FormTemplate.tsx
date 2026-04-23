import React, { useState, useCallback } from 'react';
import type { TemplateProps, FormData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';

type Field = FormData['fields'][number];

function renderField(
  field: Field,
  values: Record<string, string | number | boolean>,
  handleChange: (id: string, v: string | number | boolean) => void,
) {
  const common =
    'w-full text-xs px-2 py-1 rounded border bg-transparent text-[var(--text-main)] disabled:opacity-40';
  const style = { borderColor: 'var(--border-color)' };
  if (field.type === 'text') {
    return (
      <input
        type="text"
        value={String(values[field.id] ?? '')}
        placeholder={field.placeholder}
        disabled={field.disabled}
        onChange={(e) => handleChange(field.id, e.target.value)}
        className={common}
        style={style}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={values[field.id] !== undefined ? Number(values[field.id]) : ''}
        placeholder={field.placeholder}
        disabled={field.disabled}
        onChange={(e) => handleChange(field.id, e.target.valueAsNumber)}
        className={common + ' font-mono'}
        style={style}
      />
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        value={String(values[field.id] ?? '')}
        placeholder={field.placeholder}
        disabled={field.disabled}
        onChange={(e) => handleChange(field.id, e.target.value)}
        rows={2}
        className={common + ' resize-none'}
        style={style}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select
        value={String(values[field.id] ?? '')}
        disabled={field.disabled}
        onChange={(e) => handleChange(field.id, e.target.value)}
        className={common}
        style={style}
      >
        <option value="">{field.placeholder || '—'}</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'toggle') {
    return (
      <button
        onClick={() => !field.disabled && handleChange(field.id, !values[field.id])}
        className={`relative w-8 h-4 rounded-full transition-colors ${
          field.disabled ? 'opacity-40' : 'cursor-pointer'
        } ${values[field.id] ? 'bg-indigo-500' : 'bg-slate-400'}`}
      >
        <div
          className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          style={{ left: values[field.id] ? '18px' : '2px' }}
        />
      </button>
    );
  }
  return null;
}

export const FormTemplate: React.FC<TemplateProps<FormData>> = ({ data, variant, onEvent }) => {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const f of data.fields) {
      if (f.value !== undefined) init[f.id] = f.value;
    }
    return init;
  });
  // Keep local state in sync when the upstream data.value changes (re-render
  // from new panel data); without this, selecting a dropdown shows the new
  // value but a later full re-render wouldn't propagate external changes.
  React.useEffect(() => {
    const next: Record<string, string | number | boolean> = {};
    for (const f of data.fields) {
      if (f.value !== undefined) next[f.id] = f.value;
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data.fields.map(f => [f.id, f.value]))]);

  const handleChange = useCallback((fieldId: string, value: string | number | boolean) => {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    // Emit both event names for compatibility: 'form:change' (conventional)
    // and 'field-change' (widely-used legacy). Payload includes both keys.
    onEvent?.('form:change', { id: fieldId, fieldId, value });
    onEvent?.('field-change', { id: fieldId, fieldId, value });
  }, [onEvent]);

  const handleSubmit = useCallback(() => {
    onEvent?.('form:submit', { values });
  }, [onEvent, values]);

  const isVertical = data.layout !== 'horizontal';
  const isCompact = variant === 'compact';

  // Compact: label on the left (inline), field on the right; minimal padding.
  if (isCompact) {
    return (
      <div className="px-3 py-1 space-y-1">
        {data.fields.map((field) => {
          const trailing = field.trailingActions ?? (field.trailingAction ? [field.trailingAction] : []);
          return (
            <div key={field.id} className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-[var(--text-dim)] uppercase shrink-0 w-14 text-right">
                {field.label}
              </label>
              <div className="flex-1 min-w-0">{renderField(field, values, handleChange)}</div>
              {trailing.map((action, i) => {
                const ActionIcon = resolveIcon(action.icon);
                const isPrimary = i === trailing.length - 1; // last action is primary-styled
                return (
                  <button
                    key={action.id}
                    onClick={() => onEvent?.(action.id, { fieldId: field.id })}
                    title={action.tooltip || action.label}
                    className={`shrink-0 w-6 h-6 flex items-center justify-center rounded ${
                      isPrimary
                        ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                        : 'border border-[var(--border-color)] text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

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
