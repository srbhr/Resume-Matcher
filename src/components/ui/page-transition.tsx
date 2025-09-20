'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { motionTokens } from '@/lib/motion/tokens';

export const PageTransition = React.memo(function PageTransition({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -20 }}
			transition={motionTokens.spring.gentle}
			className="min-h-screen"
		>
			{children}
		</motion.div>
	);
});
