import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  FileCheck2,
  FileText,
  HardDrive,
  Info,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { Button, ErrorBox, LoadingBlock, PageTitle, Status } from '../../components/shell';
import { autosaveApi, DEFAULT_AUTOSAVE_SETTINGS } from '../../lib/endpoints';
import type { AutosaveSettings } from '../../lib/types';

export function AdminSettings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'autosave' | 'security'>('autosave');

  // Exam ID state for the legacy per-exam security settings lookup
  const [examIdInput, setExamIdInput] = useState('11048');
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  // Form State for Autosave & Recovery Settings
  const [formSettings, setFormSettings] = useState<AutosaveSettings>({
    ...DEFAULT_AUTOSAVE_SETTINGS,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch persisted settings from backend (with automatic fallback to local storage)
  const settingsQuery = useQuery({
    queryKey: ['admin-autosave-settings'],
    queryFn: ({ signal }) => autosaveApi.getActive(undefined, signal),
    staleTime: 30_000,
  });

  // Sync form state when remote/cached data loads
  useEffect(() => {
    if (settingsQuery.data) {
      setFormSettings({
        ...DEFAULT_AUTOSAVE_SETTINGS,
        ...settingsQuery.data,
      });
      setIsDirty(false);
    }
  }, [settingsQuery.data]);

  // Mutation to save settings
  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<AutosaveSettings>) => {
      return autosaveApi.save(updated);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['admin-autosave-settings'], saved);
      setFormSettings(saved);
      setIsDirty(false);
      setSaveSuccess(true);
      const timer = setTimeout(() => setSaveSuccess(false), 4000);
      return () => clearTimeout(timer);
    },
  });

  // Update a setting field with validation
  const updateField = <K extends keyof AutosaveSettings>(key: K, value: AutosaveSettings[K]) => {
    setFormSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaveSuccess(false);
    setValidationError(null);
  };

  // Preset profiles
  const applyPreset = (presetName: 'default' | 'lab' | 'fast') => {
    if (presetName === 'default') {
      setFormSettings({
        ...DEFAULT_AUTOSAVE_SETTINGS,
      });
    } else if (presetName === 'lab') {
      setFormSettings((prev) => ({
        ...prev,
        active: true,
        time_based_enabled: true,
        time_interval_seconds: 60,
        answer_count_enabled: true,
        answer_count_threshold: 8,
        max_batch_size: 50,
        retry_initial_delay_ms: 8000,
        local_essay_debounce_seconds: 4,
        offline_recovery_enabled: true,
      }));
    } else if (presetName === 'fast') {
      setFormSettings((prev) => ({
        ...prev,
        active: true,
        time_based_enabled: true,
        time_interval_seconds: 15,
        answer_count_enabled: true,
        answer_count_threshold: 2,
        max_batch_size: 15,
        retry_initial_delay_ms: 3000,
        local_essay_debounce_seconds: 2,
        offline_recovery_enabled: true,
      }));
    }
    setIsDirty(true);
    setSaveSuccess(false);
    setValidationError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveMutation.isPending) return;

    // Validation bounds check
    if (formSettings.time_interval_seconds < 5 || formSettings.time_interval_seconds > 3600) {
      setValidationError('Synchronization interval must be between 5 and 3600 seconds.');
      return;
    }
    if (formSettings.answer_count_threshold < 1 || formSettings.answer_count_threshold > 100) {
      setValidationError('Changed-answer trigger must be between 1 and 100 answers.');
      return;
    }
    if (formSettings.max_batch_size < 1 || formSettings.max_batch_size > 200) {
      setValidationError('Maximum answers per batch must be between 1 and 200 answers.');
      return;
    }
    const retrySec = Math.round(formSettings.retry_initial_delay_ms / 1000);
    if (retrySec < 1 || retrySec > 60) {
      setValidationError('Initial retry delay must be between 1 and 60 seconds.');
      return;
    }
    const debounceSec = formSettings.local_essay_debounce_seconds ?? 3;
    if (debounceSec < 1 || debounceSec > 30) {
      setValidationError('Local essay debounce must be between 1 and 30 seconds.');
      return;
    }

    setValidationError(null);
    saveMutation.mutate(formSettings);
  };

  const handleResetToDefaults = () => {
    setFormSettings({ ...DEFAULT_AUTOSAVE_SETTINGS });
    setIsDirty(true);
    setValidationError(null);
  };

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM CONFIGURATION"
        title="Settings & Governance"
        detail="Manage student answer autosave, IndexedDB recovery, synchronization policies, and examination security."
      />

      {/* Navigation Tabs */}
      <div className="dept-pills-nav" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={`dept-pill-btn ${activeTab === 'autosave' ? 'active' : ''}`}
          onClick={() => setActiveTab('autosave')}
          data-testid="tab-settings-autosave"
        >
          <Database size={15} />
          <span>Exam Autosave &amp; Recovery</span>
          <span className="dept-pill-badge">Primary</span>
        </button>

        <button
          type="button"
          className={`dept-pill-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
          data-testid="tab-settings-security"
        >
          <Shield size={15} />
          <span>Security &amp; Per-Exam Settings</span>
        </button>
      </div>

      {/* =========================================================================
          SECTION 1: EXAM AUTOSAVE & RECOVERY SETTINGS
          ========================================================================= */}
      {activeTab === 'autosave' && (
        <>
          {/* Quick Metrics Bar */}
          <div className="dashboard-stats" style={{ marginBottom: 24 }}>
            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <Zap size={18} />
                </div>
                <span
                  className={`admin-stat-trend ${
                    formSettings.active ? 'positive' : 'neutral'
                  }`}
                >
                  {formSettings.active ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div className="admin-stat-value">
                {formSettings.active ? 'Enabled' : 'Paused'}
              </div>
              <div className="admin-stat-label">Auto-Synchronization</div>
              <div className="admin-stat-meta">
                {formSettings.time_based_enabled ? 'Timer & count active' : 'Count-only mode'}
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <Clock size={18} />
                </div>
                <span className="admin-stat-trend positive">Cadence</span>
              </div>
              <div className="admin-stat-value">
                {formSettings.time_interval_seconds}s
              </div>
              <div className="admin-stat-label">Sync Interval</div>
              <div className="admin-stat-meta">Regular periodic batch writes</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <FileCheck2 size={18} />
                </div>
                <span className="admin-stat-trend neutral">Trigger</span>
              </div>
              <div className="admin-stat-value">
                {formSettings.answer_count_threshold}
              </div>
              <div className="admin-stat-label">Changed Answers Trigger</div>
              <div className="admin-stat-meta">Dispatches batch early if reached</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <HardDrive size={18} />
                </div>
                <span className="admin-stat-trend positive">Resilience</span>
              </div>
              <div className="admin-stat-value">
                {formSettings.offline_recovery_enabled ? 'IndexedDB' : 'Off'}
              </div>
              <div className="admin-stat-label">Local Offline Recovery</div>
              <div className="admin-stat-meta">Guards against crashes &amp; refresh</div>
            </div>
          </div>

          {/* Feedback Banners */}
          {saveSuccess && (
            <div
              className="alert-banner"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                marginBottom: 20,
              }}
              data-testid="banner-save-success"
            >
              <CheckCircle2 size={18} />
              <span>
                <strong>Settings saved successfully!</strong> Autosave and recovery policies have
                been persisted and distributed to examination clients.
              </span>
            </div>
          )}

          {validationError && (
            <div
              className="alert-banner"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                marginBottom: 20,
              }}
              data-testid="banner-validation-error"
            >
              <AlertCircle size={18} />
              <span>{validationError}</span>
            </div>
          )}

          {settingsQuery.isError && (
            <ErrorBox
              error={settingsQuery.error}
              retryLabel="Reload from server"
              onRetry={() => void settingsQuery.refetch()}
            />
          )}

          {/* Main Settings Form */}
          <form onSubmit={handleSave}>
            <section className="admin-panel" style={{ marginBottom: 24 }}>
              <div className="admin-panel-header">
                <div>
                  <h2>Exam Autosave &amp; Recovery Settings</h2>
                  <small className="text-muted">
                    Configure how student responses are cached locally and synchronized with the examination server.
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={handleResetToDefaults}
                    title="Reset fields to recommended baseline"
                  >
                    <RotateCcw size={14} /> Recommended Defaults
                  </button>
                </div>
              </div>

              <div className="admin-panel-body">
                {/* Preset Profiles Bar */}
                <div
                  style={{
                    background: 'var(--badge-bg, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} style={{ color: 'var(--brand-primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Configuration Presets:</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => applyPreset('default')}
                    >
                      Standard (30s / 5 answers / 25 batch)
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => applyPreset('lab')}
                    >
                      Large Computer Lab (60s / 8 answers / 50 batch)
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => applyPreset('fast')}
                    >
                      Low-Latency (15s / 2 answers / 15 batch)
                    </button>
                  </div>
                </div>

                {settingsQuery.isPending ? (
                  <LoadingBlock label="Loading active autosave configuration…" />
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                      gap: 24,
                    }}
                  >
                    {/* Setting 1: Automatic answer synchronization */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-auto-sync"
                          style={{ fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                        >
                          Automatic answer synchronization
                        </label>
                        <input
                          id="setting-auto-sync"
                          type="checkbox"
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                          checked={formSettings.active && formSettings.time_based_enabled}
                          onChange={(e) => {
                            updateField('active', e.target.checked);
                            updateField('time_based_enabled', e.target.checked);
                          }}
                          data-testid="input-auto-sync"
                        />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                        When enabled, student answers are periodically synchronized to the server in
                        batches. If disabled, answers are stored safely in browser IndexedDB and
                        only synchronized upon explicit submission.
                      </p>
                      <div style={{ marginTop: 10 }}>
                        <Status tone={formSettings.active ? 'green' : 'neutral'}>
                          {formSettings.active ? 'ENABLED' : 'PAUSED'}
                        </Status>
                      </div>
                    </div>

                    {/* Setting 7: Offline answer recovery */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-offline-recovery"
                          style={{ fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                        >
                          Offline answer recovery (IndexedDB)
                        </label>
                        <input
                          id="setting-offline-recovery"
                          type="checkbox"
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                          checked={formSettings.offline_recovery_enabled ?? true}
                          onChange={(e) =>
                            updateField('offline_recovery_enabled', e.target.checked)
                          }
                          data-testid="input-offline-recovery"
                        />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                        Preserves responses in local client IndexedDB immediately upon typing or selection.
                        If browser crashes, reloads, or loses power, answers are seamlessly restored.
                      </p>
                      <div style={{ marginTop: 10 }}>
                        <Status
                          tone={
                            formSettings.offline_recovery_enabled !== false ? 'green' : 'amber'
                          }
                        >
                          {formSettings.offline_recovery_enabled !== false
                            ? 'PROTECTION ACTIVE'
                            : 'RECOVERY DISABLED'}
                        </Status>
                      </div>
                    </div>

                    {/* Setting 2: Synchronization interval */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-sync-interval"
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          Synchronization interval
                        </label>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand-primary)',
                            fontSize: 14,
                          }}
                        >
                          {formSettings.time_interval_seconds} seconds
                        </span>
                      </div>
                      <input
                        id="setting-sync-interval"
                        type="range"
                        min={10}
                        max={300}
                        step={5}
                        style={{ width: '100%', marginBottom: 8 }}
                        value={formSettings.time_interval_seconds}
                        onChange={(e) =>
                          updateField('time_interval_seconds', Number(e.target.value))
                        }
                        data-testid="slider-sync-interval"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={10}
                          max={3600}
                          style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                          value={formSettings.time_interval_seconds}
                          onChange={(e) =>
                            updateField('time_interval_seconds', Number(e.target.value) || 30)
                          }
                          data-testid="input-sync-interval"
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          seconds between periodic sync batches (Default: 30s)
                        </span>
                      </div>
                      <small
                        style={{
                          display: 'block',
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Recommended: 30s. Higher values reduce server load in computer labs with hundreds of students.
                      </small>
                    </div>

                    {/* Setting 3: Changed-answer trigger */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-answer-trigger"
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          Changed-answer trigger
                        </label>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand-primary)',
                            fontSize: 14,
                          }}
                        >
                          {formSettings.answer_count_threshold} answers
                        </span>
                      </div>
                      <input
                        id="setting-answer-trigger"
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        style={{ width: '100%', marginBottom: 8 }}
                        value={formSettings.answer_count_threshold}
                        onChange={(e) =>
                          updateField('answer_count_threshold', Number(e.target.value))
                        }
                        data-testid="slider-answer-trigger"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                          value={formSettings.answer_count_threshold}
                          onChange={(e) =>
                            updateField('answer_count_threshold', Number(e.target.value) || 5)
                          }
                          data-testid="input-answer-trigger"
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          accumulated answers trigger immediate batch sync (Default: 5)
                        </span>
                      </div>
                      <small
                        style={{
                          display: 'block',
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Once N answers change, a batch sync is triggered without waiting for the timer.
                      </small>
                    </div>

                    {/* Setting 4: Maximum answers per batch */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-max-batch"
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          Maximum answers per batch
                        </label>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand-primary)',
                            fontSize: 14,
                          }}
                        >
                          {formSettings.max_batch_size} answers
                        </span>
                      </div>
                      <input
                        id="setting-max-batch"
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        style={{ width: '100%', marginBottom: 8 }}
                        value={formSettings.max_batch_size}
                        onChange={(e) =>
                          updateField('max_batch_size', Number(e.target.value))
                        }
                        data-testid="slider-max-batch"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                          value={formSettings.max_batch_size}
                          onChange={(e) =>
                            updateField('max_batch_size', Number(e.target.value) || 25)
                          }
                          data-testid="input-max-batch"
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          max items per HTTP request (Default: 25)
                        </span>
                      </div>
                      <small
                        style={{
                          display: 'block',
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Larger queues are cleanly chunked into sequential requests to avoid request payload limits.
                      </small>
                    </div>

                    {/* Setting 5: Initial retry delay */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-retry-delay"
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          Initial retry delay
                        </label>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand-primary)',
                            fontSize: 14,
                          }}
                        >
                          {Math.round(formSettings.retry_initial_delay_ms / 1000)} seconds
                        </span>
                      </div>
                      <input
                        id="setting-retry-delay"
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        style={{ width: '100%', marginBottom: 8 }}
                        value={Math.round(formSettings.retry_initial_delay_ms / 1000)}
                        onChange={(e) =>
                          updateField(
                            'retry_initial_delay_ms',
                            Number(e.target.value) * 1000,
                          )
                        }
                        data-testid="slider-retry-delay"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                          value={Math.round(formSettings.retry_initial_delay_ms / 1000)}
                          onChange={(e) =>
                            updateField(
                              'retry_initial_delay_ms',
                              (Number(e.target.value) || 5) * 1000,
                            )
                          }
                          data-testid="input-retry-delay"
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          seconds before first retry attempt (Default: 5s)
                        </span>
                      </div>
                      <small
                        style={{
                          display: 'block',
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Employs exponential backoff with 25% randomized jitter to prevent server retry storms.
                      </small>
                    </div>

                    {/* Setting 6: Local essay-save debounce */}
                    <div
                      className="setting-control-card"
                      style={{
                        padding: 18,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg, #ffffff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <label
                          htmlFor="setting-essay-debounce"
                          style={{ fontWeight: 600, fontSize: 14 }}
                        >
                          Local essay-save debounce
                        </label>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand-primary)',
                            fontSize: 14,
                          }}
                        >
                          {formSettings.local_essay_debounce_seconds ?? 3} seconds
                        </span>
                      </div>
                      <input
                        id="setting-essay-debounce"
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        style={{ width: '100%', marginBottom: 8 }}
                        value={formSettings.local_essay_debounce_seconds ?? 3}
                        onChange={(e) =>
                          updateField(
                            'local_essay_debounce_seconds',
                            Number(e.target.value),
                          )
                        }
                        data-testid="slider-essay-debounce"
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          step={0.5}
                          style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                          value={formSettings.local_essay_debounce_seconds ?? 3}
                          onChange={(e) =>
                            updateField(
                              'local_essay_debounce_seconds',
                              Number(e.target.value) || 3,
                            )
                          }
                          data-testid="input-essay-debounce"
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          seconds after typing stops before disk commit (Default: 3s)
                        </span>
                      </div>
                      <small
                        style={{
                          display: 'block',
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Prevents thrashing local IndexedDB on every keystroke while ensuring essays are committed quickly.
                      </small>
                    </div>
                  </div>
                )}

                {/* Form Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 30,
                    paddingTop: 20,
                    borderTop: '1px solid var(--border)',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Info size={15} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {isDirty
                        ? 'Unsaved changes present. Click Save Changes to update examination servers.'
                        : 'Settings are in sync with the examination system.'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (settingsQuery.data) {
                          setFormSettings({
                            ...DEFAULT_AUTOSAVE_SETTINGS,
                            ...settingsQuery.data,
                          });
                          setIsDirty(false);
                          setValidationError(null);
                        }
                      }}
                      disabled={!isDirty || saveMutation.isPending}
                    >
                      Discard changes
                    </Button>

                    <Button
                      variant="primary"
                      type="submit"
                      disabled={saveMutation.isPending || (!isDirty && !saveSuccess)}
                      data-testid="button-save-autosave-settings"
                    >
                      <Save size={15} />
                      {saveMutation.isPending ? 'Saving configuration…' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </form>

          {/* Architecture / Integrity Guide */}
          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2>Synchronization Architecture &amp; Integrity Policy</h2>
            </div>
            <div className="admin-panel-body" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 18,
                }}
              >
                <div>
                  <strong style={{ display: 'block', marginBottom: 4, color: 'var(--text-primary)' }}>
                    <Server size={14} style={{ display: 'inline', marginRight: 6 }} />
                    Server-Authoritative Clock
                  </strong>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    The backend strictly enforces the exam attempt deadline. Disconnections or offline periods
                    never extend the official deadline without explicit authorized teacher intervention.
                  </p>
                </div>

                <div>
                  <strong style={{ display: 'block', marginBottom: 4, color: 'var(--text-primary)' }}>
                    <HardDrive size={14} style={{ display: 'inline', marginRight: 6 }} />
                    Idempotent Batch Upserts
                  </strong>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Batches contain question IDs and incremental version numbers. Repeated or replayed requests
                    cannot produce duplicate database records or overwrite newer student choices.
                  </p>
                </div>

                <div>
                  <strong style={{ display: 'block', marginBottom: 4, color: 'var(--text-primary)' }}>
                    <Shield size={14} style={{ display: 'inline', marginRight: 6 }} />
                    Student Data Isolation
                  </strong>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Cached responses in computer lab browsers are indexed by student and attempt ID. Answers are
                    never revealed across student sessions on shared terminal computers.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* =========================================================================
          SECTION 2: SECURITY & PER-EXAM SETTINGS (PRESERVED)
          ========================================================================= */}
      {activeTab === 'security' && (
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Per-Exam Security Settings</h2>
            <Link href="/admin/exams" className="text-link">
              Browse all exams <ArrowRight size={14} />
            </Link>
          </div>
          <div className="admin-panel-body">
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              Real examination security policies (such as fullscreen lock, right-click disabling, and
              tab-switch detection) can be configured globally or overridden per-exam.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                maxWidth: 480,
                marginBottom: 20,
              }}
            >
              <input
                type="number"
                placeholder="Enter Exam ID (e.g. 11048)"
                value={examIdInput}
                onChange={(e) => setExamIdInput(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', fontSize: 14 }}
              />
              <Button
                variant="primary"
                onClick={() => setSelectedExamId(Number(examIdInput) || null)}
              >
                Inspect Exam Settings
              </Button>
            </div>

            {selectedExamId ? (
              <div
                style={{
                  background: 'var(--badge-bg, #f8fafc)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Lock size={16} style={{ color: 'var(--brand-primary)' }} />
                  <strong style={{ fontSize: 16 }}>
                    Examination #{selectedExamId} Configuration
                  </strong>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>
                  To modify questions, security policies, pass percentage, or student assignments for
                  this exam, visit its dedicated management page.
                </p>
                <Link
                  href={`/admin/exams/${selectedExamId}`}
                  className="button button-primary"
                >
                  Open Exam #{selectedExamId} in Editor <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--badge-bg, #f8fafc)',
                  borderRadius: 8,
                  padding: 16,
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                }}
              >
                Enter an examination ID above to inspect or navigate directly to its security settings.
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}