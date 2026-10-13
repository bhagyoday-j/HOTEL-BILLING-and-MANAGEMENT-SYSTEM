import { Dialog, DialogContent } from './dialog';
import { Button } from './button';
import { useConfirmStore } from '@/stores/confirmStore';

export function ConfirmDialog() {
  const { open, title, message, confirmLabel, danger, answer } = useConfirmStore();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && answer(false)}>
      <DialogContent title={title}>
        <p className="text-sm text-ink">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'default'}
            onClick={() => answer(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
