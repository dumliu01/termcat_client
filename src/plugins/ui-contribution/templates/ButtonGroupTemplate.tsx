import React from 'react';
import type { TemplateProps, ButtonGroupData } from '../types';
import { resolveIcon } from '../utils/icon-resolver';
import { themeColorToText, themeColorToBg } from '../utils/theme-colors';

export const ButtonGroupTemplate: React.FC<TemplateProps<ButtonGroupData>> = ({ data, onEvent }) => {
  const isVertical = data.layout === 'vertical';

  return (
    <div className={`flex gap-2 px-4 py-2 ${isVertical ? 'flex-col' : 'flex-row flex-wrap'}`}>
      {data.buttons.map((btn) => {
        const Icon = resolveIcon(btn.icon);
        const variant = btn.variant || 'ghost';

        let cls = 'inline-flex items-center justify-center gap-1.5 text-xs rounded px-3 py-1.5 transition-colors';
        if (btn.disabled) {
          cls += ' opacity-40 cursor-not-allowed';
        } else {
          cls += ' cursor-pointer';
        }

        if (variant === 'solid') {
          cls += ` ${themeColorToBg(btn.color)} text-white`;
        } else if (variant === 'outline') {
          cls += ` border border-current ${themeColorToText(btn.color)}`;
        } else {
          cls += ` ${themeColorToText(btn.color)} hover:bg-[var(--bg-hover)]`;
        }

        return (
          <button
            key={btn.id}
            className={cls}
            disabled={btn.disabled}
            onClick={() => onEvent?.(btn.id, {})}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {btn.label}
          </button>
        );
      })}
    </div>
  );
};
