import { buttonClass } from '@/components/ui/button';
import type { StatusTone } from '@/components/ui/status-indicator';
import type { ResumeListItem } from '@/lib/api/resume';
import { cn } from '@/lib/utils';

/**
 * The dashboard tiles' shared classes: the 5:4 shape, the blue highlight on hover
 * and keyboard focus, and the quick actions that show with it. Server-safe.
 */

// Stretched link: its ::after covers the whole tile, so the tile navigates by mouse and
// keyboard. Tile action buttons sit above it (z-10) and stay outside the link.
export const TILE_LINK =
  'after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-white';
// Action tiles (initialize, add track) are one native button filling the Card.
export const TILE_BUTTON =
  'flex flex-1 flex-col justify-between p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white';
// Tile highlight (owner ruling, round 2): hover, or keyboard focus anywhere inside a tile, fills
// the tile Hyper Blue with white text. There is no ink outline: Card interactive's
// `hover:border-ink` is overridden here so the 2px border stays transparent, and its 1px press-in
// is cancelled. Focus adds a 2px inset white ring on the link or button (a primary ring would
// vanish on the fill). Inherited text turns white with the tile; anything that sets its own
// colour (steel captions, the spinner, status squares, monogram frames) opts in below so it
// stays AA on blue (white on primary is 6.7:1).
// Every dashboard tile: 5:4, a fifth shorter than the square it was. Padded 16px (Card's
// default is 24 to 32px), so the square, a three-line title and two meta lines fit the
// shape at the narrowest tile any column count gives (about 255px wide, 204px tall).
export const TILE_SHAPE = 'aspect-5/4 h-full';
export const TILE_PAD = 'p-4 md:p-4';
export const TILE_FILL =
  'hover:border-transparent hover:translate-x-0 hover:translate-y-0 hover:bg-primary hover:text-white has-[:focus-visible]:z-20 has-[:focus-visible]:bg-primary has-[:focus-visible]:text-white';
export const TILE_WHITE = 'group-hover:text-white group-has-[:focus-visible]:text-white';
export const TILE_WHITE_BORDER = 'group-hover:border-white group-has-[:focus-visible]:border-white';
// StatusIndicator (components/ui) colours its square and label itself, so the tile reaches in.
export const TILE_STATUS =
  'group-hover:[&>span:first-child]:bg-white group-hover:[&>span:last-child]:text-white group-has-[:focus-visible]:[&>span:first-child]:bg-white group-has-[:focus-visible]:[&>span:last-child]:text-white';
// The ghost retry icon is ink: white on blue, and a darker blue (not panel) under the pointer.
export const TILE_GHOST_ICON = `${TILE_WHITE} group-hover:hover:bg-primary-hover group-hover:active:bg-primary-hover focus-visible:ring-white`;
// Tile action buttons (Set as default, Duplicate, Retry, Delete) float above the stretched link.
// Focusing one fills its tile blue, where the Button primitive's primary ring would vanish.
export const TILE_ACTION = 'z-10 focus-visible:ring-white';
export const STATUS_TONE: Record<ResumeListItem['processing_status'], StatusTone> = {
  ready: 'ready',
  processing: 'active',
  pending: 'neutral',
  failed: 'error',
};
// Quick actions on a tailored tile show on hover and keyboard focus (opacity, so Tab still
// reaches them). While hidden they take no pointer events, so a tap on a touch screen, which
// has no hover, opens the tile instead of an action nobody can see. The menu button also
// shows on touch screens, and stays while its menu is open.
export const TILE_REVEAL =
  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 focus-visible:opacity-100';
export const TILE_MENU_REVEAL = `${TILE_REVEAL} pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100`;
export const TILE_ICON_ACTION = cn(
  buttonClass({ variant: 'ghost', size: 'icon-sm' }),
  TILE_GHOST_ICON
);
