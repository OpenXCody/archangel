import { useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ErrorNote, busyButtonClass, outlineButtonClass } from '../account/parts';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, naming what it happens to. */
  description: ReactNode;
  /** The action's own words, e.g. "Delete account". */
  confirmLabel: string;
  /** `danger` (the default) for what cannot be undone; `plain` for a step that only deserves a second look. */
  tone?: 'danger' | 'plain';
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before something that cannot be undone, or that grants a lot. The one
 * place a destructive action is given emphasis. Focus starts on Cancel;
 * Escape cancels; closing puts focus back on the control that opened it.
 */
export default function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', busy, error, onConfirm, onCancel }: ConfirmDialogProps) {
  // What had focus when the dialog opened: the button that asked for it.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpen.current = open;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
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
          <Button
            type="button"
            variant="outline"
            autoFocus
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onCancel();
            }}
            className={cn('h-10', outlineButtonClass, busyButtonClass)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            aria-disabled={busy}
            aria-busy={busy}
            onClick={() => {
              if (!busy) onConfirm();
            }}
            className={cn('h-10', busyButtonClass)}
            data-confirm
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
