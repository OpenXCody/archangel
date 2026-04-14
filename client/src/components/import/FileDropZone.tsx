import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, FileSpreadsheet, AlertCircle, X } from 'lucide-react';

interface FileDropZoneProps {
  onFileAccepted: (file: File) => void;
  isFullPage?: boolean;
  className?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = {
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
};

export default function FileDropZone({
  onFileAccepted,
  isFullPage = false,
  className = '',
}: FileDropZoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const firstError = rejectedFiles[0].errors[0];
        if (firstError.message.includes('larger than')) {
          setError('File is too large. Maximum size is 10MB.');
        } else if (firstError.message.includes('type')) {
          setError('Invalid file type. Please upload a CSV or Excel file.');
        } else {
          setError(firstError.message);
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  // Full page overlay variant
  if (isFullPage) {
    return (
      <div
        {...getRootProps()}
        className={`
          fixed inset-0 z-50 flex items-center justify-center
          bg-bg-base/90 backdrop-blur-sm
          transition-opacity duration-200
          ${isDragActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <input {...getInputProps()} />
        <div
          className={`
            flex flex-col items-center justify-center
            w-[400px] h-[300px] rounded-2xl
            border-2 border-dashed transition-colors
            ${isDragReject
              ? 'border-red-500 bg-red-500/10'
              : 'border-blue-400 bg-blue-400/10'
            }
          `}
        >
          <Upload className={`w-16 h-16 mb-4 ${isDragReject ? 'text-red-500' : 'text-blue-400'}`} />
          <p className="text-lg font-medium text-fg-default">
            {isDragReject ? 'Invalid file type' : 'Drop file to import'}
          </p>
          <p className="text-sm text-fg-muted mt-2">CSV, XLSX, or XLS files up to 10MB</p>
        </div>
      </div>
    );
  }

  // Inline dropzone variant
  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`
          relative flex flex-col items-center justify-center
          py-10 px-6 rounded-xl cursor-pointer
          border-2 border-dashed transition-all duration-200
          ${isDragActive
            ? isDragReject
              ? 'border-red-500 bg-red-500/10'
              : 'border-blue-400 bg-blue-400/10 scale-[1.02]'
            : 'border-border-subtle bg-bg-surface hover:border-border-strong hover:bg-bg-elevated'
          }
        `}
      >
        <input {...getInputProps()} />

        {isDragActive ? (
          <>
            <Upload
              className={`w-12 h-12 mb-4 ${isDragReject ? 'text-red-500' : 'text-blue-400'}`}
            />
            <p className="text-fg-default font-medium">
              {isDragReject ? 'Invalid file type' : 'Drop to upload'}
            </p>
          </>
        ) : (
          <>
            <FileSpreadsheet className="w-12 h-12 text-fg-soft mb-4" />
            <p className="text-fg-default font-medium mb-1">
              Drag and drop a file, or click to browse
            </p>
            <p className="text-sm text-fg-muted">
              Supports CSV, XLSX, XLS files up to 10MB
            </p>
          </>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
