'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { motionTokens } from '@/lib/motion/tokens';
import CountUp from 'react-countup';
import { TrendingUp } from 'lucide-react';

export type StatsCardProps = {
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	label: string;
	value: number;
	trend?: number;
	color?: 'blue' | 'green' | 'orange';
	className?: string;
};

export const AnimatedStatsCard = React.memo(function AnimatedStatsCard({
	icon: Icon,
	label,
	value,
	trend,
	color = 'blue',
	className,
}: StatsCardProps) {
	const [displayValue, setDisplayValue] = React.useState(0);

	React.useEffect(() => {
		const timer = setTimeout(() => setDisplayValue(value), 300);
		return () => clearTimeout(timer);
	}, [value]);

	return (
		<motion.div
			className={cn(
				'relative p-6 rounded-2xl bg-gradient-to-br from-white to-gray-50',
				'dark:from-background dark:to-black',
				'border border-border',
				'shadow-lg hover:shadow-xl transition-shadow duration-300',
				className,
			)}
			whileHover={{ scale: 1.02, y: -4 }}
			transition={motionTokens.spring.gentle}
		>
			<div className="absolute top-0 right-0 w-32 h-32 opacity-5">
				<Icon className="w-full h-full" />
			</div>

			<div className="relative space-y-3">
				<motion.div
					className={cn(
						'inline-flex p-3 rounded-xl',
						color === 'blue' &&
							'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
						color === 'green' &&
							'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
						color === 'orange' &&
							'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
					)}
					whileHover={{ rotate: [0, 5, -5, 0] }}
					transition={{ duration: 0.5 }}
				>
					<Icon className="w-6 h-6" />
				</motion.div>

				<div>
					<motion.h3
						className="text-3xl font-bold text-foreground"
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
					>
						<CountUp end={displayValue} duration={1.2} />
					</motion.h3>
					<p className="text-sm text-muted-foreground">{label}</p>
				</div>

				{typeof trend === 'number' && (
					<motion.div
						className="flex items-center gap-1 text-sm"
						initial={{ opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.4, ...motionTokens.spring.gentle }}
					>
						<TrendingUp className="w-4 h-4 text-green-500" />
						<span className="text-green-600 dark:text-green-400 font-medium">
							+{trend}%
						</span>
						<span className="text-muted-foreground">vs last month</span>
					</motion.div>
				)}
			</div>
		</motion.div>
	);
});
