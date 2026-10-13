import { cn } from '@/utils/cn';

const statusStyles: Record<string, string> = {
  // Rooms
  AVAILABLE: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  OCCUPIED: 'bg-amber-100 text-amber-950 border-amber-200',
  RESERVED: 'bg-sky-100 text-sky-950 border-sky-200',
  CLEANING: 'bg-violet-100 text-violet-950 border-violet-200',
  MAINTENANCE: 'bg-orange-100 text-orange-950 border-orange-200',
  BLOCKED: 'bg-rose-100 text-rose-950 border-rose-200',
  // Invoices / payments
  DRAFT: 'bg-stone-100 text-stone-800 border-stone-200',
  ISSUED: 'bg-sky-100 text-sky-950 border-sky-200',
  PAID: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-950 border-amber-200',
  CANCELLED: 'bg-rose-100 text-rose-950 border-rose-200',
  REFUNDED: 'bg-violet-100 text-violet-950 border-violet-200',
  // Bookings
  CONFIRMED: 'bg-sky-100 text-sky-950 border-sky-200',
  CHECKED_IN: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  CHECKED_OUT: 'bg-stone-100 text-stone-800 border-stone-200',
  NO_SHOW: 'bg-rose-100 text-rose-950 border-rose-200',
  // Orders / tables
  SENT: 'bg-amber-100 text-amber-950 border-amber-200',
  PREPARING: 'bg-orange-100 text-orange-950 border-orange-200',
  READY: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  COMPLETED: 'bg-stone-100 text-stone-800 border-stone-200',
  CHARGED_TO_ROOM: 'bg-sky-100 text-sky-950 border-sky-200',
  HELD: 'bg-stone-100 text-stone-800 border-stone-200',
  OPEN: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  CLOSED: 'bg-stone-100 text-stone-800 border-stone-200',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        statusStyles[status] ?? 'bg-stone-100 text-stone-800 border-stone-200',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
