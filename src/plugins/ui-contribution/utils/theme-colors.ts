/**
 * ThemeColor → Tailwind / CSS 映射工具
 */

import type { ThemeColor } from '../types';

const BG_MAP: Record<string, string> = {
  primary: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-orange-400',
  danger: 'bg-red-500',
  info: 'bg-cyan-500',
  muted: 'bg-slate-400',
};

const TEXT_MAP: Record<string, string> = {
  primary: 'text-indigo-500',
  success: 'text-emerald-500',
  warning: 'text-orange-500',
  danger: 'text-red-500',
  info: 'text-cyan-500',
  muted: 'text-slate-400',
};

const HEX_MAP: Record<string, string> = {
  primary: '#6366f1',
  success: '#10b981',
  warning: '#f97316',
  danger: '#ef4444',
  info: '#06b6d4',
  muted: '#94a3b8',
};

/** ThemeColor → Tailwind background class（如 bg-indigo-500） */
export function themeColorToBg(color?: ThemeColor): string {
  if (!color) return BG_MAP.primary;
  return BG_MAP[color] || BG_MAP.primary;
}

/** ThemeColor → Tailwind text class */
export function themeColorToText(color?: ThemeColor): string {
  if (!color) return TEXT_MAP.primary;
  return TEXT_MAP[color] || TEXT_MAP.primary;
}

/** ThemeColor → hex 色值（用于 SVG fill/stroke） */
export function themeColorToHex(color?: ThemeColor): string {
  if (!color) return HEX_MAP.primary;
  if (HEX_MAP[color]) return HEX_MAP[color];
  // 自定义色值直接返回
  return color;
}

/** ThemeColor → 半透明 hex（用于 SVG 柱状图） */
export function themeColorToHexAlpha(color?: ThemeColor, alpha = 0.6): string {
  const hex = themeColorToHex(color);
  // 简单方案：对预定义色用 rgba
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  if (hex.startsWith('#') && hex.length === 7) {
    return hex + alphaHex;
  }
  return hex;
}
