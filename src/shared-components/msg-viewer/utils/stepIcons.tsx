/**
 * Step status icons
 */

import React from 'react';
import { ShieldCheck, ShieldAlert, ChevronRight, RefreshCw } from 'lucide-react';

/** Returns corresponding icon based on step status */
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
