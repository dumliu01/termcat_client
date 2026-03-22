/**
 * 客户端版本信息
 *
 * 版本号唯一来源：package.json 的 "version" 字段
 * 构建时由 vite.config.ts 通过 define 注入 __APP_VERSION__
 */

declare const __APP_VERSION__: string;

/** 版本字符串，如 "0.1.1" */
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** 解析版本号各段 */
function parseVersion(v: string): { major: number; minor: number; build: number } {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    build: parts[2] || 0,
  };
}

export const VERSION = parseVersion(appVersion);

/** 显示版本号，如 v0.1.1 */
export const VERSION_STRING = `v${appVersion}`;

/** 版本比较数值，越大越新 */
export const VERSION_NUMBER = VERSION.major * 1000000 + VERSION.minor * 1000 + VERSION.build;

/** 将版本字符串转为数值，用于比较 */
export function versionToNumber(v: string): number {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return (parts[0] || 0) * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
}
