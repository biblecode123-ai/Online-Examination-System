import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  KeyRound,
  ListChecks,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Users,
  PlayCircle,
} from 'lucide-react';
import { adminExamApi, type AdminExamLifecycleAction } from '../../../lib/endpoints';
import { ApiError } from '../../../lib/api';
import {
  ConfirmDialog,
  ErrorBox,
  LoadingBlock,
  PageTitle,
  Status,
} from '../../../components/shell';
import {
  PHASE_LABEL,
  PHASE_TONE,
  attemptsExist,
  canComplete,
  canRevert,
  canStart,
  examPhase,
  fmtDate,
  fmtMinutes,
  readyBlockers,
  toDatetimeLocal,
} from './logic';
import { QuestionsTab } from './questions';
import { AssignTab } from './assign';
import { ResultsTab } from './results';
import { PreviewTab } from './preview';
import type { AdminRealExam, AdminRealExamSettings } from '../../../lib/types';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Settings2 size={15} /> },
  { id: 'questions', label: 'Questions', icon: <ListChecks size={15} /> },
  { id: 'students', label: 'Students', icon: <Users size={15} /> },
  { id: 'results', label: 'Results', icon: <CheckCircle2 size={15} /> },
  { id: 'preview', label: 'Preview', icon: <Eye size={15} /> },
] as const;

type TabId = (typeof TABS)[number]['id'];

const SETTINGS_BOOLS: { key: keyof AdminRealExamSettings; label: string }[] = [
  { key: 'fullscreen_required', label: 'Require fullscreen' },
  { key: 'tab_switch_detection', label: 'Detect tab switching' },
  { key: 'copy_paste_detection', label: 'Block copy & paste' },
  { key: 'right_click_detection', label: 'Block right click' },
  { key: 'multiple_tab_detection', label: 'Detect multiple tabs' },
  { key: 'watermark_enabled', label: 'Watermark with student identity' },
];

function fieldError(error: unknown, ...fields: string[]): string | undefined {
  if (!(error instanceof ApiError) || !error.errors) return undefined;
  for (const field of fields) {
    const bag = error.errors[field] ?? error.errors[field.replace('.', '_')];
    if (bag?.[0]) return bag[0];
  }
  return error.message;
}

// ---------------------------------------------------------------------------
// Overview tab — edit form, password, settings, instructions, lifecycle
// ---------------------------------------------------------------------------

