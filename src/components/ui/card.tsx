import * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
	return <h3 className={cn('text-sm font-semibold leading-none', className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn('p-4 pt-0', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn('p-4 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
