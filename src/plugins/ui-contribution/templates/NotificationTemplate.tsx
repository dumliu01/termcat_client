import React from 'react';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import type { TemplateProps, NotificationData } from '../types';

const typeConfig = {
  info:    { icon: Info, bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-500' },
  success: { icon: CheckCircle, bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500' },
  warning: { icon: AlertTriangle, bg: 'bg-orange-400/10', border: 'border-orange-400/30', text: 'text-orange-400' },
  error:   { icon: XCircle, bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-500' },
};

export const NotificationTemplate: React.FC<TemplateProps<NotificationData>> = ({ data, onEvent }) => {
  // 兼容单项格式：{ type, title, message, ... } → items 数组
  const items = data.items || ((data as any).type ? [{ id: (data as any).id || 'default', ...(data as any) }] : []);

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {items.map(item => {
        const cfg = typeConfig[item.type];
        const TypeIcon = cfg.icon;

        return (
          <div key={item.id} className={`flex items-start gap-2 px-3 py-2 rounded border ${cfg.bg} ${cfg.border}`}>
            <TypeIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cfg.text}`} />
            <div className="flex-1 min-w-0">
              {item.title && (
                <div className={`text-xs font-bold ${cfg.text}`}>{item.title}</div>
              )}
              <div className="text-[11px] text-[var(--text-main)]">{item.message}</div>
              {item.timestamp && (
                <div className="text-[9px] text-[var(--text-dim)] mt-0.5">{item.timestamp}</div>
              )}
            </div>
            {item.dismissible && (
              <button
                onClick={() => onEvent?.('notification:dismiss', { id: item.id })}
                className="text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors p-0.5 flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
