import type { Transition } from 'motion/react';

export const SIDEBAR_MOTION = {
  fast: 0.1,
  normal: 0.16,
  slow: 0.2,
  ease: [0.2, 0, 0, 1] as const,
  spring: {
    type: 'spring',
    stiffness: 500,
    damping: 45,
    mass: 0.7,
  } satisfies Transition,
} as const;
