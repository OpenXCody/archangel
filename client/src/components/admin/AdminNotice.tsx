import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { textButtonClass } from '../account/parts';

/**
 * What the last action in Admin Tools did, said in one bar: "Approved Ana
 * Ruiz for Tesla." The bar is the raised surface with a hairline edge; it
 * holds the message, Undo where the action can be taken back, links to what
 * was made where there are any, and a control that closes it. It is pinned
 * where it is seen: under the header on a wide screen, above the bottom edge
 * on a phone, over the page, so nothing moves when it speaks. A plain message
 * goes by itself after a while; one that carries Undo or a link stays until
 * it is closed, the next action, or another page.
 *
 * It also catches keyboard focus: when an action removes the row that held
 * focus, focus moves to the place the action names (the next row, say), or
 * else to the bar, so the next key press is not lost on the page body.
 */

interface NoticeLink {
  label: string;
  to: string;
}

interface NoticeOptions {
  /** Takes the action back. */
  undo?: () => void;
  /** What the action made, to open: "Acme", "Acme Austin". */
  links?: NoticeLink[];
  /** Where focus goes if the action left it nowhere: a CSS selector, tried before the bar itself. */
  focus?: string;
}

interface Notice extends NoticeOptions {
  key: number;
  message: string;
  /** When it was said, to tell a message about arriving on a page from one left behind on the last. */
  at: number;
}

interface NoticeApi {
  say: (message: string, options?: NoticeOptions) => void;
  clear: () => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);
const NoticeState = createContext<Notice | null>(null);

const NOTHING: NoticeApi = { say: () => undefined, clear: () => undefined };

/** How long a plain message stays. */
const STAYS_MS = 7000;

/** Says what an action did. Outside Admin Tools it does nothing. */
export function useAdminNotice(): NoticeApi {
  return useContext(NoticeContext) ?? NOTHING;
}

export function AdminNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const counter = useRef(0);
  const say = useCallback((message: string, options: NoticeOptions = {}) => {
    counter.current += 1;
    // A name that ends in a full stop ("Tesla Inc.") does not get a second one.
    setNotice({ key: counter.current, message: message.replace(/\.{2,}$/, '.'), at: Date.now(), ...options });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  const api = useMemo(() => ({ say, clear }), [say, clear]);

  // Another page: what was said on the last one goes. (An action that moves
  // to a page and then speaks, as deleting a record does, has just spoken.)
  const { pathname, search } = useLocation();
  const place = `${pathname}?${new URLSearchParams(search).get('id') ?? ''}`;
  useEffect(() => {
    setNotice((current) => (current && Date.now() - current.at > 1000 ? null : current));
  }, [place]);

  return (
    <NoticeContext.Provider value={api}>
      <NoticeState.Provider value={notice}>{children}</NoticeState.Provider>
    </NoticeContext.Provider>
  );
}

/** True when focus is nowhere a key press would do anything. */
function focusIsLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/** The bar. It takes no room in the page: empty, it is not drawn. */
export function AdminNoticeBar() {
  const notice = useContext(NoticeState);
  const { clear } = useAdminNotice();
  const barRef = useRef<HTMLDivElement>(null);
  // Held under the pointer or the keyboard, a plain message waits.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!notice) return;
    // The row that held focus may leave a little after the action reports: look more than once.
    const rescue = () => {
      if (!focusIsLost()) return;
      const wanted = notice.focus ? document.querySelector<HTMLElement>(notice.focus) : null;
      (wanted ?? barRef.current)?.focus({ preventScroll: wanted ? false : true });
    };
    const frame = window.requestAnimationFrame(rescue);
    const timers = [150, 500].map((ms) => window.setTimeout(rescue, ms));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [notice]);

  const stays = Boolean(notice?.undo || notice?.links?.length);
  useEffect(() => {
    if (!notice || stays || held) return;
    const timer = window.setTimeout(clear, STAYS_MS);
    return () => window.clearTimeout(timer);
  }, [notice, stays, held, clear]);

  return (
    <div
      // Over the page, under the header on a wide screen and above the bottom edge on a phone.
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,var(--safe-area-bottom,0px))] z-30 px-4 sm:bottom-auto sm:top-[4.75rem] sm:px-6"
      aria-live="polite"
    >
      {notice && (
        <div
          key={notice.key}
          ref={barRef}
          role="status"
          tabIndex={-1}
          data-admin-notice=""
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className="pointer-events-auto mx-auto flex w-full max-w-2xl items-start gap-3 rounded-lg border border-line-strong bg-surface py-2 pl-4 pr-2 focus:outline-none"
        >
          <p className="min-w-0 flex-1 break-words py-1.5 text-sm text-text-1">
            <span data-admin-notice-message>{notice.message}</span>
            {notice.links?.map((link) => (
              <Link key={link.to} to={link.to} className={cn(textButtonClass, 'ml-3 inline-block')} data-admin-notice-link>
                {link.label}
              </Link>
            ))}
          </p>
          {notice.undo && (
            <button type="button" onClick={notice.undo} className={cn(textButtonClass, 'min-h-9 shrink-0 px-1')} data-admin-notice-undo>
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={clear}
            aria-label="Close this message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-hover hover:text-text-1"
            data-admin-notice-close
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
