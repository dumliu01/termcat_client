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
import { useT } from '../i18n';

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
 * Format a date string into a locale-aware relative time display.
 */
function formatRelativeTime(
  dateStr: string,
  t: ReturnType<typeof useT>,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return t.timeJustNow;

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return t.timeJustNow;
  if (diffMinutes < 60) return t.timeMinutesAgo(diffMinutes);
  if (diffHours < 24) return t.timeHoursAgo(diffHours);
  if (diffDays < 30) return t.timeDaysAgo(diffDays);
  if (diffDays < 365) return t.timeMonthsAgo(Math.floor(diffDays / 30));
  return t.timeYearsAgo(Math.floor(diffDays / 365));
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
  const t = useT();

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
            {devicesFull ? t.devicesFull : t.newDeviceDetected}
          </h3>
        </div>

        {!devicesFull ? (
          /* Normal case: slots available */
          <div className="space-y-4">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t.activatePrompt}
            </p>

            {/* Device count */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
              <span className="text-[10px] text-slate-400">{t.activatedDevices}</span>
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
                {t.activateThisDevice}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold rounded-xl transition-all"
              >
                {t.skipActivation}
              </button>
            </div>
          </div>
        ) : (
          /* Full case: no slots left */
          <div className="space-y-4">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t.devicesActivatedOn(machinesMax)}
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
                      {formatRelativeTime(machine.last_seen_at, t)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500 leading-relaxed">
              {t.unbindFirst}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              {onManageDevices && (
                <button
                  onClick={onManageDevices}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
                >
                  {t.manageDevices}
                </button>
              )}
              <button
                onClick={onClose}
                className={`${onManageDevices ? 'flex-1' : 'w-full'} py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold rounded-xl transition-all`}
              >
                {t.skipActivation}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
