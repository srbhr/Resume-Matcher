export const motionTokens = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 250,
    slow: 350,
    slower: 500,
  },
  ease: {
    linear: [0, 0, 1, 1] as [number, number, number, number],
    easeOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
    easeIn: [0.7, 0, 0.84, 0] as [number, number, number, number],
    easeInOut: [0.87, 0, 0.13, 1] as [number, number, number, number],
    spring: [0.16, 1, 0.3, 1] as [number, number, number, number],
    bounce: [0.68, -0.55, 0.265, 1.55] as [number, number, number, number],
  },
  spring: {
    gentle: { type: 'spring', stiffness: 120, damping: 14 } as const,
    medium: { type: 'spring', stiffness: 160, damping: 17 } as const,
    snappy: { type: 'spring', stiffness: 200, damping: 20 } as const,
    bouncy: { type: 'spring', stiffness: 300, damping: 8 } as const,
  },
} as const;

export type MotionTokens = typeof motionTokens;
