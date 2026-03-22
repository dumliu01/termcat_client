/**
 * Agent 模式建议组件
 *
 * 显示 Agent 模式建议卡片，包括：
 * - 检测到运维任务提示
 * - Agent 模式优势说明
 * - 切换到 Agent 模式按钮
 */

import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { useT } from '../i18n';

export interface AgentSuggestionProps {
  onSwitchToAgent: () => void;
}

export const AgentSuggestion: React.FC<AgentSuggestionProps> = ({
  onSwitchToAgent,
}) => {
  const t = useT();

  return (
    <div className="px-4 pb-4">
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg shrink-0">
            <BrainCircuit className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-white mb-1">
              {t.opsTaskDetected}
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              {t.agentSuggestionDesc}
            </p>
            <button
              onClick={onSwitchToAgent}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <BrainCircuit className="w-4 h-4" />
              {t.switchToAgent}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
