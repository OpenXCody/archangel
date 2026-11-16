import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

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
 * A company's logo, looked up from its website domain, on a monogram tile.
 *
 * The monogram (first letter of the name) is always there underneath. The
 * image is laid over it only once it has loaded, so a slow, blocked or
 * missing logo shows the monogram and never a broken-image icon.
 */
export default function CompanyLogo({ name, domain, size = 28, className }: CompanyLogoProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  useEffect(() => setStatus('loading'), [domain]);

  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(domain) && status !== 'failed';

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
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain as string)}&sz=128`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => setStatus(e.currentTarget.naturalWidth > PLACEHOLDER_ICON_PX ? 'loaded' : 'failed')}
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
