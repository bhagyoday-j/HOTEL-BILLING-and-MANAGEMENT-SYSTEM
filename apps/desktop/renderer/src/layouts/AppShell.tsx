import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  FileText,
  UsersRound,
  BarChart3,
  Settings,
  LogOut,
  ClipboardList,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { APP_NAME, APP_VERSION } from '@hotel-billing/shared';
import { useQuery } from '@tanstack/react-query';
import { CommandMenu } from '@/components/CommandMenu';
import { ConfirmDialog } from '@/components/ui/confirmDialog';
import { Toaster } from '@/components/ui/toaster';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/restaurant', label: 'Menu & Billing', icon: UtensilsCrossed, permission: 'MENU_VIEW' },
  { to: '/invoices', label: 'Bills', icon: FileText, permission: 'BILL_VIEW' },
  { to: '/customers', label: 'Customers', icon: UsersRound, permission: 'BILL_VIEW' },
  { to: '/reports', label: 'Analytics', icon: BarChart3, permission: 'ANALYTICS_VIEW' },
  { to: '/users', label: 'Managers', icon: ClipboardList, permission: 'MANAGER_MANAGE' },
  { to: '/settings', label: 'Settings', icon: Settings, permission: 'SETTINGS_MANAGE' },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const hotelQuery = useQuery({
    queryKey: ['hotel'],
    queryFn: async () => {
      const res = await api.hotel.get();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const handleLogout = async () => {
    await api.auth.logout(user?.id);
    logout();
    navigate('/login');
  };

  const visibleNav = navItems.filter(
    (item) => !item.permission || user?.permissions.includes(item.permission),
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-paper-elevated">
        <div className="border-b border-white/10 px-5 py-6">
          <div className="font-display text-2xl leading-none tracking-tight">
            {hotelQuery.data?.name ?? APP_NAME}
          </div>
          <p className="mt-2 text-xs text-sidebar-muted">
            {hotelQuery.data?.city ?? 'Front Office'}
            {hotelQuery.data?.state ? `, ${hotelQuery.data.state}` : ''}
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'bg-brass/20 text-brass-soft'
                      : 'text-sidebar-muted hover:bg-white/5 hover:text-paper-elevated',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-4 text-xs text-sidebar-muted">
          <div>{APP_NAME}</div>
          <div className="mt-0.5">Version {APP_VERSION}</div>
        </div>
        <CommandMenu />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-paper-elevated/70 px-6 backdrop-blur">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="flex items-center gap-3 rounded-lg border border-border bg-paper px-3 py-1.5 text-sm text-ink-muted transition hover:border-brass/50 hover:text-ink"
          >
            <SearchIcon />
            <span>Search…</span>
            <kbd className="ml-6 rounded border border-border bg-paper-elevated px-1.5 py-0.5 text-xs">Ctrl</kbd>
            <kbd className="rounded border border-border bg-paper-elevated px-1.5 py-0.5 text-xs">K</kbd>
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-ink">{user?.fullName}</div>
              <div className="text-xs text-ink-muted">{user?.roleCode.replace(/_/g, ' ')}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog />
      <Toaster />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
