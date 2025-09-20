import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
	{
		variants: {
			variant: {
				default: 'bg-secondary text-secondary-foreground border-border dark:bg-input/40',
				outline: 'text-foreground',
				destructive: 'bg-destructive text-destructive-foreground border-destructive/30',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
