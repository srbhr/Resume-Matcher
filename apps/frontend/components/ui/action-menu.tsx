'use client';

import './ui-sdk.css';
import * as React from 'react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@ui-sdk/react/menu';
import { buttonClass } from './button';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  value: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * An icon button that opens a short list of actions: ui-sdk's Menu (arrow keys,
 * typeahead, Escape returns focus) in the Swiss look. The list is a white panel
 * with an ink border and the menu shadow; the highlighted item is an ink fill,
 * a destructive one red. It sets its own text colour, since the menu renders in
 * place and would otherwise inherit its surroundings' (a tile turns white on hover).
 */
export function ActionMenu({
  label,
  items,
  onAction,
  triggerClassName,
  children,
}: {
  /** The trigger's accessible name and tooltip. */
  label: string;
  items: ActionMenuItem[];
  onAction: (value: string) => void;
  triggerClassName?: string;
  /** The trigger's icon. */
  children: React.ReactNode;
}) {
  return (
    <Menu onAction={(value) => onAction(value)}>
      <MenuTrigger
        aria-label={label}
        title={label}
        className={cn(buttonClass({ variant: 'ghost', size: 'icon-sm' }), triggerClassName)}
      >
        {children}
      </MenuTrigger>
      <MenuContent className="min-w-40 rounded-none border border-ink bg-white p-1 text-ink shadow-sw-default">
        {items.map((item) => (
          <MenuItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            destructive={item.destructive}
            className={cn(
              'cursor-default rounded-none px-3 py-2 font-mono text-xs uppercase tracking-wide text-ink data-[disabled]:text-steel',
              item.destructive
                ? 'text-destructive data-[highlighted]:bg-destructive data-[highlighted]:text-white'
                : 'data-[highlighted]:bg-ink data-[highlighted]:text-white'
            )}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
