import { useState } from 'react';
import { cn } from '@/lib/utils';
import storedLogos from '../lib/logos.json';

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

interface CompanyLogoProps {
  name: string;
  /** Website domain, e.g. "micron.com". Without one the monogram is shown. */
  domain?: string | null;
  /** Edge length in px. */
  size?: number;
  className?: string;
}

/** Google's favicon service returns this size when it has no icon for a domain. */
const PLACEHOLDER_ICON_PX = 16;

/**
 * A company's logo, found from its website domain, on a monogram tile.
 *
 * The monogram (first letter of the name) is always there underneath. The
 * image is laid over it only once that very image has loaded, so a slow,
 * blocked or missing logo shows the monogram, never a broken-image icon or
 * an empty tile, and never the last company's mark when a row is reused.
 *
 * A logo is drawn for a white page, so its tile is white in both themes. The
 * mark is fitted inside it whole, at its own proportions.
 */
export default function CompanyLogo({ name, domain, size = 28, className }: CompanyLogoProps) {
  const source = logoSource(domain);
  // What became of which address: the answer for one company's logo says
  // nothing about the next one's.
  const [result, setResult] = useState<{ source: string; ok: boolean } | null>(null);
  const settled = result !== null && result.source === source ? result : null;

  const letter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-bg-elevated font-semibold text-fg-muted',
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
          onLoad={(e) => setResult({ source, ok: source.startsWith('/') || e.currentTarget.naturalWidth > PLACEHOLDER_ICON_PX })}
          onError={() => setResult({ source, ok: false })}
          className={cn(
            'absolute inset-0 h-full w-full bg-white object-contain p-[12%]',
            settled?.ok ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}
