import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import storedLogos from '../lib/logos.json';

/**
 * What `scripts/fetch-logos.mjs` found for each curated company domain: the
 * file type of the logo stored in `client/public/logos/`, or null for a
 * domain known to have no usable mark.
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
 * image is laid over it only once it has loaded, so a slow, blocked or
 * missing logo shows the monogram and never a broken-image icon.
 */
export default function CompanyLogo({ name, domain, size = 28, className }: CompanyLogoProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  useEffect(() => setStatus('loading'), [domain]);

  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const source = logoSource(domain);
  // A stored logo was checked when it was stored; the size test is for the
  // favicon service, which answers with a 16 px placeholder when it has nothing.
  const stored = source?.startsWith('/') ?? false;
  const showImage = source !== null && status !== 'failed';

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
      {showImage && (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => setStatus(stored || e.currentTarget.naturalWidth > PLACEHOLDER_ICON_PX ? 'loaded' : 'failed')}
          onError={() => setStatus('failed')}
          // Logos are drawn for light pages: give them a white tile. Invisible
          // until loaded, so the monogram shows through meanwhile.
          className={cn(
            'absolute inset-0 h-full w-full bg-white object-contain p-[12%]',
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}
