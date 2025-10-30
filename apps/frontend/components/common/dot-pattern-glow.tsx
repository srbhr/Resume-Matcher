'use client';

import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import React, { useId, useRef, useState, useEffect } from 'react';
import { ClientOnly } from './client-only';

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
  [key: string]: unknown;
}

function DotPatternInner({
  width = 16,
  height = 16,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  glow = false,
  ...props
}: DotPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [dots, setDots] = useState<Array<{x: number; y: number; delay: number; duration: number}>>([]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (dimensions.width && dimensions.height) {
      const newDots = Array.from(
        {
          length: Math.ceil(dimensions.width / width) * Math.ceil(dimensions.height / height),
        },
        (_, i) => {
          const col = i % Math.ceil(dimensions.width / width);
          const row = Math.floor(i / Math.ceil(dimensions.width / width));
          return {
            x: col * width + cx,
            y: row * height + cy,
            delay: Math.random() * 5,
            duration: Math.random() * 3 + 2,
          };
        },
      );
      setDots(newDots);
    }
  }, [dimensions, width, height, cx, cy]);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      x={x}
      y={y}
      {...props}
    >
      <defs>
        <radialGradient id={`${id}-gradient`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot) => (
        <motion.circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={cr}
          fill={glow ? `url(#${id}-gradient)` : 'currentColor'}
          className="text-lime-400"
          initial={glow ? { opacity: 0.4, scale: 1 } : {}}
          animate={
            glow
              ? {
                  opacity: [0.4, 1, 0.4],
                  scale: [1, 1.5, 1],
                }
              : {}
          }
          transition={
            glow
              ? {
                  duration: dot.duration,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  delay: dot.delay,
                  ease: 'easeInOut',
                }
              : {}
          }
        />
      ))}
    </svg>
  );
}

export function DotPattern(props: DotPatternProps) {
  return (
    <ClientOnly>
      <DotPatternInner {...props} />
    </ClientOnly>
  );
}
