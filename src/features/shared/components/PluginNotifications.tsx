/**
 * Plugin notifications component
 *
 * Displays notification messages sent by plugins, auto-dismisses.
 */

import React from 'react';
import { X, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { usePluginNotifications } from '@/features/terminal/hooks/usePlugins';

export const PluginNotifications: React.FC = () => {
  const { notifications, dismiss } = usePluginNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {notifications.map((notification, index) => {
        const iconMap = {
          info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
          success: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
          warning: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />,
          error: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
        };

        const bgMap = {
          info: 'border-blue-500/20',
          success: 'border-green-500/20',
          warning: 'border-yellow-500/20',
          error: 'border-red-500/20',
        };

        return (
          <div
            key={index}
            className={`flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border ${bgMap[notification.type]} shadow-lg backdrop-blur-md animate-in slide-in-from-right-5 duration-300`}
          >
            {iconMap[notification.type]}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-primary)]">{notification.message}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{notification.pluginId}</p>
            </div>
            <button
              onClick={() => dismiss(index)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
