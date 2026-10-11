'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Tabs Component
 *
 * Design Principles:
 * - Square corners (rounded-none) - Brutalist aesthetic
 * - Active tab joins its panel (white fill, no bottom border)
 * - Ink borders for high contrast
 * - Monospace uppercase text
 */

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface RetroTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /**
   * When set, tabs get ids `${idPrefix}-tab-${id}`, and the selected tab gets aria-controls
   * `${idPrefix}-panel-${id}`. Only the selected tab's panel is rendered, so only it is referenced.
   */
  idPrefix?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const RetroTabs: React.FC<RetroTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  idPrefix,
  className,
  ...aria
}) => {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.map((tab, i) => ({ tab, i })).filter(({ tab }) => !tab.disabled);
  // A disabled button cannot take focus, so when the active tab is disabled the first
  // enabled one holds the tab stop instead of leaving the group unreachable by keyboard.
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab && !tab.disabled);
  const tabStop = activeIndex >= 0 ? activeIndex : (enabled[0]?.i ?? -1);

  const focusTab = (from: number, delta: number) => {
    const pos = enabled.findIndex(({ i }) => i === from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (!next) return;
    onTabChange(next.tab.id);
    refs.current[next.i]?.focus();
  };

  return (
    <div role="tablist" {...aria} className={cn('flex gap-0 border-b border-ink', className)}>
      {tabs.map((tab, i) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix && isActive ? `${idPrefix}-panel-${tab.id}` : undefined}
            aria-selected={isActive}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                focusTab(i, 1);
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                focusTab(i, -1);
              }
            }}
            className={cn(
              '-mb-px border border-b-0 border-ink px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              isActive && 'border-b-white bg-white font-bold text-ink',
              !isActive &&
                !tab.disabled &&
                'bg-panel text-ink-soft hover:bg-panel-hover hover:text-ink',
              tab.disabled && 'cursor-not-allowed bg-paper text-steel opacity-50'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
