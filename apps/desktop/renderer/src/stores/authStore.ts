import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SessionUser } from '@hotel-billing/shared';

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  lastUsername: string;
  setSession: (user: SessionUser, token: string) => void;
  setLastUsername: (username: string) => void;
  logout: () => void;
  hasPermission: (code: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      lastUsername: '',
      setSession: (user, token) => set({ user, token }),
      setLastUsername: (username) => set({ lastUsername: username }),
      logout: () => set({ user: null, token: null }),
      hasPermission: (code) => get().user?.permissions.includes(code) ?? false,
    }),
    {
      name: 'hotel-billing-auth',
      // localStorage (not sessionStorage): signing in survives reloads and app
      // restarts, and the user stays signed in until they log out. The server
      // keeps the matching session in SQLite.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        lastUsername: state.lastUsername,
      }),
    },
  ),
);