function OverviewTab({ exam }: { exam: AdminRealExam }) {
  const queryClient = useQueryClient();
  const locked = Boolean(exam.started_at && exam.started_at !== 'null');
  const completed = examPhase(exam) === 'completed';

  const [title, setTitle] = useState(exam.exam_title);
  const [description, setDescription] = useState(exam.description ?? '');
  const [departmentId, setDepartmentId] = useState(String(exam.department_id ?? ''));
  const [totalTime, setTotalTime] = useState(exam.total_time ?? 60);
  const [passing, setPassing] = useState(exam.passing_percentage ?? 50);
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<AdminRealExamSettings>(exam.settings ?? {});
  const [instructions, setInstructions] = useState<string | null>(null);

  const deptQuery = useQuery({
    queryKey: ['admin-exams', 'departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });
  const structureQuery = useQuery({
    queryKey: ['admin-exam-structure', exam.id],
    queryFn: ({ signal }) => adminExamApi.getStructure(exam.id, signal),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (structureQuery.data && instructions === null) {
      setInstructions(structureQuery.data.instructions ?? '');
    }
  }, [structureQuery.data, instructions]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    queryClient.invalidateQueries({ queryKey: ['admin-exam-structure', exam.id] });
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      adminExamApi.updateExam(exam.id, {
        exam_title: title.trim(),
        description: description.trim() || null,
        department_id: Number(departmentId),
        total_time: Number(totalTime),
        passing_percentage: Number(passing),
      }),
    onSuccess: invalidate,
  });

  const passwordMutation = useMutation({
    mutationFn: (value: string) => adminExamApi.setExamPassword(exam.id, value),
    onSuccess: () => {
      setPassword('');
      invalidate();
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (value: AdminRealExamSettings) =>
      adminExamApi.updateExam(exam.id, { settings: value }),
    onSuccess: invalidate,
  });

  const instructionsMutation = useMutation({
    mutationFn: (value: string) =>
      adminExamApi.putStructure(exam.id, {
        instructions: value,
        sections: structureQuery.data?.sections ?? [],
      }),
    onSuccess: invalidate,
  });

  return (
    <>
      <div className="card exam-form-section">
        <div className="card-header">
          <h2>Exam details</h2>
          {locked && <small className="text-muted">Locked — the exam session has started.</small>}
        </div>
        <div className="card-body">
          <ErrorBox error={updateMutation.error} testId="update-exam-error" />
          <div className="exam-form-grid">
            <div className="form-group span-2">
              <label htmlFor="edit-title">Exam title</label>
              <input
                id="edit-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={locked}
                data-testid="input-edit-title"
              />
            </div>
            <div className="form-group span-2">
              <label htmlFor="edit-description">Description</label>
              <textarea
                id="edit-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-department">Target department</label>
              <select
                id="edit-department"
                className="select"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={locked}
                data-testid="select-edit-department"
              >
                <option value="">Select…</option>
                {(deptQuery.data ?? []).map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-duration">Allocated time (minutes)</label>
              <input
                id="edit-duration"
                type="number"
                min={1}
                value={totalTime}
                onChange={(e) => setTotalTime(Number(e.target.value))}
                disabled={locked}
                data-testid="input-edit-duration"
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-passing">Passing percentage (%)</label>
              <input
                id="edit-passing"
                type="number"
                min={0}
                max={100}
                value={passing}
                onChange={(e) => setPassing(Number(e.target.value))}
                disabled={locked}
              />
            </div>
          </div>
          {!locked && (
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
                data-testid="button-save-exam"
              >
                <Save size={15} /> {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
          {updateMutation.isSuccess && (
            <small className="field-hint success-hint">Exam details saved.</small>
          )}
        </div>
      </div>

      <div className="card exam-form-section">
        <div className="card-header">
          <h2>Exam password</h2>
          <small className="text-muted">
            {exam.has_password ? 'A PIN is set (plaintext is never shown).' : 'No PIN set yet.'}
          </small>
        </div>
        <div className="card-body">
          <ErrorBox error={passwordMutation.error} testId="password-error" />
          <div className="inline-form">
            <div className="form-group grow">
              <label htmlFor="edit-password">
                {exam.has_password ? 'Replace PIN' : 'Set PIN'}
              </label>
              <input
                id="edit-password"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPassword(value);
                }}
                placeholder="Enter 4-digit PIN"
                data-testid="input-set-password"
                style={{ letterSpacing: '0.5em', fontFamily: 'monospace', fontSize: '1.1rem' }}
              />
              {passwordMutation.error instanceof ApiError && passwordMutation.error.errors?.exam_password && (
                <small className="field-error">
                  {passwordMutation.error.errors.exam_password[0]}
                </small>
              )}
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={!/^\d{4}$/.test(password) || passwordMutation.isPending}
              onClick={() => passwordMutation.mutate(password)}
              data-testid="button-set-password"
            >
              <KeyRound size={15} /> {passwordMutation.isPending ? 'Saving…' : 'Set PIN'}
            </button>
          </div>
          {passwordMutation.isSuccess && (
            <small className="field-hint success-hint">PIN updated.</small>
          )}
        </div>
      </div>

      <div className="card exam-form-section">
        <div className="card-header">
          <h2>Security &amp; exam settings</h2>
          <small className="text-muted">Server-validated — applied to every attempt.</small>
        </div>
        <div className="card-body">
          <ErrorBox error={settingsMutation.error} testId="settings-error" />
          <div className="settings-grid">
            {SETTINGS_BOOLS.map(({ key, label }) => (
              <label key={key} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                  data-testid={`checkbox-setting-${key}`}
                />
                {label}
              </label>
            ))}
            <div className="form-group">
              <label htmlFor="setting-policy">On network disconnect</label>
              <select
                id="setting-policy"
                className="select"
                value={String(settings.network_disconnect_policy ?? 'resume')}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    network_disconnect_policy: e.target.value as 'resume' | 'submit',
                  })
                }
              >
                <option value="resume">Resume the attempt</option>
                <option value="submit">Submit the attempt</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="setting-visibility">Result visibility</label>
              <select
                id="setting-visibility"
                className="select"
                value={String(settings.result_visibility ?? 'score_only')}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    result_visibility: e.target.value as 'score_only' | 'full_review',
                  })
                }
              >
                <option value="score_only">Score only</option>
                <option value="full_review">Full review</option>
              </select>
            </div>
            {settings.watermark_enabled && (
              <div className="form-group span-2">
                <label htmlFor="setting-watermark">Watermark text</label>
                <input
                  id="setting-watermark"
                  type="text"
                  value={String(settings.watermark_text ?? '')}
                  onChange={(e) => setSettings({ ...settings, watermark_text: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={settingsMutation.isPending || completed}
              onClick={() => settingsMutation.mutate(settings)}
              data-testid="button-save-settings"
            >
              <Save size={15} /> {settingsMutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
          {settingsMutation.isSuccess && (
            <small className="field-hint success-hint">Settings saved.</small>
          )}
        </div>
      </div>

      <div className="card exam-form-section">
        <div className="card-header">
          <h2>Instructions for students</h2>
          <small className="text-muted">Shown before the student begins the examination.</small>
        </div>
        <div className="card-body">
          <ErrorBox error={instructionsMutation.error} testId="instructions-error" />
          {structureQuery.isLoading ? (
            <LoadingBlock label="Loading instructions…" />
          ) : structureQuery.isError ? (
            <ErrorBox error={structureQuery.error} onRetry={() => void structureQuery.refetch()} />
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="exam-instructions">Exam-level instructions</label>
                <textarea
                  id="exam-instructions"
                  rows={5}
                  value={instructions ?? ''}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="One clear paragraph: what to do, what is forbidden, how time is counted…"
                  data-testid="textarea-instructions"
                />
              </div>
              {structureQuery.data?.editable === false && (
                <small className="field-error">
                  {structureQuery.data.lock_reason ?? 'Structure is locked for this exam.'}
                </small>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={
                    instructionsMutation.isPending ||
                    instructions === null ||
                    structureQuery.data?.editable === false
                  }
                  onClick={() => instructionsMutation.mutate(instructions ?? '')}
                  data-testid="button-save-instructions"
                >
                  <Save size={15} /> {instructionsMutation.isPending ? 'Saving…' : 'Save instructions'}
                </button>
              </div>
              {instructionsMutation.isSuccess && (
                <small className="field-hint success-hint">Instructions saved.</small>
              )}
            </>
          )}
        </div>
      </div>

      {attemptsExist(exam) && (
        <div className="exam-alert" role="status">
          <ListChecks size={16} />
          <span>
            {exam.ongoing_attempts ?? 0} ongoing and {exam.completed_attempts ?? 0} completed
            attempt(s) — questions, assignments and exam settings are protected from destructive
            changes.
          </span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle action bar (confirmations on every transition)
// ---------------------------------------------------------------------------

function LifecycleBar({ exam }: { exam: AdminRealExam }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<AdminExamLifecycleAction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const blockers = readyBlockers(exam);
  const phase = examPhase(exam);

  const transitionMutation = useMutation({
    mutationFn: (action: AdminExamLifecycleAction) => adminExamApi.transition(exam.id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      setConfirm(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminExamApi.deleteExam(exam.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      window.location.assign('/admin/exams');
    },
  });

  const CONFIRMS: Record<
    AdminExamLifecycleAction,
    { title: string; message: string; label: string; tone: 'primary' | 'danger' }
  > = {
    ready: {
      title: 'Publish this examination?',
      label: 'Publish',
      tone: 'primary',
      message:
        'Students will see the exam as published. You can still revert it to draft until it is started.',
    },
    'revert-to-draft': {
      title: 'Revert to draft?',
      label: 'Revert to draft',
      tone: 'danger',
      message: 'The exam disappears from the published list until you publish it again.',
    },
    start: {
      title: 'Start the examination session?',
      label: 'Start exam',
      tone: 'danger',
      message:
        'Starting is irreversible: assigned students become able to open their timed attempts, and the exam can no longer be edited. Continue?',
    },
    complete: {
      title: 'Complete this examination?',
      label: 'Complete exam',
      tone: 'danger',
      message:
        'Completing closes the session for everyone. Ongoing attempts can no longer be resumed. This cannot be undone.',
    },
  };

  const error = transitionMutation.error;
  const serverBlockers =
    error instanceof ApiError && (error.body as { data?: { blockers?: string[] } })?.data?.blockers;

  return (
    <div className="card lifecycle-card">
      <div className="card-body lifecycle-row">
        <div className="lifecycle-status">
          <small>Current status</small>
          <Status tone={PHASE_TONE[phase]} testId="exam-status-chip">
            {PHASE_LABEL[phase]}
          </Status>
          {exam.started_at && exam.started_at !== 'null' && (
            <small className="text-muted">Started {fmtDate(exam.started_at)}</small>
          )}
          {exam.completed_at && exam.completed_at !== 'null' && (
            <small className="text-muted">Completed {fmtDate(exam.completed_at)}</small>
          )}
        </div>

        <div className="lifecycle-actions">
          {phase === 'draft' && (
            <>
              {blockers.length > 0 && (
                <ul className="blocker-list" data-testid="list-ready-blockers">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="button button-primary"
                disabled={blockers.length > 0 || transitionMutation.isPending}
                onClick={() => setConfirm('ready')}
                data-testid="button-publish-exam"
              >
                <CheckCircle2 size={15} /> Publish exam
              </button>
            </>
          )}
          {canRevert(exam) && (
            <button
              type="button"
              className="button button-secondary"
              disabled={transitionMutation.isPending}
              onClick={() => setConfirm('revert-to-draft')}
              data-testid="button-revert-exam"
            >
              <RotateCcw size={15} /> Revert to draft
            </button>
          )}
          {canStart(exam) && (
            <button
              type="button"
              className="button button-primary"
              disabled={transitionMutation.isPending}
              onClick={() => setConfirm('start')}
              data-testid="button-start-exam"
            >
              <PlayCircle size={15} /> Start exam
            </button>
          )}
          {canComplete(exam) && (
            <button
              type="button"
              className="button button-danger"
              disabled={transitionMutation.isPending}
              onClick={() => setConfirm('complete')}
              data-testid="button-complete-exam"
            >
              <CalendarClock size={15} /> Complete exam
            </button>
          )}
          {!attemptsExist(exam) && phase === 'draft' && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setDeleteOpen(true)}
              data-testid="button-delete-exam"
            >
              <Trash2 size={15} /> Delete exam
            </button>
          )}
        </div>
      </div>

      {(error || serverBlockers) && (
        <div className="lifecycle-error">
          <ErrorBox error={error} testId="lifecycle-error" />
          {serverBlockers && serverBlockers.length > 0 && (
            <ul className="blocker-list">
              {serverBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? CONFIRMS[confirm].title : ''}
        message={confirm ? CONFIRMS[confirm].message : ''}
        confirmLabel={confirm ? CONFIRMS[confirm].label : 'Confirm'}
        tone={confirm ? CONFIRMS[confirm].tone : 'primary'}
        busy={transitionMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && transitionMutation.mutate(confirm)}
        testId="dialog-lifecycle"
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this examination?"
        message="The exam has no attempts, so the backend will remove it permanently. This cannot be undone."
        confirmLabel="Delete permanently"
        tone="danger"
        busy={deleteMutation.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        testId="dialog-delete-exam"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail page shell with tabs
// ---------------------------------------------------------------------------

export function AdminExamDetail({ params }: { params: { id: string } }) {
  const examId = Number(params.id);
  const [currentPath, setLocation] = useLocation();
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get('tab') as TabId | null;
  const [localTab, setLocalTab] = useState<TabId>('overview');
  const tab: TabId = tabParam ?? localTab;

  const examQuery = useQuery({
    queryKey: ['admin-exam-detail', examId],
    queryFn: ({ signal }) => adminExamApi.showExam(examId, signal),
    enabled: Number.isFinite(examId),
    retry: false,
  });

  const metaQuery = useQuery({
    queryKey: ['admin-exam-content', examId],
    queryFn: async ({ signal }) => {
      const { examApi } = await import('../../../lib/endpoints');
      return examApi.get(examId, signal);
    },
    retry: false,
  });

  const isTeacher = currentPath.startsWith('/teacher');
  const basePath = isTeacher ? '/teacher/exams' : '/admin/exams';

  const setTab = (next: TabId) => {
    setLocalTab(next);
    setLocation(next === 'overview' ? `${basePath}/${examId}` : `${basePath}/${examId}?tab=${next}`);
  };

  const exam = examQuery.data;
  const meta = metaQuery.data;

  const infoPairs = useMemo(() => {
    if (!exam) return [];
    return [
      { label: 'Exam ID', value: `#${exam.id}` },
      { label: 'Category', value: exam.category?.name ?? '—' },
      { label: 'Duration', value: fmtMinutes(exam.total_time) },
      { label: 'Passing', value: exam.passing_percentage != null ? `${exam.passing_percentage}%` : '—' },
      { label: 'Questions', value: String(exam.questions_count ?? 0) },
      { label: 'Assigned students', value: String(exam.assigned_count ?? 0) },
      { label: 'Ongoing attempts', value: String(exam.ongoing_attempts ?? 0) },
      { label: 'Completed attempts', value: String(exam.completed_attempts ?? 0) },
      { label: 'Created', value: meta?.created_at ? fmtDate(meta.created_at) : '—' },
      { label: 'Last updated', value: meta?.updated_at ? fmtDate(meta.updated_at) : '—' },
    ];
  }, [exam, meta]);

  if (examQuery.isLoading) {
    return (
      <div className="page">
        <LoadingBlock label="Loading examination…" />
      </div>
    );
  }

  if (examQuery.isError || !exam) {
    return (
      <div className="page">
        <PageTitle eyebrow={`${isTeacher ? 'TEACHER' : 'ADMIN'} PORTAL / EXAMS`} title="Examination not found" />
        <ErrorBox
          error={examQuery.error ?? new Error('This examination does not exist.')}
          onRetry={() => void examQuery.refetch()}
        />
        <Link href={isTeacher ? '/teacher' : '/admin/exams'} className="button button-secondary">
          <ArrowLeft size={15} /> Back to exams
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle
        eyebrow={`${isTeacher ? 'TEACHER' : 'ADMIN'} PORTAL / EXAM #${exam.id}`}
        title={exam.exam_title}
        detail={
          [
            exam.category?.name,
            examPhase(exam) === 'running' ? 'Running now' : PHASE_LABEL[examPhase(exam)],
            exam.has_password ? 'PIN protected' : 'No PIN',
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        action={
          <Link href={isTeacher ? '/teacher' : '/admin/exams'} className="button button-secondary">
            <ArrowLeft size={15} /> {isTeacher ? 'Teacher dashboard' : 'All exams'}
          </Link>
        }
      />

      <LifecycleBar exam={exam} />

      <div className="exam-info-grid">
        {infoPairs.map((pair) => (
          <div key={pair.label}>
            <small>{pair.label}</small>
            <strong>{pair.value}</strong>
          </div>
        ))}
      </div>

      <div className="tabs-bar" role="tablist" aria-label="Exam management sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab-button ${tab === item.id ? 'tab-active' : ''}`}
            onClick={() => setTab(item.id)}
            data-testid={`tab-${item.id}`}
          >
            {item.icon} {item.label}
            {item.id === 'questions' && exam.questions_count != null && (
              <span className="tab-count">{exam.questions_count}</span>
            )}
            {item.id === 'students' && exam.assigned_count != null && (
              <span className="tab-count">{exam.assigned_count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel">
        {tab === 'overview' && <OverviewTab exam={exam} />}
        {tab === 'questions' && <QuestionsTab exam={exam} />}
        {tab === 'students' && <AssignTab exam={exam} />}
        {tab === 'results' && <ResultsTab exam={exam} />}
        {tab === 'preview' && <PreviewTab exam={exam} />}
      </div>
    </div>
  );
}
