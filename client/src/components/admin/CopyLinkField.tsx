import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Field, fieldClass, outlineButtonClass } from '../account/parts';

interface CopyLinkFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  /** A path on this site; shown and copied with this page's origin in front. */
  path: string;
}

/**
 * A link that is shown once, to be passed on by hand: read-only, selected on
 * focus, with a Copy button. Same layout as the invite link.
 */
export default function CopyLinkField({ id, label, hint, path }: CopyLinkFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState(false);
  const link = `${window.location.origin}${path}`;

  useEffect(() => {
    setCopied(false);
    setRefused(false);
  }, [link]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setRefused(false);
    } catch {
      // No clipboard access (an insecure origin, or permission refused): select it for a manual copy, and say so.
      inputRef.current?.focus();
      inputRef.current?.select();
      setRefused(true);
    }
  };

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        refused ? (
          <span role="status">The browser did not allow copying. The link is selected: copy it from the box.</span>
        ) : (
          hint
        )
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          ref={inputRef}
          id={id}
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(fieldClass, 'min-w-0 font-mono text-sm')}
        />
        <Button type="button" variant="outline" onClick={() => void copy()} className={cn('h-[42px] min-w-[5.5rem]', outlineButtonClass)}>
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
    </Field>
  );
}
