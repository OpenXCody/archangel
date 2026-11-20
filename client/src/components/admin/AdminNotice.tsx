import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { textButtonClass } from '../account/parts';

/**
 * One line under the Admin Tools tabs that says what the last action did:
 * "Approved Ana Ruiz for Tesla." Where the action can be taken back it
 * carries Undo. The line stays until the next action or a change of tab.
 *
 * It also catches keyboard focus: when an action removes the row that held
 * focus, focus moves to the place the action names (the next row, say), or
 * else to this line, so the next key press is not lost on the page body.
 */

interface NoticeOptions {
  /** Takes the action back. The line then says so. */
  undo?: () => void;
  /** Where focus goes if the action left it nowhere: a CSS selector, tried before the line itself. */
  focus?: string;
}

interface Notice extends NoticeOptions {
  key: number;
  message: string;
}

interface NoticeApi {
  say: (message: string, options?: NoticeOptions) => void;
  clear: () => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);
const NoticeState = createContext<Notice | null>(null);

const NOTHING: NoticeApi = { say: () => undefined, clear: () => undefined };

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
    setNotice({ key: counter.current, message: message.replace(/\.{2,}$/, '.'), ...options });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  const api = useMemo(() => ({ say, clear }), [say, clear]);
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

/** The line itself. It keeps its height when empty, so nothing below it moves when it speaks. */
export function AdminNoticeLine({ className }: { className?: string }) {
  const notice = useContext(NoticeState);
  const lineRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!notice) return;
    // The row that held focus may leave a little after the action reports: look more than once.
    const rescue = () => {
      if (!focusIsLost()) return;
      const wanted = notice.focus ? document.querySelector<HTMLElement>(notice.focus) : null;
      (wanted ?? lineRef.current)?.focus({ preventScroll: wanted ? false : true });
    };
    const frame = window.requestAnimationFrame(rescue);
    const timers = [150, 500].map((ms) => window.setTimeout(rescue, ms));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [notice]);

  return (
    <div className={cn('flex min-h-[2.25rem] items-center', className)}>
      <p
        ref={lineRef}
        role="status"
        tabIndex={-1}
        data-admin-notice={notice ? '' : undefined}
        className="min-w-0 break-words text-sm text-text-2 focus:outline-none"
      >
        {notice && (
          <>
            <span className="text-text-1">{notice.message}</span>
            {notice.undo && (
              <button type="button" onClick={notice.undo} className={cn(textButtonClass, 'ml-3')}>
                Undo
              </button>
            )}
          </>
        )}
      </p>
    </div>
  );
}
