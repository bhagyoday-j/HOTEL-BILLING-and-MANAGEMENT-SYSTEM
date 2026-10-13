import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BarChart3, FileText, LayoutDashboard, Search, Settings, Users, UtensilsCrossed } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

interface Command {
  id: string;
  label: string;
  permission?: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const commands: Command[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'menu', label: 'Menu & Billing', permission: 'MENU_VIEW', path: '/restaurant', icon: UtensilsCrossed },
  { id: 'bills', label: 'Bills', permission: 'BILL_VIEW', path: '/invoices', icon: FileText },
  { id: 'analytics', label: 'Analytics', permission: 'ANALYTICS_VIEW', path: '/reports', icon: BarChart3 },
  { id: 'managers', label: 'Managers', permission: 'MANAGER_MANAGE', path: '/users', icon: Users },
  { id: 'settings', label: 'Settings', permission: 'SETTINGS_MANAGE', path: '/settings', icon: Settings },
];

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const available = useMemo(
    () => commands.filter((command) => !command.permission || user?.permissions.includes(command.permission)),
    [user],
  );
  const filtered = available.filter((command) => command.label.toLowerCase().includes(term.trim().toLowerCase()));

  const run = (path: string) => {
    navigate(path);
    setOpen(false);
    setTerm('');
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[15%] z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-paper-elevated shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Navigate</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 text-ink-muted" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Find a page"
              className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/60"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filtered[0]) run(filtered[0].path);
              }}
            />
            <kbd className="rounded border border-border bg-paper px-1.5 py-0.5 text-[10px] text-ink-muted">Esc</kbd>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">No matching pages</p>
            ) : filtered.map((command) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => run(command.path)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-paper')}
                >
                  <Icon className="h-4 w-4 text-ink-muted" />
                  {command.label}
                </button>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
