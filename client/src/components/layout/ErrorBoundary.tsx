import { Component, ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { readStored, writeStored } from '../../lib/storage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** When this changes, a caught error is cleared (the person went somewhere else). */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** When this tab last reloaded itself after failing to fetch a page's code. */
const RELOADED_AT = 'archangel.reloadedAt';

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // A page's code could not be fetched: after a release the files this tab
    // knows by name are gone. Loading the app again gets the new ones. Once
    // only (per ten minutes), so a real outage does not reload for ever.
    if (/dynamically imported module|Importing a module script failed|Failed to load module script/i.test(error.message)) {
      const last = Number(readStored(RELOADED_AT, 'session') ?? 0);
      // Only when the reload can be remembered. With no session storage it
      // would repeat for ever: leave the choice to the person (Reload, below).
      if (Date.now() - last > 10 * 60 * 1000 && writeStored(RELOADED_AT, String(Date.now()), 'session')) {
        window.location.reload();
      }
    }
  }

  componentDidUpdate(previous: Props) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-lg font-semibold text-text-1">This page could not be shown</h2>
            <p className="mb-5 text-sm text-text-2">
              {import.meta.env.DEV && this.state.error?.message
                ? this.state.error.message
                : 'Something failed while drawing it. Trying again usually works.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleRetry}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-text-1 transition-colors hover:bg-surface-hover"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-2 transition-colors hover:text-text-1"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * The boundary around one page. Routes that render the same component share
 * one boundary instance, so without this an error on one page would still be
 * showing on the next; moving to another address clears it.
 */
export function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
