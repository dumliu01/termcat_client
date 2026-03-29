/**
 * AI service context
 *
 * Provides app-level dependencies (user, sharedConn, availableModels) for AI Ops plugin.
 * Provided by App.tsx at the top of component tree, consumed by plugin components via useAIService().
 */

import React, { createContext, useContext } from 'react';
import type { User, AIModelInfo, AIModeInfo } from '@/utils/types';

export interface AIServiceContextValue {
  user: User | null;
  availableModels?: AIModelInfo[];
  availableModes?: string[];
  availableModeInfos?: AIModeInfo[];
  localAgentUrl?: string | null;  // deprecated: kept for backward compatibility, will be removed
}

const AIServiceContext = createContext<AIServiceContextValue>({
  user: null,
});

export const AIServiceProvider = AIServiceContext.Provider;

export function useAIService(): AIServiceContextValue {
  return useContext(AIServiceContext);
}
