import { zh } from './zh';
import { en } from './en';
import { es } from './es';

export const locales = { zh, en, es } as const;
export type AIOpsLocale = typeof zh;
