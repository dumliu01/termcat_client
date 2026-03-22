/**
 * 内置插件事件常量
 *
 * 独立文件，避免为了引用事件常量而拉入整个插件模块。
 */

/** AI Ops 插件事件 */
export const AI_OPS_EVENTS = {
  /** AI 面板请求执行命令（payload: string — 命令文本） */
  EXECUTE_COMMAND: 'ai-ops:execute-command',
  /** 宝石余额更新（payload: number — 新余额） */
  GEMS_UPDATED: 'ai-ops:gems-updated',
  /** 请求打开会员中心/积分购买页面 */
  OPEN_MEMBERSHIP: 'ai-ops:open-membership',
} as const;

/** 命令库插件事件 */
export const COMMAND_LIBRARY_EVENTS = {
  /** 用户选中了一条命令（payload: string — 命令文本） */
  COMMAND_SELECTED: 'command-library:command-selected',
} as const;

/** 传输管理器插件事件 */
export const TRANSFER_EVENTS = {
  /** 有新传输任务添加 */
  ITEM_ADDED: 'transfer-manager:item-added',
} as const;

/** 文件浏览器插件事件 */
export const FILE_BROWSER_EVENTS = {
  /** 开始传输文件 */
  TRANSFER_START: 'file-browser:transfer-start',
} as const;
