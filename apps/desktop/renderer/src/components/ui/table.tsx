import { cn } from '@/utils/cn';

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border bg-paper-elevated', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-border bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-muted">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn('transition hover:bg-paper/70', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  onClick,
  sorted,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  sorted?: 'asc' | 'desc' | false;
}) {
  return (
    <th
      onClick={onClick}
      className={cn('px-4 py-2.5 font-medium', onClick && 'cursor-pointer select-none hover:text-ink', className)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sorted && <span aria-hidden>{sorted === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

export function TD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 text-ink', className)}>{children}</td>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-paper-elevated/60 px-6 py-12 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}
