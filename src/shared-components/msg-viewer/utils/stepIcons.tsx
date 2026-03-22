/**
 * 步骤状态图标
 */

import React from 'react';
import { ShieldCheck, ShieldAlert, ChevronRight, RefreshCw } from 'lucide-react';

/** 根据步骤状态返回对应图标 */
export const getStepStatusIcon = (status?: string) => {
  switch (status) {
    case 'completed':
      return <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />;
    case 'failed':
      return <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />;
    case 'executing':
      return <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />;
    default:
      return <ChevronRight className="w-3.5 h-3.5 text-slate-400" />;
  }
};
