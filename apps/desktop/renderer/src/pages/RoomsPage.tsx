import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCurrency } from '@/utils/cn';
import { cn } from '@/utils/cn';

export function RoomsPage() {
  const roomsQuery = useQuery({
    queryKey: ['rooms-grid'],
    queryFn: async () => {
      const res = await api.roomsGrid();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const rooms = roomsQuery.data ?? [];
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Rooms</h1>
        <p className="mt-1 text-sm text-ink-muted">Visual room grid from local SQLite.</p>
      </div>

      {roomsQuery.isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-paper-elevated" />
          ))}
        </div>
      )}

      {roomsQuery.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(roomsQuery.error as Error).message}
        </div>
      )}

      {!roomsQuery.isLoading && rooms.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-paper-elevated/60 px-6 py-16 text-center">
          <p className="text-lg font-medium text-ink">No rooms found</p>
          <p className="mt-1 text-sm text-ink-muted">Seed the database or add rooms in Settings.</p>
        </div>
      )}

      {floors.map((floor) => (
        <section key={floor} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Floor {floor}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {rooms
              .filter((r) => r.floor === floor)
              .map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={cn(
                    'rounded-xl border border-border bg-paper-elevated p-4 text-left transition hover:border-brass/50 hover:shadow-sm',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-3xl text-forest-deep">{room.number}</div>
                    <StatusBadge status={room.status} />
                  </div>
                  <div className="mt-3 text-sm text-ink">{room.typeName}</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {formatCurrency(room.price)} · {room.capacity} guests
                  </div>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
