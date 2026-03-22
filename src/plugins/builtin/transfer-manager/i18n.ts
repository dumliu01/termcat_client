import { createPluginI18n } from '../utils/create-plugin-i18n';
import { locales } from './locales';

export const { useT, getLocale } = createPluginI18n(locales, locales.zh);
