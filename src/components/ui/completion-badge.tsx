import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SectionStatus = 'empty' | 'partial' | 'complete';

export function CompletionBadge({
	status,
	size = 'sm',
}: {
	status?: SectionStatus;
	size?: 'xs' | 'sm';
}) {
	if (!status) return null;
	const label = status === 'complete' ? 'Complete' : status === 'partial' ? 'Partial' : 'Empty';
	const color =
		status === 'complete'
			? 'bg-emerald-100 text-emerald-700 border-emerald-200'
			: status === 'partial'
			? 'bg-amber-100 text-amber-700 border-amber-200'
			: 'bg-red-100 text-red-700 border-red-200';
	return (
		<Badge
			className={cn(
				'rounded-md',
				color,
				size === 'xs' ? 'text-[10px] px-1 py-0' : 'text-[11px] px-2 py-0.5',
			)}
		>
			{label}
		</Badge>
	);
}
