/**
 * 交互式确认对话框组件
 *
 * 显示远程服务器需要确认的交互式提示，包括：
 * - 提示内容显示
 * - 确认按钮（y）
 * - 取消按钮（n）
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

export interface InteractionDialogProps {
  prompt: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const InteractionDialog: React.FC<InteractionDialogProps> = ({
  prompt,
  onConfirm,
  onCancel,
}) => {
  const t = useT();

  return (
    <div className="px-4 py-3 border-t bg-amber-500/10" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400 mb-2">
            {t.requiresConfirmation}
          </p>
          <p className="text-xs text-slate-300 font-mono bg-black/30 px-3 py-2 rounded-lg mb-3">
            {prompt}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {t.confirmYes}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {t.cancelNo}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
