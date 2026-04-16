import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import {
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Upload,
  Check,
  AlertCircle,
  ChevronDown,
  Building2,
  Factory,
  Briefcase,
  Wrench,
  Loader2,
  Wand2,
} from 'lucide-react';
import ColumnMapper, {
  type ColumnMapping,
  areRequiredFieldsMapped,
  mappingsToApiFormat,
} from '../components/import/ColumnMapper';
import ValidationResults, {
  type ValidationResult,
  type ErrorResolution,
} from '../components/import/ValidationResults';
import ImportProgress, { type ImportResult } from '../components/import/ImportProgress';
import DataTransformer, {
  type TransformConfig,
  type TransformResult,
} from '../components/import/DataTransformer';
// Importable entity types (core entities only, not refs/schools/programs/persons)
type ImportableEntityType = 'companies' | 'factories' | 'occupations' | 'skills';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const ENTITY_CONFIG: Record<
  ImportableEntityType,
  { icon: React.ElementType; label: string; color: string }
> = {
  companies: { icon: Building2, label: 'Companies', color: 'text-amber-500' },
  factories: { icon: Factory, label: 'Factories', color: 'text-sky-400' },
  occupations: { icon: Briefcase, label: 'Occupations', color: 'text-blue-800' },
  skills: { icon: Wrench, label: 'Skills', color: 'text-emerald-500' },
};

type Step = 'preview' | 'map' | 'transform' | 'validate' | 'import';

interface ParsedData {
  columns: string[];
  rows: Record<string, unknown>[];
  sampleRows: Record<string, unknown>[];
}

// Utility to parse file client-side
function parseFileClientSide(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const columns = results.meta.fields || [];
          const rows = results.data as Record<string, unknown>[];
          resolve({
            columns,
            rows,
            sampleRows: rows.slice(0, 5),
          });
        },
        error: (error) => reject(new Error(error.message)),
      });
    } else if (
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      // For Excel files, we'll upload and parse server-side
      reject(new Error('Please upload the file to parse Excel files'));
    } else {
      reject(new Error('Unsupported file type'));
    }
  });
}

