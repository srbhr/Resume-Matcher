'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { motionTokens } from '@/lib/motion/tokens';

export const AnimatedSkeleton = React.memo(function AnimatedSkeleton({
	className,
	variant = 'default',
}: {
	className?: string;
	variant?: 'default' | 'card' | 'text' | 'avatar';
}) {
	return (
		<motion.div
			className={cn(
				'relative overflow-hidden rounded-md bg-muted',
				variant === 'card' && 'aspect-[3/4] rounded-xl',
				variant === 'text' && 'h-4 rounded',
				variant === 'avatar' && 'w-12 h-12 rounded-full',
				className,
			)}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={motionTokens.spring.gentle}
		>
			<motion.div
				className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
				animate={{ x: ['0%', '200%'] }}
				transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
			/>
		</motion.div>
	);
});
