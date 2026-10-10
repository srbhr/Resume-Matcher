/** The motion vocabulary (spec §7). CSS uses the same values via globals.css. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  press: 0.1,
  surface: 0.2,
  exit: 0.12,
  menuIn: 0.12,
  menuOut: 0.08,
  list: 0.15,
  swap: 0.1,
  routeTransition: 0.25,
} as const;

/** Critically damped: velocity carries through interruptions, never bounces. */
export const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;
