import { useState } from 'react';
import {
  Check,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Edit2,
  SkipForward,
  Plus,
  Link,
  X,
} from 'lucide-react';

export interface ValidationError {
  row: number;
  field: string;
  value: unknown;
  errorType: 'missing_required' | 'invalid_format' | 'duplicate_exact' | 'unlinked_relationship' | 'out_of_range';
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  errors: ValidationError[];
  potentialDuplicates?: { incomingRow: number; existingId: string; existingName: string }[];
}

export type ErrorResolution =
  | { action: 'skip'; row: number }
  | { action: 'edit'; row: number; field: string; newValue: string }
  | { action: 'map'; row: number; field: string; mappedValue: string }
  | { action: 'create'; row: number; field: string; newEntityName: string };

// Resolution types without row (for internal use)
type SkipResolution = { action: 'skip' };
type EditResolution = { action: 'edit'; field: string; newValue: string };
type MapResolution = { action: 'map'; field: string; mappedValue: string };
type CreateResolution = { action: 'create'; field: string; newEntityName: string };
type ResolutionWithoutRow = SkipResolution | EditResolution | MapResolution | CreateResolution;

interface ValidationResultsProps {
  result: ValidationResult;
  onResolve: (resolutions: ErrorResolution[]) => void;
  resolutions: ErrorResolution[];
}

export default function ValidationResults({
  result,
  onResolve,
  resolutions,
}: ValidationResultsProps) {
  const { totalRows, validCount, errors } = result;

  // Group errors by row
  const errorsByRow = errors.reduce((acc, error) => {
    if (!acc[error.row]) {
      acc[error.row] = [];
    }
    acc[error.row].push(error);
    return acc;
  }, {} as Record<number, ValidationError[]>);

  const errorRows = Object.keys(errorsByRow).map(Number).sort((a, b) => a - b);

  // Check if a row has been resolved
  const isRowResolved = (row: number): boolean => {
    return resolutions.some((r) => r.row === row);
  };

  // Get resolution for a row
  const getRowResolution = (row: number): ErrorResolution | undefined => {
    return resolutions.find((r) => r.row === row);
  };

  // Add resolution
  const addResolution = (resolution: ErrorResolution) => {
    // Remove any existing resolution for this row
    const filtered = resolutions.filter((r) => r.row !== resolution.row);
    onResolve([...filtered, resolution]);
  };

  // Remove resolution
  const removeResolution = (row: number) => {
    onResolve(resolutions.filter((r) => r.row !== row));
  };

  const resolvedCount = resolutions.length;
  const unresolvedCount = errorRows.length - resolvedCount;

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-5 h-5" />
            <span className="text-2xl font-semibold">{validCount}</span>
          </div>
          <p className="text-sm text-emerald-400/70 mt-1">Ready to import</p>
        </div>
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="text-2xl font-semibold">{unresolvedCount}</span>
          </div>
          <p className="text-sm text-red-400/70 mt-1">
            {unresolvedCount === 1 ? 'Error to fix' : 'Errors to fix'}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-gray-500/10 border border-gray-500/20">
          <div className="flex items-center gap-2 text-fg-muted">
            <span className="text-2xl font-semibold">{totalRows}</span>
          </div>
          <p className="text-sm text-fg-soft mt-1">Total rows</p>
        </div>
      </div>

      {/* Resolved indicator */}
      {resolvedCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2">
          <Check className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-blue-400">
            {resolvedCount} {resolvedCount === 1 ? 'issue' : 'issues'} resolved
          </span>
        </div>
      )}

      {/* Error list */}
      {errorRows.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-fg-muted uppercase tracking-wider mb-3">
            Issues to resolve
          </h4>
          {errorRows.map((row) => (
            <ErrorRow
              key={row}
              row={row}
              errors={errorsByRow[row]}
              resolution={getRowResolution(row)}
              isResolved={isRowResolved(row)}
              onResolve={(resolution: ResolutionWithoutRow) => addResolution({ ...resolution, row } as ErrorResolution)}
              onClearResolution={() => removeResolution(row)}
            />
          ))}
        </div>
      )}

      {/* No errors */}
      {errorRows.length === 0 && (
        <div className="text-center py-8">
          <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-fg-default">All rows valid!</h4>
          <p className="text-sm text-fg-muted mt-1">
            {validCount} rows are ready to import
          </p>
        </div>
      )}
    </div>
  );
}

