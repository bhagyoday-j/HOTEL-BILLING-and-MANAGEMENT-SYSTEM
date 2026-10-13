import * as React from 'react';
import { cn } from '@/utils/cn';

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-sm font-medium text-ink-muted leading-none', className)}
      {...props}
    />
  );
}
