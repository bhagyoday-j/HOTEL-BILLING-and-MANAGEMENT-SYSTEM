import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: 'border-success/40 bg-success/10 text-success',
  error: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-sea/40 bg-sea/10 text-sea',
  warning: 'border-warning/40 bg-warning/10 text-warning',
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur',
              styles[t.variant],
              'bg-paper-elevated/95',
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-xs text-ink-muted">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-ink-muted transition hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
