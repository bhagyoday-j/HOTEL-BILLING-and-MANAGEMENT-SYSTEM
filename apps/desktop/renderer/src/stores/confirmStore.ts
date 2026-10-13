import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmStore extends ConfirmState {
  ask: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  answer: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  danger: false,
  resolve: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        danger: opts.danger ?? false,
        resolve,
      });
    }),
  answer: (value) => {
    get().resolve?.(value);
    set({ open: false, resolve: null });
  },
}));

/** Imperative helper: `if (await confirmDialog({...})) ...` */
export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return useConfirmStore.getState().ask(opts);
}
