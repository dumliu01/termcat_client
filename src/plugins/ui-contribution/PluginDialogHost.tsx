/**
 * PluginDialogHost — renders plugin-initiated modal dialogs (message / confirm /
 * inputbox / quickpick) requested via `api.ui.show*`. Subscribes to preload
 * channels and replies via `sendUiResponse` so the plugin's Promise resolves.
 */

import React, { useEffect, useState, useCallback } from 'react';

type MessageOpts = {
  requestId: string;
  pluginId: string;
  options: { title?: string; content: string; format?: 'plain' | 'pre' | 'code'; closeText?: string };
};

type ConfirmOpts = {
  requestId: string;
  pluginId: string;
  message: string;
  options?: { confirmText?: string; cancelText?: string };
};

type InputBoxOpts = {
  requestId: string;
  pluginId: string;
  options: { title?: string; placeholder?: string; value?: string; password?: boolean };
};

type FormField = {
  id: string;
  label: string;
  type?: 'text' | 'password' | 'textarea' | 'select';
  value?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
};
type FormOpts = {
  requestId: string;
  pluginId: string;
  options: {
    title?: string;
    description?: string;
    fields: FormField[];
    submitText?: string;
    cancelText?: string;
  };
};

type ActiveDialog =
  | { kind: 'message'; payload: MessageOpts }
  | { kind: 'confirm'; payload: ConfirmOpts }
  | { kind: 'inputbox'; payload: InputBoxOpts }
  | { kind: 'form'; payload: FormOpts };

export const PluginDialogHost: React.FC = () => {
  const [queue, setQueue] = useState<ActiveDialog[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const api = (window as any).electron?.plugin;
    if (!api?.onUiDialog) return;
    const offs: Array<() => void> = [];
    offs.push(api.onUiDialog('message', (p: MessageOpts) => setQueue((q) => [...q, { kind: 'message', payload: p }])));
    offs.push(api.onUiDialog('confirm', (p: ConfirmOpts) => setQueue((q) => [...q, { kind: 'confirm', payload: p }])));
    offs.push(api.onUiDialog('inputbox', (p: InputBoxOpts) => setQueue((q) => [...q, { kind: 'inputbox', payload: p }])));
    offs.push(api.onUiDialog('form', (p: FormOpts) => setQueue((q) => [...q, { kind: 'form', payload: p }])));
    return () => { for (const off of offs) off(); };
  }, []);

  const respond = useCallback((requestId: string, result: unknown) => {
    const api = (window as any).electron?.plugin;
    api?.sendUiResponse?.({ requestId, result });
    setQueue((q) => q.slice(1));
  }, []);

  if (!current) return null;

  if (current.kind === 'message') {
    const { requestId, options } = current.payload;
    return (
      <ModalShell title={options.title} onClose={() => respond(requestId, undefined)}>
        <div className="px-4 py-3 overflow-auto flex-1">
          <MessageBody content={options.content} format={options.format} />
        </div>
        <ModalFooter>
          <button
            className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
            onClick={() => respond(requestId, undefined)}
          >
            {options.closeText ?? '关闭'}
          </button>
        </ModalFooter>
      </ModalShell>
    );
  }

  if (current.kind === 'confirm') {
    const { requestId, message, options } = current.payload;
    return (
      <ModalShell title="确认" onClose={() => respond(requestId, false)}>
        <div className="px-4 py-3 text-sm text-[var(--text-main)] whitespace-pre-wrap flex-1 overflow-auto select-text cursor-text">
          {message}
        </div>
        <ModalFooter>
          <button
            className="px-3 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
            onClick={() => respond(requestId, false)}
          >
            {options?.cancelText ?? '取消'}
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
            onClick={() => respond(requestId, true)}
          >
            {options?.confirmText ?? '确认'}
          </button>
        </ModalFooter>
      </ModalShell>
    );
  }

  if (current.kind === 'inputbox') {
    return <InputBoxDialog payload={current.payload} respond={respond} />;
  }

  if (current.kind === 'form') {
    return <FormDialog payload={current.payload} respond={respond} />;
  }

  return null;
};

/**
 * Modal shell — mirrors the look of FileEditorModal: solid backdrop, macOS-style
 * traffic-light close button, solid `var(--bg-card)` body, sticky footer.
 */
