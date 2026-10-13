import { cn } from '@/utils/cn';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-paper-elevated/90 p-5 shadow-[0_1px_0_rgba(26,28,25,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h3 className={cn('text-sm font-medium text-ink-muted', className)}>{children}</h3>;
}

export function CardValue({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mt-2 text-2xl font-semibold tracking-tight text-ink', className)}>{children}</div>;
}
