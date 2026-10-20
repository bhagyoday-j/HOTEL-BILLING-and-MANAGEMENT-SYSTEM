import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { RestaurantPage } from './pages/RestaurantPage';
import { TablesPage } from './pages/TablesPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAuthStore } from './stores/authStore';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ActivationPage } from './pages/ActivationPage';
import { useLicenseStatus } from './hooks/useLicenseStatus';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/**
 * Subscription gate. Business modules are also blocked by the local API while
 * the licence is missing or expired, so this only routes the user to the
 * activation screen instead of letting every page fail with 402s.
 */
function LicenseGate({ children }: { children: React.ReactNode }) {
  const license = useLicenseStatus();

  if (license.isPending) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center text-sm text-ink-muted">
        Checking subscription…
      </div>
    );
  }
  if (license.isError) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(license.error as Error).message}
          <button
            type="button"
            className="mt-3 block underline"
            onClick={() => void license.refetch()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!license.data || license.data.state !== 'ACTIVE') {
    return <Navigate to="/activate" replace />;
  }
  return children;
}

function PermissionRoute({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (!hasPermission(permission)) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        You do not have permission to access this page.
      </div>
    );
  }
  return children;
}

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route
          path="/activate"
          element={
            <ProtectedRoute>
              <ActivationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <LicenseGate>
                <AppShell />
              </LicenseGate>
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="rooms" element={<PermissionRoute permission="ROOM_VIEW"><ComingSoonPage title="Rooms" phase="Phase 2" /></PermissionRoute>} />
          <Route path="guests" element={<PermissionRoute permission="GUEST_VIEW"><ComingSoonPage title="Guests" phase="Phase 2" /></PermissionRoute>} />
          <Route path="bookings" element={<PermissionRoute permission="BOOKING_VIEW"><ComingSoonPage title="Bookings" phase="Phase 2" /></PermissionRoute>} />
          <Route path="tables" element={<PermissionRoute permission="MENU_VIEW"><TablesPage /></PermissionRoute>} />
          <Route path="restaurant" element={<PermissionRoute permission="MENU_VIEW"><RestaurantPage /></PermissionRoute>} />
          <Route path="invoices" element={<PermissionRoute permission="BILL_VIEW"><InvoicesPage /></PermissionRoute>} />
          <Route path="customers" element={<PermissionRoute permission="BILL_VIEW"><CustomersPage /></PermissionRoute>} />
          <Route path="expenses" element={<PermissionRoute permission="EXPENSE_VIEW"><ComingSoonPage title="Expenses" phase="Phase 2" /></PermissionRoute>} />
          <Route path="cash" element={<PermissionRoute permission="CASH_SESSION_VIEW"><ComingSoonPage title="Cash Session" phase="Phase 2" /></PermissionRoute>} />
          <Route path="reports" element={<PermissionRoute permission="ANALYTICS_VIEW"><ReportsPage /></PermissionRoute>} />
          <Route path="users" element={<PermissionRoute permission="MANAGER_MANAGE"><UsersPage /></PermissionRoute>} />
          <Route path="audit" element={<PermissionRoute permission="AUDIT_LOG_VIEW"><ComingSoonPage title="Audit Log" phase="Phase 2" /></PermissionRoute>} />
          <Route path="settings" element={<PermissionRoute permission="SETTINGS_MANAGE"><SettingsPage /></PermissionRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
