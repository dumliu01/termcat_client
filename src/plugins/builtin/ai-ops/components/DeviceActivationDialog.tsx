/**
 * Device Activation Dialog Component
 *
 * Modal dialog shown when a new device is detected for a licensed user.
 * Two states:
 * - Normal: Prompt to activate current device (slots available)
 * - Full: Show activated devices list and prompt to manage/unbind
 */

import React from 'react';
import { Monitor, X } from 'lucide-react';

export interface DeviceActivationDialogProps {
  open: boolean;
  onClose: () => void;
  onActivate: () => void;
  onManageDevices?: () => void;
  machinesUsed: number;
  machinesMax: number;
  devicesFull?: boolean;
  machines?: Array<{ machine_name: string; last_seen_at: string }>;
}

/**
 * Format a date string into a relative time display (Chinese).
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return '刚刚';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 30) return `${diffDays} 天前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
  return `${Math.floor(diffDays / 365)} 年前`;
}

export const DeviceActivationDialog: React.FC<DeviceActivationDialogProps> = ({
  open,
  onClose,
  onActivate,
  onManageDevices,
  machinesUsed,
  machinesMax,
  devicesFull = false,
  machines = [],
}) => {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-sm relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon + Title */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-indigo-500/10 rounded-full flex items-center justify-center">
            <Monitor className="w-4 h-4 text-indigo-400" />
          </div>
          <h3 className="text-sm font-black text-white">
            {devicesFull ? '设备数量已满' : '检测到新设备'}
          </h3>
        </div>

        {!devicesFull ? (
          /* Normal case: slots available */
          <div className="space-y-4">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              你已购买本地 Agent 能力包，是否在此设备上激活？
            </p>

            {/* Device count */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
              <span className="text-[10px] text-slate-400">已激活设备</span>
              <span className="text-xs font-black text-indigo-400">
                {machinesUsed}/{machinesMax}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onActivate}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
              >
                激活此设备
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold rounded-xl transition-all"
              >
                暂不激活
              </button>
            </div>
          </div>
        ) : (
          /* Full case: no slots left */
          <div className="space-y-4">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              已在 {machinesMax} 台设备激活：
            </p>

            {/* Device list */}
            {machines.length > 0 && (
              <div className="space-y-1.5">
                {machines.map((machine, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Monitor className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] text-slate-300 font-medium">
                        {machine.machine_name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {formatRelativeTime(machine.last_seen_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500 leading-relaxed">
              需要先解绑一台设备才能激活此设备。
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              {onManageDevices && (
                <button
                  onClick={onManageDevices}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
                >
                  管理设备
                </button>
              )}
              <button
                onClick={onClose}
                className={`${onManageDevices ? 'flex-1' : 'w-full'} py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold rounded-xl transition-all`}
              >
                暂不激活
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
