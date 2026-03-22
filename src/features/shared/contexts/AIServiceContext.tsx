/**
 * AI 服务上下文
 *
 * 为 AI Ops 插件提供 App 级别的依赖（user、sharedConn、availableModels）。
 * 由 App.tsx 在组件树顶层提供，插件组件通过 useAIService() 消费。
 */

import React, { createContext, useContext } from 'react';
import type { User, AIModelInfo } from '@/utils/types';

export interface AIServiceContextValue {
  user: User | null;
  availableModels?: AIModelInfo[];
  availableModes?: string[];
}

const AIServiceContext = createContext<AIServiceContextValue>({
  user: null,
});

export const AIServiceProvider = AIServiceContext.Provider;

export function useAIService(): AIServiceContextValue {
  return useContext(AIServiceContext);
}
