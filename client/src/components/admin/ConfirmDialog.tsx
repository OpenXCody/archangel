import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ErrorNote, outlineButtonClass } from '../account/parts';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, naming what it happens to. */
  description: ReactNode;
  /** The action's own words, e.g. "Delete account". */
  confirmLabel: string;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before something that cannot be undone. The one place a destructive
 * action is given emphasis. Focus starts on Cancel; Escape cancels.
 */
export default function ConfirmDialog({ open, title, description, confirmLabel, busy, error, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        className="w-[calc(100%-2rem)] max-w-md gap-5 rounded-xl border-border-strong bg-bg-surface p-5 text-fg-default sm:rounded-xl [&>button]:hidden"
      >
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 break-words text-sm text-fg-muted">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <ErrorNote error={error} />
        <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
          <Button type="button" variant="outline" autoFocus disabled={busy} onClick={onCancel} className={cn('h-10', outlineButtonClass)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm} className="h-10">
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
