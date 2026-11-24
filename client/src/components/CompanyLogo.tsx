import { useState } from 'react';
import { cn } from '@/lib/utils';
import storedLogos from '../lib/logos.json';
import { markSource, useHandMarks, type HandMark } from '../lib/marks';

/**
 * What `scripts/fetch-logos.mjs` found for each company domain the data
 * names: the file type of the logo stored in `client/public/logos/`, or null
 * for a domain known to have no usable mark.
 */
const STORED: Record<string, string | null> = storedLogos;

/**
 * Where a domain's logo is loaded from, or null to show the lettermark
 * without asking anyone. A stored logo comes from this site. Only a domain
 * the list has never seen (one an admin has just set) is looked up from
 * Google's favicon service.
 */
function logoSource(domain: string | null | undefined): string | null {
  const key = (domain ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!key) return null;
  if (key in STORED) {
    const type = STORED[key];
    return type ? `/logos/${key}.${type}` : null;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(key)}&sz=128`;
}

/**
 * The mark an admin set by hand for this company, when there is one: found
 * by the company's name, else by its domain. It comes before anything found
 * from the domain.
 */
function handMark(marks: HandMark[] | undefined, name: string, domain: string | null | undefined): HandMark | null {
  if (!marks || marks.length === 0) return null;
  const wanted = name.trim().toLowerCase();
  const key = (domain ?? '').trim().toLowerCase().replace(/^www\./, '');
  return marks.find((mark) => mark.name.toLowerCase() === wanted) ?? (key ? marks.find((mark) => mark.domain === key) : undefined) ?? null;
}

interface CompanyLogoProps {
  name: string;
  /** Website domain, e.g. "micron.com". Without one the monogram is shown. */
  domain?: string | null;
  /** Edge length in px. */
  size?: number;
  className?: string;
  /**
   * An image to show in place of anything looked up: the editor's preview of
   * a mark not yet saved. `false` shows what the domain gives, ignoring a
   * mark set by hand (the editor's "automatic" tile).
   */
  image?: string | false;
}

/** Google's favicon service returns this size when it has no icon for a domain. */
const PLACEHOLDER_ICON_PX = 16;

/**
 * A company's logo on a monogram tile: the mark an admin set by hand when
 * there is one, else the one found from its website domain.
 *
 * The monogram (first letter of the name) is always there underneath. The
 * image is laid over it only once that very image has loaded, so a slow,
 * blocked or missing logo shows the monogram, never a broken-image icon or
 * an empty tile, and never the last company's mark when a row is reused.
 *
 * A logo is drawn for a white page, so it always stands on a white backing
 * (`--logo-backing`, the one white the token file holds), in both themes. On
 * the dark canvas the tile carries a hairline ring; on the light one it has
 * no edge at all. The corner is 6px. The mark is fitted inside it whole, at
 * its own proportions. A tile is 32px in a list and 40px on Explore's cards.
 */
export default function CompanyLogo({ name, domain, size = 32, className, image }: CompanyLogoProps) {
  const marks = useHandMarks();
  const byHand = image === undefined ? handMark(marks.data, name, domain) : null;
  const source = typeof image === 'string' ? image : byHand ? markSource(byHand) : logoSource(domain);
  // What became of which address: the answer for one company's logo says
  // nothing about the next one's.
  const [result, setResult] = useState<{ source: string; ok: boolean } | null>(null);
  const settled = result !== null && result.source === source ? result : null;

  const letter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-md bg-surface font-semibold text-text-2 dark:ring-1 dark:ring-line',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), lineHeight: 1 }}
    >
      {letter}
      {source !== null && settled?.ok !== false && (
        <img
          // A new address is a new element, so the picture that was here
          // before is gone at once and the monogram shows until this one loads.
          key={source}
          src={source}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          // A stored logo was checked when it was stored; the size test is for
          // the favicon service, which answers with a 16 px placeholder when it
          // has nothing.
          onLoad={(e) => setResult({ source, ok: !source.startsWith('https://') || e.currentTarget.naturalWidth > PLACEHOLDER_ICON_PX })}
          onError={() => setResult({ source, ok: false })}
          className={cn(
            'absolute inset-0 h-full w-full bg-logo-backing object-contain p-[12%]',
            settled?.ok ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}
