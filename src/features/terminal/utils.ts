import { RiskLevel, StepStatus } from './types';
import { logger, LOG_MODULE } from '@/base/logger/logger';

/**
 * 获取风险等级对应的颜色类名
 */
export const getRiskColor = (risk?: string): string => {
  switch (risk) {
    case 'low':
      return 'text-emerald-500 bg-emerald-500/10';
    case 'medium':
      return 'text-amber-500 bg-amber-500/10';
    case 'high':
      return 'text-rose-500 bg-rose-500/10';
    default:
      return 'text-slate-500 bg-slate-500/10';
  }
};

/**
 * 获取风险等级对应的图标颜色（用于风险徽章）
 */
export const getRiskBadgeColor = (risk?: string): string => {
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
};

/**
 * 获取步骤状态的背景色
 */
export const getStepStatusBgColor = (status?: StepStatus): string => {
  switch (status) {
    case 'completed':
      return 'rgba(16, 185, 129, 0.1)';
    case 'executing':
      return 'rgba(99, 102, 241, 0.1)';
    case 'failed':
      return 'rgba(244, 63, 94, 0.1)';
    default:
      return 'rgba(100, 116, 139, 0.05)';
  }
};

/**
 * 检测命令是否包含 sudo
 */
export const containsSudo = (command: string): boolean => {
  return /\bsudo\s+/.test(command);
};

/**
 * 生成消息 ID
 */
export const generateMessageId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

/**
 * 获取步骤执行结果的显示文本
 */
export const getStepResultText = (success?: boolean, language: 'zh' | 'en' = 'zh'): string => {
  if (success === undefined) return '';
  return success
    ? language === 'en'
      ? '✅ Success'
      : '✅ 成功'
    : language === 'en'
      ? '❌ Failed'
      : '❌ 失败';
};

// ==================== 密码管理（用于 sudo 命令） ====================

const REMEMBERED_PASSWORD_KEY = 'aiops_sudo_password';

/**
 * 获取保存的密码
 */
export const getSavedPassword = (): string => {
  try {
    return localStorage.getItem(REMEMBERED_PASSWORD_KEY) || '';
  } catch {
    return '';
  }
};

/**
 * 保存密码
 */
export const savePassword = (password: string): void => {
  try {
    if (password) {
      localStorage.setItem(REMEMBERED_PASSWORD_KEY, password);
    } else {
      localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
    }
  } catch (e) {
    logger.error(LOG_MODULE.FILE, 'aiops.password.save_failed', 'Failed to save password', {
      module: LOG_MODULE.AI,
      error: 1,
      msg: e instanceof Error ? e.message : 'Unknown error',
    });
  }
};

/**
 * 清除保存的密码
 */
export const clearSavedPassword = (): void => {
  try {
    localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
  } catch (e) {
    logger.error(LOG_MODULE.FILE, 'aiops.password.clear_failed', 'Failed to clear password', {
      module: LOG_MODULE.AI,
      error: 1,
      msg: e instanceof Error ? e.message : 'Unknown error',
    });
  }
};
