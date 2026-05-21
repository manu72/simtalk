import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.08em] uppercase',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        success: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        warning: 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300',
        destructive: 'border-destructive/30 bg-destructive/12 text-destructive'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant, className }))} {...props} />
);

export { Badge, badgeVariants };
