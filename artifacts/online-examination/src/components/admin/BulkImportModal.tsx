import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../lib/endpoints';
import { X, Upload, Download, FileSpreadsheet, FileJson, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImportPreview {
  valid_count: number;
  invalid_count: number;
  total_count: number;
  preview_data: Array<{
    name: string;
    email: string;
    department: string;
    status: string;
  }>;
  token: string;
}

export function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const downloadTemplateMutation = useMutation({
    mutationFn: adminApi.downloadImportTemplate,
  });

  const previewImportMutation = useMutation({
    mutationFn: adminApi.previewImport,
    onSuccess: (data) => {
      setPreview(data as unknown as ImportPreview);
      setStep('preview');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to preview file');
    },
  });

  const confirmImportMutation = useMutation({
    mutationFn: adminApi.confirmImport,
    onSuccess: () => {
      setStep('success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to import users');
    },
  });

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/json',
        'application/octet-stream',
      ];
      if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.json')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please upload an Excel (.xlsx), CSV, or JSON file');
      }
    }
  };

  const handlePreview = () => {
    if (file) {
      previewImportMutation.mutate(file);
    }
  };

  const handleConfirm = () => {
    if (preview?.token) {
      confirmImportMutation.mutate(preview.token);
    }
  };

  const handleDownloadTemplate = () => {
    downloadTemplateMutation.mutate(undefined, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'student_import_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    });
  };

  const getFileIcon = () => {
    if (!file) return <Upload size={24} />;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') return <FileJson size={24} />;
    return <FileSpreadsheet size={24} />;
  };

  const resetModal = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setError(null);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="bulk-import-modal">
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon">
              <Upload size={20} />
            </div>
            <h2>Bulk Import Students</h2>
          </div>
          <button className="modal-close" onClick={resetModal}>
            <X size={18} />
          </button>
        </div>

        {step === 'upload' && (
          <div className="modal-body">
            <div className="upload-area">
              <div className="upload-icon">
                {getFileIcon()}
              </div>
              <div className="upload-content">
                <p>Drag and drop your file here, or click to browse</p>
                <small>Supports Excel (.xlsx), CSV, and JSON files</small>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileSelect}
                className="file-input"
              />
            </div>

            {file && (
              <div className="selected-file">
                <FileSpreadsheet size={16} />
                <span>{file.name}</span>
                <small>{(file.size / 1024).toFixed(1)} KB</small>
              </div>
            )}

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="template-download">
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={handleDownloadTemplate}
                disabled={downloadTemplateMutation.isPending}
              >
                {downloadTemplateMutation.isPending ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Download size={14} />
                )}
                Download Template
              </button>
              <small>Use this template to ensure correct format</small>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="modal-body">
            <div className="import-summary">
              <div className="summary-item summary-success">
                <CheckCircle size={20} />
                <div>
                  <strong>{preview.valid_count}</strong>
                  <small>Valid records</small>
                </div>
              </div>
              {preview.invalid_count > 0 && (
                <div className="summary-item summary-warning">
                  <AlertCircle size={20} />
                  <div>
                    <strong>{preview.invalid_count}</strong>
                    <small>Invalid records</small>
                  </div>
                </div>
              )}
              <div className="summary-item summary-total">
                <strong>{preview.total_count}</strong>
                <small>Total records</small>
              </div>
            </div>

            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview_data?.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{row.department}</td>
                      <td>
                        <span className={`badge ${row.status === 'valid' ? 'badge-green' : 'badge-red'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.total_count > 5 && (
                <small className="preview-note">
                  Showing 5 of {preview.total_count} records
                </small>
              )}
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="modal-body">
            <div className="success-state">
              <div className="success-icon">
                <CheckCircle size={48} />
              </div>
              <h3>Import Completed Successfully</h3>
              <p>
                {preview?.valid_count ?? 0} student accounts have been created.
                {(preview?.invalid_count ?? 0) > 0 &&
                  ` ${preview?.invalid_count} records were skipped due to errors.`}
              </p>
            </div>
          </div>
        )}

        <div className="modal-footer">
          {step === 'upload' && (
            <>
              <button type="button" className="button button-secondary" onClick={resetModal}>
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handlePreview}
                disabled={!file || previewImportMutation.isPending}
              >
                {previewImportMutation.isPending ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Previewing...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Preview Import
                  </>
                )}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setStep('upload')}
              >
                Back
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleConfirm}
                disabled={confirmImportMutation.isPending || (preview?.valid_count || 0) === 0}
              >
                {confirmImportMutation.isPending ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    Confirm Import
                  </>
                )}
              </button>
            </>
          )}

          {step === 'success' && (
            <button type="button" className="button button-primary" onClick={resetModal}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
