import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'purple';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-rose-500/15 text-rose-500 border border-rose-500/30',
    outline: 'text-muted-foreground border-border bg-background/50',
    success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 font-semibold',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-400 font-semibold',
    purple: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-400 font-semibold',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
