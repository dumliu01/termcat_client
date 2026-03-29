/**
 * Risk level color utility functions
 */

import type { RiskLevel, StepStatus } from '../types';

/** Risk level → Tailwind color class */
export function getRiskColor(risk?: RiskLevel | string): string {
  switch (risk) {
    case 'low':
      return 'bg-emerald-500/10 text-emerald-500';
    case 'medium':
      return 'bg-amber-500/10 text-amber-500';
    case 'high':
      return 'bg-rose-500/10 text-rose-500';
    default:
      return 'bg-slate-500/10 text-slate-500';
  }
}

/** Step status → background color */
export function getStepStatusBgColor(status?: StepStatus | string): string {
  switch (status) {
    case 'completed':
      return 'rgba(16, 185, 129, 0.06)';
    case 'failed':
      return 'rgba(239, 68, 68, 0.06)';
    case 'executing':
      return 'rgba(99, 102, 241, 0.06)';
    default:
      return 'transparent';
  }
}
