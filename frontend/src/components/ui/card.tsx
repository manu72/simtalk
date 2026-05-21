import * as React from 'react';

import { cn } from '../../lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('rounded-[2rem] border border-border bg-card text-card-foreground shadow-sm', className)}
      ref={ref}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div className={cn('grid gap-2 p-6 sm:p-8', className)} ref={ref} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

type CardTitleProps = React.ComponentProps<'h2'> & {
  readonly as?: 'h2' | 'h3';
};

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Comp = 'h3', className, ...props }, ref) => (
    <Comp
      className={cn('text-2xl font-semibold tracking-[-0.03em] text-foreground', className)}
      ref={ref}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(
  ({ className, ...props }, ref) => (
    <p className={cn('text-sm leading-6 text-muted-foreground', className)} ref={ref} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div className={cn('p-6 pt-0 sm:p-8 sm:pt-0', className)} ref={ref} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