// Individual error row
function ErrorRow({
  row,
  errors,
  resolution,
  isResolved,
  onResolve,
  onClearResolution,
}: {
  row: number;
  errors: ValidationError[];
  resolution?: ErrorResolution;
  isResolved: boolean;
  onResolve: (resolution: ResolutionWithoutRow) => void;
  onClearResolution: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(!isResolved);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const primaryError = errors[0];
  const errorIcon = getErrorIcon(primaryError.errorType);

  const handleSkip = () => {
    onResolve({ action: 'skip' });
    setIsExpanded(false);
  };

  const handleEdit = (field: string) => {
    const error = errors.find((e) => e.field === field);
    setEditingField(field);
    setEditValue(error?.suggestion || String(error?.value || ''));
  };

  const submitEdit = () => {
    if (editingField && editValue.trim()) {
      onResolve({ action: 'edit', field: editingField, newValue: editValue });
      setEditingField(null);
      setEditValue('');
      setIsExpanded(false);
    }
  };

  const handleMap = (field: string, mappedValue: string) => {
    onResolve({ action: 'map', field, mappedValue });
    setIsExpanded(false);
  };

  return (
    <div
      className={`
        rounded-lg border transition-colors
        ${isResolved
          ? 'bg-bg-surface/50 border-border-subtle opacity-60'
          : 'bg-bg-surface border-border-subtle'
        }
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className={`${isResolved ? 'text-emerald-400' : 'text-red-400'}`}>
          {isResolved ? <Check className="w-5 h-5" /> : errorIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-fg-muted">Row {row}</span>
            <span className="text-sm text-fg-default truncate">
              {primaryError.message}
            </span>
          </div>
          {isResolved && resolution && (
            <p className="text-xs text-emerald-400 mt-0.5">
              {resolution.action === 'skip' && 'Will be skipped'}
              {resolution.action === 'edit' && `Changed to: ${(resolution as { newValue: string }).newValue}`}
              {resolution.action === 'map' && `Mapped to: ${(resolution as { mappedValue: string }).mappedValue}`}
            </p>
          )}
        </div>
        {errors.length > 1 && (
          <span className="text-xs text-fg-soft">+{errors.length - 1} more</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-fg-soft transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border-subtle">
          {/* All errors for this row */}
          <div className="space-y-3 mb-4">
            {errors.map((error, i) => (
              <div key={i} className="pl-8">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-fg-muted font-medium">{error.field}:</span>
                  <span className="text-red-400">
                    {error.value != null ? `"${error.value}"` : '(empty)'}
                  </span>
                </div>
                <p className="text-xs text-fg-soft mt-0.5">{error.message}</p>
                {error.suggestion && (
                  <p className="text-xs text-blue-400 mt-0.5">
                    Suggestion: {error.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Editing inline */}
          {editingField && (
            <div className="mb-4 ml-8 p-3 rounded-lg bg-bg-elevated">
              <label className="block text-xs text-fg-muted mb-1.5">
                New value for {editingField}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  className="
                    flex-1 px-3 py-1.5 rounded-md text-sm
                    bg-bg-surface border border-border-subtle
                    text-fg-default placeholder:text-fg-soft
                    focus:outline-none focus:border-blue-500
                  "
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit();
                    if (e.key === 'Escape') setEditingField(null);
                  }}
                />
                <button
                  type="button"
                  onClick={submitEdit}
                  className="px-3 py-1.5 rounded-md text-sm bg-fg-default text-bg-base hover:bg-fg-muted"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setEditingField(null)}
                  className="p-1.5 text-fg-muted hover:text-fg-default"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 ml-8">
            {isResolved ? (
              <button
                type="button"
                onClick={onClearResolution}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                  bg-bg-elevated border border-border-subtle
                  text-fg-muted hover:text-fg-default hover:border-border-strong
                  transition-colors
                "
              >
                <X className="w-4 h-4" />
                Undo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleEdit(primaryError.field)}
                  className="
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                    bg-bg-elevated border border-border-subtle
                    text-fg-default hover:border-border-strong
                    transition-colors
                  "
                >
                  <Edit2 className="w-4 h-4" />
                  Edit value
                </button>

                {primaryError.errorType === 'unlinked_relationship' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleMap(primaryError.field, primaryError.suggestion || '')}
                      className="
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                        bg-bg-elevated border border-border-subtle
                        text-fg-default hover:border-border-strong
                        transition-colors
                      "
                    >
                      <Link className="w-4 h-4" />
                      Map to existing
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolve({ action: 'create', field: primaryError.field, newEntityName: String(primaryError.value) })}
                      className="
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                        bg-bg-elevated border border-border-subtle
                        text-fg-default hover:border-border-strong
                        transition-colors
                      "
                    >
                      <Plus className="w-4 h-4" />
                      Create new
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleSkip}
                  className="
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                    text-fg-muted hover:text-fg-default
                    transition-colors
                  "
                >
                  <SkipForward className="w-4 h-4" />
                  Skip row
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Get icon for error type
function getErrorIcon(errorType: ValidationError['errorType']) {
  switch (errorType) {
    case 'missing_required':
      return <AlertCircle className="w-5 h-5" />;
    case 'invalid_format':
    case 'out_of_range':
      return <AlertTriangle className="w-5 h-5" />;
    case 'duplicate_exact':
      return <AlertCircle className="w-5 h-5" />;
    case 'unlinked_relationship':
      return <Link className="w-5 h-5" />;
    default:
      return <AlertCircle className="w-5 h-5" />;
  }
}
