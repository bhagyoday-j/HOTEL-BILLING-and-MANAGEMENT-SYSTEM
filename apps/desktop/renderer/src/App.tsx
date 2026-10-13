import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RoomsPage } from './pages/RoomsPage';
import { GuestsPage } from './pages/GuestsPage';
import { BookingsPage } from './pages/BookingsPage';
import { RestaurantPage } from './pages/RestaurantPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { CashSessionPage } from './pages/CashSessionPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAuthStore } from './stores/authStore';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="restaurant" element={<RestaurantPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="cash" element={<CashSessionPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