const ModalShell: React.FC<{ title?: string; children: React.ReactNode; onClose: () => void }> = ({
  title,
  children,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-10 px-4 flex items-center gap-2 border-b shrink-0"
          style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}
        >
          <div
            onClick={onClose}
            title="关闭 (Esc)"
            className="w-3 h-3 rounded-full bg-[#ff5f56] hover:shadow-[0_0_8px_rgba(255,95,86,0.5)] cursor-pointer shrink-0"
          />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shrink-0" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] shrink-0" />
          {title && (
            <span className="ml-2 text-xs text-[var(--text-main)] truncate select-text cursor-text" title={title}>
              {title}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="px-4 py-2 border-t flex justify-end gap-2 shrink-0"
    style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}
  >
    {children}
  </div>
);

const MessageBody: React.FC<{ content: string; format?: 'plain' | 'pre' | 'code' }> = ({ content, format }) => {
  if (format === 'pre' || format === 'code') {
    return (
      <pre
        className="text-xs text-[var(--text-main)] whitespace-pre-wrap break-words font-mono p-3 rounded select-text cursor-text"
        style={{ backgroundColor: 'var(--bg-input, rgba(0,0,0,0.2))' }}
      >
        {content}
      </pre>
    );
  }
  return (
    <div className="text-sm text-[var(--text-main)] whitespace-pre-wrap break-words select-text cursor-text">
      {content}
    </div>
  );
};

const FormDialog: React.FC<{ payload: FormOpts; respond: (id: string, r: unknown) => void }> = ({ payload, respond }) => {
  const initial: Record<string, string> = {};
  for (const f of payload.options.fields) initial[f.id] = f.value ?? '';
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [missing, setMissing] = useState<string[]>([]);

  const onChange = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const submit = () => {
    const req = payload.options.fields.filter((f) => f.required && !values[f.id]?.trim()).map((f) => f.id);
    if (req.length) {
      setMissing(req);
      return;
    }
    respond(payload.requestId, values);
  };

  return (
    <ModalShell title={payload.options.title} onClose={() => respond(payload.requestId, undefined)}>
      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-3">
        {payload.options.description && (
          <p className="text-xs text-[var(--text-dim)] select-text cursor-text">
            {payload.options.description}
          </p>
        )}
        {payload.options.fields.map((f) => {
          const type = f.type ?? 'text';
          const invalid = missing.includes(f.id);
          return (
            <div key={f.id} className="space-y-1">
              <label className="block text-[11px] font-semibold text-[var(--text-main)] select-text cursor-text">
                {f.label}
                {f.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {type === 'textarea' ? (
                <textarea
                  value={values[f.id] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.id, e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 text-xs rounded border text-[var(--text-main)] focus:outline-none focus:border-indigo-500 resize-none ${
                    invalid ? 'border-red-500' : ''
                  }`}
                  style={{
                    borderColor: invalid ? undefined : 'var(--border-color)',
                    backgroundColor: 'var(--bg-input, rgba(0,0,0,0.2))',
                  }}
                />
              ) : type === 'select' ? (
                <select
                  value={values[f.id] ?? ''}
                  onChange={(e) => onChange(f.id, e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded border text-[var(--text-main)] focus:outline-none focus:border-indigo-500 ${
                    invalid ? 'border-red-500' : ''
                  }`}
                  style={{
                    borderColor: invalid ? undefined : 'var(--border-color)',
                    backgroundColor: 'var(--bg-input, rgba(0,0,0,0.2))',
                  }}
                >
                  <option value="">{f.placeholder || '—'}</option>
                  {f.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={type === 'password' ? 'password' : 'text'}
                  value={values[f.id] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) submit();
                  }}
                  className={`w-full px-3 py-2 text-xs rounded border text-[var(--text-main)] focus:outline-none focus:border-indigo-500 ${
                    invalid ? 'border-red-500' : ''
                  }`}
                  style={{
                    borderColor: invalid ? undefined : 'var(--border-color)',
                    backgroundColor: 'var(--bg-input, rgba(0,0,0,0.2))',
                  }}
                />
              )}
              {f.hint && <p className="text-[10px] text-[var(--text-dim)]">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      <ModalFooter>
        <button
          className="px-3 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
          onClick={() => respond(payload.requestId, undefined)}
        >
          {payload.options.cancelText ?? '取消'}
        </button>
        <button
          className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
          onClick={submit}
        >
          {payload.options.submitText ?? '保存'}
        </button>
      </ModalFooter>
    </ModalShell>
  );
};

const InputBoxDialog: React.FC<{ payload: InputBoxOpts; respond: (id: string, r: unknown) => void }> = ({ payload, respond }) => {
  const [value, setValue] = useState(payload.options.value ?? '');
  return (
    <ModalShell title={payload.options.title} onClose={() => respond(payload.requestId, undefined)}>
      <div className="px-4 py-4 flex-1">
        <input
          type={payload.options.password ? 'password' : 'text'}
          className="w-full px-3 py-2 text-sm rounded border text-[var(--text-main)] focus:outline-none focus:border-indigo-500"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-input, rgba(0,0,0,0.2))',
          }}
          placeholder={payload.options.placeholder}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') respond(payload.requestId, value);
            else if (e.key === 'Escape') respond(payload.requestId, undefined);
          }}
        />
      </div>
      <ModalFooter>
        <button
          className="px-3 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
          onClick={() => respond(payload.requestId, undefined)}
        >
          取消
        </button>
        <button
          className="px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
          onClick={() => respond(payload.requestId, value)}
        >
          确定
        </button>
      </ModalFooter>
    </ModalShell>
  );
};