export default function BulkImport() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get file from navigation state
  const initialFile = location.state?.file as File | undefined;

  const [step, setStep] = useState<Step>('preview');
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<ImportableEntityType>('factories');
  const [fileId, setFileId] = useState<string | null>(null);

  // Column mapping state
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Reset mappings when entity type changes (so ColumnMapper re-auto-maps for new entity type)
  const handleEntityTypeChange = (newType: ImportableEntityType) => {
    if (newType !== entityType) {
      setMappings([]); // Clear mappings so they get re-auto-suggested
    }
    setEntityType(newType);
  };

  // Transform state
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null);
  const [transformConfig, setTransformConfig] = useState<TransformConfig | null>(null);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [resolutions, setResolutions] = useState<ErrorResolution[]>([]);

  // Import state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Parse file when selected
  useEffect(() => {
    if (file) {
      parseFileClientSide(file)
        .then((data) => {
          setParsedData(data);
          setParseError(null);
          // Auto-detect entity type from filename
          const filename = file.name.toLowerCase();
          if (filename.includes('compan')) setEntityType('companies');
          else if (filename.includes('factor') || filename.includes('plant') || filename.includes('facilit'))
            setEntityType('factories');
          else if (filename.includes('occup') || filename.includes('job') || filename.includes('role'))
            setEntityType('occupations');
          else if (filename.includes('skill')) setEntityType('skills');
        })
        .catch((err) => {
          setParseError(err.message);
          setParsedData(null);
        });
    }
  }, [file]);

  // Upload file to server for processing
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/import/parse`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload file');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setFileId(data.fileId);
    },
  });

  // Validate data mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!fileId) throw new Error('No file uploaded');

      // Build request with transformation data if available
      const requestBody: Record<string, unknown> = {
        fileId,
        entityType,
        mappings: mappingsToApiFormat(mappings),
      };

      // Include transformation config and skip rows
      if (transformResult && transformConfig) {
        requestBody.transformConfig = transformConfig;
        requestBody.skipRows = transformResult.rows
          .filter((r) => r.willSkip)
          .map((r) => r.originalIndex);
        requestBody.transformedData = transformResult.rows
          .filter((r) => !r.willSkip)
          .map((r) => ({
            originalIndex: r.originalIndex,
            companyName: r.companyName,
            companyId: r.companyId, // Existing company ID if linked
            factoryName: r.factoryName,
          }));
      }

      const response = await fetch(`${API_BASE}/import/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Validation failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setValidationResult(data);
    },
  });

  // Execute import mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!fileId) throw new Error('No file uploaded');
      const skipRows = [
        // Rows skipped from transform
        ...(transformResult?.rows.filter((r) => r.willSkip).map((r) => r.originalIndex) || []),
        // Rows skipped from validation resolutions
        ...resolutions.filter((r) => r.action === 'skip').map((r) => r.row),
      ];

      const response = await fetch(`${API_BASE}/import/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          entityType,
          mappings: mappingsToApiFormat(mappings),
          skipRows: [...new Set(skipRows)], // Deduplicate
          duplicateResolutions: resolutions,
          transformConfig,
          transformedData: transformResult?.rows
            .filter((r) => !r.willSkip)
            .map((r) => ({
              originalIndex: r.originalIndex,
              companyName: r.companyName,
              companyId: r.companyId, // Existing company ID if linked
              factoryName: r.factoryName,
            })),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
    },
    onError: (error: Error) => {
      setImportError(error.message);
    },
  });

  // Handle continue from preview
  const handleContinueFromPreview = useCallback(async () => {
    if (!file) return;
    // Upload file to server
    await uploadMutation.mutateAsync(file);
    setStep('map');
  }, [file]);

  // Handle continue from mapping
  const handleContinueFromMapping = useCallback(async () => {
    if (!areRequiredFieldsMapped(mappings, entityType)) {
      return;
    }
    // Go to transform step for factories (they benefit most from transformation)
    if (entityType === 'factories' && parsedData && parsedData.rows.length > 50) {
      setStep('transform');
    } else {
      // Skip transform for smaller datasets or other entity types
      await validateMutation.mutateAsync();
      setStep('validate');
    }
  }, [mappings, entityType, parsedData]);

  // Handle continue from transform
  const handleContinueFromTransform = useCallback(async () => {
    await validateMutation.mutateAsync();
    setStep('validate');
  }, [validateMutation]);

  // Handle transform complete
  const handleTransformComplete = useCallback((result: TransformResult, config: TransformConfig) => {
    setTransformResult(result);
    setTransformConfig(config);
  }, []);

  // Handle import
  const handleImport = useCallback(async (skipErrorRows: boolean) => {
    if (skipErrorRows && validationResult) {
      // Mark all error rows as skipped
      const errorSkips: ErrorResolution[] = validationResult.errors
        .map((e) => e.row)
        .filter((row, i, arr) => arr.indexOf(row) === i)
        .filter((row) => !resolutions.some((r) => r.row === row))
        .map((row) => ({ action: 'skip' as const, row }));
      setResolutions([...resolutions, ...errorSkips]);
    }
    setStep('import');
    await executeMutation.mutateAsync();
  }, [validationResult, resolutions]);

  // Handle file change
  const handleChangeFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = (e) => {
      const newFile = (e.target as HTMLInputElement).files?.[0];
      if (newFile) {
        setFile(newFile);
        setStep('preview');
        setMappings([]);
        setTransformResult(null);
        setTransformConfig(null);
        setValidationResult(null);
        setResolutions([]);
        setImportResult(null);
        setFileId(null);
      }
    };
    input.click();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (step === 'preview') {
          navigate('/import');
        } else {
          // Go back to previous step
          if (step === 'map') setStep('preview');
          else if (step === 'transform') setStep('map');
          else if (step === 'validate') setStep(transformResult ? 'transform' : 'map');
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (step === 'preview' && parsedData) handleContinueFromPreview();
        if (step === 'map') handleContinueFromMapping();
        if (step === 'transform' && transformResult) handleContinueFromTransform();
        if (step === 'validate') handleImport(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, parsedData, mappings, entityType, transformResult, handleContinueFromPreview, handleContinueFromMapping, handleContinueFromTransform]);

  // No file selected
  if (!file) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate('/import')}
          className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg-default mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Import
        </button>
        <div className="text-center py-20">
          <Upload className="w-12 h-12 text-fg-soft mx-auto mb-4" />
          <p className="text-fg-muted">No file selected</p>
          <button
            onClick={handleChangeFile}
            className="mt-4 px-4 py-2 rounded-lg bg-fg-default text-bg-base hover:bg-fg-muted"
          >
            Select file
          </button>
        </div>
      </div>
    );
  }

  // Get current step index for progress indicator
  const STEPS: Step[] = ['preview', 'map', 'transform', 'validate', 'import'];
  const currentStepIndex = STEPS.indexOf(step);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/import')}
        className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg-default mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Import
      </button>

      {/* Progress indicator */}
      {step !== 'import' && (
        <div className="flex items-center justify-center gap-2 mb-8">
          <StepIndicator
            label="Preview"
            isActive={step === 'preview'}
            isComplete={currentStepIndex > 0}
          />
          <div className="w-8 h-px bg-border-subtle" />
          <StepIndicator
            label="Map"
            isActive={step === 'map'}
            isComplete={currentStepIndex > 1}
          />
          <div className="w-8 h-px bg-border-subtle" />
          <StepIndicator
            label="Transform"
            isActive={step === 'transform'}
            isComplete={currentStepIndex > 2}
            icon={Wand2}
          />
          <div className="w-8 h-px bg-border-subtle" />
          <StepIndicator
            label="Validate"
            isActive={step === 'validate'}
            isComplete={currentStepIndex > 3}
          />
          <div className="w-8 h-px bg-border-subtle" />
          <StepIndicator label="Import" isActive={false} isComplete={false} />
        </div>
      )}

      {/* Step content */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl p-6">
        {/* Step 1: Preview */}
        {step === 'preview' && (
          <PreviewStep
            file={file}
            parsedData={parsedData}
            parseError={parseError}
            entityType={entityType}
            onEntityTypeChange={handleEntityTypeChange}
            onChangeFile={handleChangeFile}
            onContinue={handleContinueFromPreview}
            isLoading={uploadMutation.isPending}
          />
        )}

        {/* Step 2: Map columns */}
        {step === 'map' && parsedData && (
          <MapStep
            parsedData={parsedData}
            entityType={entityType}
            mappings={mappings}
            onMappingsChange={setMappings}
            onBack={() => setStep('preview')}
            onContinue={handleContinueFromMapping}
            isLoading={validateMutation.isPending}
            showTransformHint={entityType === 'factories' && parsedData.rows.length > 50}
          />
        )}

        {/* Step 3: Transform (for factories) */}
        {step === 'transform' && parsedData && (
          <TransformStep
            parsedData={parsedData}
            mappings={mappings}
            onTransformComplete={handleTransformComplete}
            onBack={() => setStep('map')}
            onContinue={handleContinueFromTransform}
            isLoading={validateMutation.isPending}
          />
        )}

        {/* Step 4: Validate */}
        {step === 'validate' && validationResult && (
          <ValidateStep
            validationResult={validationResult}
            resolutions={resolutions}
            onResolutionsChange={setResolutions}
            onBack={() => setStep(transformResult ? 'transform' : 'map')}
            onImport={handleImport}
            isLoading={executeMutation.isPending}
          />
        )}

        {/* Step 5: Import */}
        {step === 'import' && (
          <ImportProgress
            isImporting={executeMutation.isPending}
            progress={null}
            result={importResult}
            error={importError}
            entityType={entityType}
            onImportAnother={handleChangeFile}
            onDone={() => navigate('/import')}
          />
        )}
      </div>
    </div>
  );
}

// Step indicator component
function StepIndicator({
  label,
  isActive,
  isComplete,
  icon: Icon,
}: {
  label: string;
  isActive: boolean;
  isComplete: boolean;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
          ${isComplete
            ? 'bg-emerald-500 text-white'
            : isActive
              ? 'bg-amber-500 text-white'
              : 'bg-bg-elevated text-fg-soft border border-border-subtle'
          }
        `}
      >
        {isComplete ? <Check className="w-4 h-4" /> : Icon ? <Icon className="w-3 h-3" /> : null}
      </div>
      <span
        className={`text-sm ${isActive ? 'text-fg-default font-medium' : 'text-fg-muted'}`}
      >
        {label}
      </span>
    </div>
  );
}

