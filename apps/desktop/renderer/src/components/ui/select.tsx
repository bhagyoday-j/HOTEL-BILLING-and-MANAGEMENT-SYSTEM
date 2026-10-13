import { cn } from '@/utils/cn';

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-paper-elevated px-3 text-sm text-ink shadow-sm transition focus:border-brass focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[72px] w-full rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm text-ink shadow-sm transition placeholder:text-ink-muted/60 focus:border-brass focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
