import { useState, type ReactNode } from 'react';
import { textButtonClass } from './parts';

/** Web addresses (with or without https://) and email addresses in running text. */
const LINKS = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[a-z]{2,}[^\s<>"]*|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
/** A description longer than this opens folded. */
const FOLD_AT = 1200;
const linkClass = 'break-all text-fg-default underline underline-offset-4 hover:no-underline';

/** The text with its addresses made into links. Everything else stays text: nothing in it is run. */
function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINKS)) {
    const start = match.index ?? 0;
    // A full stop or bracket after an address belongs to the sentence, not the address.
    const found = match[0].replace(/[.,;:!?)\]]+$/, '');
    if (start > last) parts.push(text.slice(last, start));
    const href = found.includes('@') && !/^https?:/i.test(found) ? `mailto:${found}` : /^https?:/i.test(found) ? found : `https://${found}`;
    parts.push(
      href.startsWith('mailto:') ? (
        <a key={start} href={href} className={linkClass}>
          {found}
        </a>
      ) : (
        <a key={start} href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          {found}
        </a>
      )
    );
    last = start + found.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * A job's description as the company wrote it: line breaks kept, web and
 * email addresses as links. A long one opens on its first part, so the skills
 * below it are not a screen away, with the rest one press further.
 */
export default function JobDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > FOLD_AT;
  // Fold at the end of a paragraph or a sentence where there is one nearby.
  let shown = text;
  if (long && !open) {
    const head = text.slice(0, FOLD_AT);
    const paragraph = head.lastIndexOf('\n');
    const stop = paragraph > FOLD_AT / 2 ? paragraph : head.lastIndexOf('. ') + 1;
    shown = `${head.slice(0, stop > FOLD_AT / 2 ? stop : FOLD_AT).trimEnd()}${stop === paragraph ? '' : '…'}`;
  }
  return (
    <>
      <div className="whitespace-pre-line break-words" data-job-description={long ? (open ? 'open' : 'folded') : 'whole'}>
        {withLinks(shown)}
      </div>
      {long && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`${textButtonClass} mt-3`}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
