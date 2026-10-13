import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, BedDouble, Users, FileText, CalendarCheck, UtensilsCrossed, BarChart3, Settings, Plus } from 'lucide-react';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: (navigate: ReturnType<typeof useNavigate>) => void;
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  // Global shortcut: Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchQuery = useQuery({
    queryKey: ['global-search', term],
    queryFn: async () => {
      const res = await api.search(term);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: open && term.trim().length >= 2,
  });

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'new-invoice',
        label: 'New Invoice',
        icon: FileText,
        run: (nav) => nav('/invoices?new=1'),
      },
      {
        id: 'new-booking',
        label: 'New Booking',
        icon: CalendarCheck,
        run: (nav) => nav('/bookings?new=1'),
      },
      {
        id: 'new-guest',
        label: 'New Guest',
        icon: Plus,
        run: (nav) => nav('/guests?new=1'),
      },
      {
        id: 'pos',
        label: 'Restaurant POS',
        icon: UtensilsCrossed,
        run: (nav) => nav('/restaurant'),
      },
      { id: 'rooms', label: 'Rooms', icon: BedDouble, run: (nav) => nav('/rooms') },
      { id: 'guests', label: 'Guests', icon: Users, run: (nav) => nav('/guests') },
      { id: 'bookings', label: 'Bookings', icon: CalendarCheck, run: (nav) => nav('/bookings') },
      { id: 'invoices', label: 'Invoices', icon: FileText, run: (nav) => nav('/invoices') },
      { id: 'reports', label: 'Reports', icon: BarChart3, run: (nav) => nav('/reports') },
      { id: 'settings', label: 'Settings', icon: Settings, run: (nav) => nav('/settings') },
    ],
    [],
  );

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(term.toLowerCase()));
  const results = searchQuery.data;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[15%] z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-paper-elevated shadow-2xl focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Global search and commands</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 text-ink-muted" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search guests, invoices, bookings, rooms… or type a command"
              className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  filtered[0].run(navigate);
                  setOpen(false);
                  setTerm('');
                }
              }}
            />
            <kbd className="rounded border border-border bg-paper px-1.5 py-0.5 text-[10px] text-ink-muted">Esc</kbd>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-2">
            {term.trim().length >= 2 && results && (
              <>
                {results.guests.length > 0 && (
                  <Section title="Guests">
                    {results.guests.map((g) => (
                      <Row
                        key={g.id}
                        icon={Users}
                        label={g.fullName}
                        hint={g.mobile ?? undefined}
                        onClick={() => {
                          navigate(`/guests?focus=${g.id}`);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </Section>
                )}
                {results.invoices.length > 0 && (
                  <Section title="Invoices">
                    {results.invoices.map((i) => (
                      <Row
                        key={i.id}
                        icon={FileText}
                        label={i.invoiceNumber}
                        hint={`${i.guestName ?? 'Walk-in'} · ₹${i.grandTotal}`}
                        onClick={() => {
                          navigate(`/invoices?focus=${i.id}`);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </Section>
                )}
                {results.bookings.length > 0 && (
                  <Section title="Bookings">
                    {results.bookings.map((b) => (
                      <Row
                        key={b.id}
                        icon={CalendarCheck}
                        label={b.bookingNumber}
                        hint={`${b.guest.fullName} · Room ${b.room.number} · ${b.status}`}
                        onClick={() => {
                          navigate(`/bookings?focus=${b.id}`);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </Section>
                )}
                {results.rooms.length > 0 && (
                  <Section title="Rooms">
                    {results.rooms.map((r) => (
                      <Row
                        key={r.id}
                        icon={BedDouble}
                        label={`Room ${r.number}`}
                        hint={r.status}
                        onClick={() => {
                          navigate(`/rooms?focus=${r.id}`);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </Section>
                )}
                {results.orders.length > 0 && (
                  <Section title="Orders">
                    {results.orders.map((o) => (
                      <Row
                        key={o.id}
                        icon={UtensilsCrossed}
                        label={o.orderNumber}
                        hint={`₹${o.grandTotal} · ${o.status}`}
                        onClick={() => {
                          navigate(`/restaurant?focus=${o.id}`);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}

            <Section title="Commands">
              {filtered.length === 0 && term.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">
                  Type to search or run a command
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">No matching commands</p>
              ) : (
                filtered.map((c) => (
                  <Row
                    key={c.id}
                    icon={c.icon}
                    label={c.label}
                    onClick={() => {
                      c.run(navigate);
                      setOpen(false);
                      setTerm('');
                    }}
                  />
                ))
              )}
            </Section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink transition',
        'hover:bg-paper',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </button>
  );
}
