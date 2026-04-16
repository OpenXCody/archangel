import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Factory,
  Briefcase,
  Wrench,
  Clock,
  AlertCircle,
  Check,
  ChevronRight,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import FileDropZone from '../components/import/FileDropZone';
import ManualEntryForm from '../components/import/ManualEntryForm';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Importable entity types (core entities only, not refs/schools/programs/persons)
type ImportableEntityType = 'companies' | 'factories' | 'occupations' | 'skills';
type TabType = 'bulk' | ImportableEntityType;

const TABS: { type: TabType; icon: React.ElementType; label: string; color: string }[] = [
  { type: 'bulk', icon: Upload, label: 'Bulk Import', color: 'amber' },
  { type: 'companies', icon: Building2, label: 'Companies', color: 'amber' },
  { type: 'factories', icon: Factory, label: 'Factories', color: 'blue' },
  { type: 'occupations', icon: Briefcase, label: 'Occupations', color: 'blue' },
  { type: 'skills', icon: Wrench, label: 'Skills', color: 'emerald' },
];

interface ImportBatch {
  id: string;
  fileName: string;
  entityType: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
}

export default function Import() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('bulk');
  const [, setIsDragActive] = useState(false);

  // Fetch recent import activity
  const { data: recentImports } = useQuery<ImportBatch[]>({
    queryKey: ['importBatches', 'recent'],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/import/batches?limit=5`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  // Handle file drop anywhere on page
  const handleFileDrop = useCallback(
    (file: File) => {
      navigate('/import/bulk', { state: { file } });
    },
    [navigate]
  );

  // Global drag detection
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragActive(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragActive(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragActive(false);
      const file = e.dataTransfer?.files[0];
      if (file) {
        handleFileDrop(file);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleFileDrop]);

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Full-page drop overlay */}
      <FileDropZone onFileAccepted={handleFileDrop} isFullPage />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-default mb-2">Data Import</h1>
        <p className="text-fg-muted">
          Add companies, factories, occupations, and skills to the database.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-bg-surface rounded-xl mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => setActiveTab(tab.type)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                whitespace-nowrap transition-all duration-200
                ${isActive
                  ? 'bg-bg-elevated text-fg-default shadow-sm'
                  : 'text-fg-muted hover:text-fg-default hover:bg-bg-elevated/50'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? getTabIconColor(tab.color) : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Bulk Import tab */}
      {activeTab === 'bulk' && (
        <div className="bg-bg-surface border border-border-subtle rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-bg-elevated text-amber-500">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg-default">Bulk Import</h2>
              <p className="text-sm text-fg-muted">Import data from CSV or Excel files</p>
            </div>
          </div>
          <FileDropZone onFileAccepted={handleFileDrop} />
        </div>
      )}

      {/* Manual entry form for entity types */}
      {activeTab !== 'bulk' && (
        <ManualEntryForm
          entityType={activeTab as ImportableEntityType}
          onSuccess={() => {
            // Could show a toast or refetch counts
          }}
        />
      )}

      {/* Recent activity */}
      {recentImports && recentImports.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium text-fg-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Activity
          </h2>
          <div className="space-y-2">
            {recentImports.map((batch) => (
              <ActivityItem key={batch.id} batch={batch} formatRelativeTime={formatRelativeTime} />
            ))}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mt-8 text-center text-xs text-fg-soft">
        <span className="inline-flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 rounded bg-bg-surface border border-border-subtle text-fg-muted">
            Tab
          </kbd>
          to navigate fields
          <span className="mx-2">•</span>
          <kbd className="px-1.5 py-0.5 rounded bg-bg-surface border border-border-subtle text-fg-muted">
            ⌘
          </kbd>
          +
          <kbd className="px-1.5 py-0.5 rounded bg-bg-surface border border-border-subtle text-fg-muted">
            Enter
          </kbd>
          to save
        </span>
      </div>
    </div>
  );
}

// Get icon color class based on entity color
function getTabIconColor(color: string): string {
  switch (color) {
    case 'amber':
      return 'text-amber-500';
    case 'blue':
      return 'text-blue-400';
    case 'emerald':
      return 'text-emerald-500';
    default:
      return '';
  }
}

// Activity item component
function ActivityItem({
  batch,
  formatRelativeTime,
}: {
  batch: ImportBatch;
  formatRelativeTime: (date: string) => string;
}) {
  const navigate = useNavigate();
  const isSuccess = batch.status === 'completed';
  const isFailed = batch.status === 'failed';
  const isPending = batch.status === 'pending' || batch.status === 'processing';

  const getEntityIcon = () => {
    switch (batch.entityType) {
      case 'companies':
        return <Building2 className="w-4 h-4 text-amber-500" />;
      case 'factories':
        return <Factory className="w-4 h-4 text-blue-400" />;
      case 'occupations':
        return <Briefcase className="w-4 h-4 text-blue-600" />;
      case 'skills':
        return <Wrench className="w-4 h-4 text-emerald-500" />;
      default:
        return <FileSpreadsheet className="w-4 h-4 text-fg-muted" />;
    }
  };

  return (
    <button
      onClick={() => navigate(`/explore?tab=${batch.entityType}`)}
      className="
        w-full flex items-center gap-3 p-3 rounded-lg
        bg-bg-surface border border-border-subtle
        hover:bg-bg-elevated hover:border-border-strong
        transition-colors text-left group
      "
    >
      {/* Status icon */}
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
          ${isSuccess
            ? 'bg-emerald-500/10'
            : isFailed
              ? 'bg-red-500/10'
              : 'bg-blue-500/10'
          }
        `}
      >
        {isSuccess && <Check className="w-4 h-4 text-emerald-500" />}
        {isFailed && <AlertCircle className="w-4 h-4 text-red-500" />}
        {isPending && <Clock className="w-4 h-4 text-blue-400 animate-pulse" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getEntityIcon()}
          <span className="text-sm text-fg-default">
            {isSuccess && (
              <>
                Imported <span className="font-medium">{batch.createdCount}</span> {batch.entityType}
              </>
            )}
            {isFailed && (
              <>
                Import failed: <span className="font-medium">{batch.fileName}</span>
              </>
            )}
            {isPending && (
              <>
                Importing <span className="font-medium">{batch.fileName}</span>...
              </>
            )}
          </span>
        </div>
        <p className="text-xs text-fg-soft mt-0.5">
          {formatRelativeTime(batch.createdAt)}
          {batch.skippedCount > 0 && (
            <span className="text-amber-400 ml-2">
              {batch.skippedCount} skipped
            </span>
          )}
        </p>
      </div>

      {/* Action */}
      <div className="flex items-center gap-2 text-fg-soft group-hover:text-fg-muted">
        <span className="text-xs">
          {isSuccess && 'View'}
          {isFailed && 'Fix'}
        </span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}
