import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Application keyboard shortcuts:
 *  Ctrl+K global search (handled by CommandMenu)
 *  Ctrl+N new booking
 *  F2 focus search / open command menu
 *  F4 payment (invoice page context)
 *  F8 checkout (bookings page context)
 */
export function useShortcuts(onCommand?: (action: string) => void) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/bookings?new=1');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        onCommand?.('search');
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        onCommand?.('payment');
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        onCommand?.('checkout');
        return;
      }
      // Esc closes any open dialog via Radix; nothing to do here.
      void inField;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onCommand]);
}