// Step 1: Preview
function PreviewStep({
  file,
  parsedData,
  parseError,
  entityType,
  onEntityTypeChange,
  onChangeFile,
  onContinue,
  isLoading,
}: {
  file: File;
  parsedData: ParsedData | null;
  parseError: string | null;
  entityType: ImportableEntityType;
  onEntityTypeChange: (type: ImportableEntityType) => void;
  onChangeFile: () => void;
  onContinue: () => void;
  isLoading: boolean;
}) {
  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;

  return (
    <div>
      {/* File info */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-bg-elevated">
            <FileSpreadsheet className="w-6 h-6 text-fg-muted" />
          </div>
          <div>
            <h3 className="font-medium text-fg-default">{file.name}</h3>
            <p className="text-sm text-fg-muted">
              {parsedData
                ? `${parsedData.rows.length.toLocaleString()} rows • ${parsedData.columns.length} columns`
                : 'Parsing...'}
            </p>
          </div>
        </div>
        <button
          onClick={onChangeFile}
          className="text-sm text-fg-muted hover:text-fg-default"
        >
          Change file
        </button>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400">{parseError}</p>
          </div>
        </div>
      )}

      {/* Preview table */}
      {parsedData && (
        <div className="mb-6 overflow-hidden rounded-lg border border-border-subtle">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-fg-soft uppercase tracking-wider">
                    Row
                  </th>
                  {parsedData.columns.slice(0, 6).map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-xs font-medium text-fg-soft uppercase tracking-wider truncate max-w-[150px]"
                    >
                      {col}
                    </th>
                  ))}
                  {parsedData.columns.length > 6 && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-fg-soft">...</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {parsedData.sampleRows.map((row, i) => (
                  <tr key={i} className="bg-bg-surface">
                    <td className="px-3 py-2 text-fg-soft font-mono">{i + 1}</td>
                    {parsedData.columns.slice(0, 6).map((col) => (
                      <td
                        key={col}
                        className="px-3 py-2 text-fg-default truncate max-w-[150px]"
                      >
                        {row[col] != null ? String(row[col]) : ''}
                      </td>
                    ))}
                    {parsedData.columns.length > 6 && (
                      <td className="px-3 py-2 text-fg-soft">...</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entity type selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-fg-muted mb-2">
          Importing as
        </label>
        <div className="relative inline-block">
          <select
            value={entityType}
            onChange={(e) => onEntityTypeChange(e.target.value as ImportableEntityType)}
            className="
              appearance-none pl-10 pr-8 py-2 rounded-lg
              bg-bg-elevated border border-border-subtle
              text-fg-default font-medium
              focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500
              cursor-pointer
            "
          >
            <option value="companies">Companies</option>
            <option value="factories">Factories</option>
            <option value="occupations">Occupations</option>
            <option value="skills">Skills</option>
          </select>
          <Icon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${config.color}`} />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-soft pointer-events-none" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
        <div className="text-xs text-fg-soft mr-auto">
          <kbd className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-fg-muted">
            ⌘
          </kbd>
          <span className="mx-1">+</span>
          <kbd className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-fg-muted">
            Enter
          </kbd>
          <span className="ml-2">to continue</span>
        </div>
        <button
          onClick={onContinue}
          disabled={!parsedData || isLoading}
          className="
            flex items-center gap-2 px-4 py-2 rounded-lg
            bg-fg-default text-bg-base hover:bg-fg-muted
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors font-medium
          "
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Step 2: Map columns
function MapStep({
  parsedData,
  entityType,
  mappings,
  onMappingsChange,
  onBack,
  onContinue,
  isLoading,
  showTransformHint,
}: {
  parsedData: ParsedData;
  entityType: ImportableEntityType;
  mappings: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  onContinue: () => void;
  isLoading: boolean;
  showTransformHint?: boolean;
}) {
  const canContinue = areRequiredFieldsMapped(mappings, entityType);

  return (
    <div>
      <ColumnMapper
        sourceColumns={parsedData.columns}
        sampleData={parsedData.sampleRows}
        entityType={entityType}
        initialMappings={mappings.length > 0 ? mappings : undefined}
        onChange={onMappingsChange}
      />

      {/* Transform hint */}
      {showTransformHint && (
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <Wand2 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-300">
            <p className="font-medium">Large dataset detected</p>
            <p className="text-amber-400 mt-1">
              Next step will let you normalize company names and generate factory names automatically.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-fg-muted hover:text-fg-default"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={!canContinue || isLoading}
          className="
            flex items-center gap-2 px-4 py-2 rounded-lg
            bg-fg-default text-bg-base hover:bg-fg-muted
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors font-medium
          "
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {showTransformHint ? 'Configure Transform' : 'Validate'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Step 3: Transform
function TransformStep({
  parsedData,
  mappings,
  onTransformComplete,
  onBack,
  onContinue,
  isLoading,
}: {
  parsedData: ParsedData;
  mappings: ColumnMapping[];
  onTransformComplete: (result: TransformResult, config: TransformConfig) => void;
  onBack: () => void;
  onContinue: () => void;
  isLoading: boolean;
}) {
  // Convert mappings to simple format for DataTransformer (filter out unmapped)
  const simpleMappings = mappings
    .filter((m) => m.targetField !== null)
    .map((m) => ({
      source: m.sourceColumn || '',
      target: m.targetField as string,
    }));

  return (
    <div>
      <DataTransformer
        sourceColumns={parsedData.columns}
        rows={parsedData.rows}
        mappings={simpleMappings}
        onTransform={onTransformComplete}
      />

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-fg-muted hover:text-fg-default"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Mapping
        </button>
        <button
          onClick={onContinue}
          disabled={isLoading}
          className="
            flex items-center gap-2 px-4 py-2 rounded-lg
            bg-fg-default text-bg-base hover:bg-fg-muted
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors font-medium
          "
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue to Validation
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Step 4: Validate
function ValidateStep({
  validationResult,
  resolutions,
  onResolutionsChange,
  onBack,
  onImport,
  isLoading,
}: {
  validationResult: ValidationResult;
  resolutions: ErrorResolution[];
  onResolutionsChange: (resolutions: ErrorResolution[]) => void;
  onBack: () => void;
  onImport: (skipErrorRows: boolean) => void;
  isLoading: boolean;
}) {
  const hasUnresolvedErrors = validationResult.errors.length > resolutions.length;
  const canImportAll = !hasUnresolvedErrors || resolutions.length === validationResult.errors.length;

  return (
    <div>
      <ValidationResults
        result={validationResult}
        resolutions={resolutions}
        onResolve={onResolutionsChange}
      />

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-fg-muted hover:text-fg-default"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          {hasUnresolvedErrors && validationResult.validCount > 0 && (
            <button
              onClick={() => onImport(true)}
              disabled={isLoading}
              className="
                px-4 py-2 rounded-lg
                bg-bg-elevated border border-border-subtle
                text-fg-default hover:bg-bg-surface
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Skip errors & import {validationResult.validCount}
            </button>
          )}
          <button
            onClick={() => onImport(false)}
            disabled={(!canImportAll && validationResult.validCount === 0) || isLoading}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg
              bg-fg-default text-bg-base hover:bg-fg-muted
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors font-medium
            "
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Import all
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
