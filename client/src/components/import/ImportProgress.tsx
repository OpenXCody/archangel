import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  AlertTriangle,
  Loader2,
  Download,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Building2,
  Factory,
  Briefcase,
  Wrench,
} from 'lucide-react';
import type { EntityType } from '../../lib/api';

export interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  errorsQueued: number;
  durationMs: number;
}

interface ImportProgressProps {
  isImporting: boolean;
  progress: { current: number; total: number } | null;
  result: ImportResult | null;
  error: string | null;
  entityType: EntityType;
  onImportAnother: () => void;
  onDone: () => void;
}

const ENTITY_CONFIG: Record<EntityType, { icon: React.ElementType; label: string; path: string }> = {
  companies: { icon: Building2, label: 'companies', path: '/explore?tab=companies' },
  factories: { icon: Factory, label: 'factories', path: '/explore?tab=factories' },
  occupations: { icon: Briefcase, label: 'occupations', path: '/explore?tab=occupations' },
  skills: { icon: Wrench, label: 'skills', path: '/explore?tab=skills' },
};

export default function ImportProgress({
  isImporting,
  progress,
  result,
  error,
  entityType,
  onImportAnother,
  onDone,
}: ImportProgressProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;

  // Trigger confetti on successful completion
  useEffect(() => {
    if (result && result.created > 0) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  // Importing state
  if (isImporting) {
    const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
      <div className="text-center py-12">
        <div className="relative inline-block mb-6">
          <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
        </div>
        <h3 className="text-xl font-semibold text-fg-default mb-2">Importing...</h3>

        {progress && (
          <>
            <div className="max-w-md mx-auto mb-3">
              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-fg-muted">
              {progress.current.toLocaleString()} of {progress.total.toLocaleString()} rows
            </p>
          </>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-semibold text-fg-default mb-2">Import Failed</h3>
        <p className="text-fg-muted mb-6 max-w-md mx-auto">{error}</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onImportAnother}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg
              bg-bg-elevated border border-border-subtle
              text-fg-default hover:bg-bg-surface
              transition-colors
            "
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (result) {
    const hasErrors = result.errorsQueued > 0;
    const formatDuration = (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
      <div className="py-8">
        {/* Success animation */}
        <div className="text-center mb-8">
          <div
            className={`
              relative inline-block mb-6
              ${showConfetti ? 'animate-bounce' : ''}
            `}
          >
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-10 h-10 text-emerald-500" />
            </div>
            {showConfetti && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full animate-ping"
                    style={{
                      backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][i % 4],
                      transform: `rotate(${i * 45}deg) translateY(-30px)`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: '1s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <h3 className="text-2xl font-semibold text-fg-default mb-2">Import Complete!</h3>
          <p className="text-fg-muted">
            Finished in {formatDuration(result.durationMs)}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Created"
            value={result.created}
            icon={<Icon className="w-5 h-5" />}
            variant="success"
          />
          <StatCard
            label="Updated"
            value={result.updated}
            icon={<RefreshCw className="w-5 h-5" />}
            variant="info"
          />
          <StatCard
            label="Skipped"
            value={result.skipped}
            icon={<AlertTriangle className="w-5 h-5" />}
            variant={result.skipped > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Errors"
            value={result.errorsQueued}
            icon={<AlertTriangle className="w-5 h-5" />}
            variant={result.errorsQueued > 0 ? 'error' : 'default'}
          />
        </div>

        {/* Warning if there are errors */}
        {hasErrors && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">
                {result.errorsQueued} {result.errorsQueued === 1 ? 'row' : 'rows'} couldn't be imported
              </p>
              <p className="text-sm text-amber-400/70 mt-1">
                These have been queued for review. You can fix them later in the error queue.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={config.path}
            className="
              flex items-center gap-2 px-6 py-2.5 rounded-lg
              bg-fg-default text-bg-base hover:bg-fg-muted
              transition-colors font-medium
            "
          >
            View imported {config.label}
            <ExternalLink className="w-4 h-4" />
          </Link>

          {hasErrors && (
            <button
              className="
                flex items-center gap-2 px-4 py-2 rounded-lg
                bg-bg-elevated border border-border-subtle
                text-fg-default hover:bg-bg-surface
                transition-colors
              "
            >
              <Download className="w-4 h-4" />
              Download error report
            </button>
          )}

          <button
            onClick={onImportAnother}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg
              text-fg-muted hover:text-fg-default
              transition-colors
            "
          >
            Import another file
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Done button for simple close */}
        <div className="text-center mt-6">
          <button
            onClick={onDone}
            className="text-sm text-fg-soft hover:text-fg-muted transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Idle state (shouldn't normally show)
  return null;
}

// Stat card component
function StatCard({
  label,
  value,
  icon,
  variant = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'info' | 'warning' | 'error';
}) {
  const variantStyles = {
    default: 'bg-bg-surface border-border-subtle text-fg-muted',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
  };

  return (
    <div className={`p-4 rounded-lg border ${variantStyles[variant]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-semibold">{value.toLocaleString()}</span>
      </div>
      <p className="text-sm opacity-70">{label}</p>
    </div>
  );
}
