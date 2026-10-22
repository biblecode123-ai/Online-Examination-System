import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Info, Save, Plus, X, Check } from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { ApiError } from '../../../lib/api';
import { ErrorBox, LoadingBlock, PageTitle } from '../../../components/shell';

/**
 * Create a new official Real Exam.
 *
 * Only exams of the existing `Real Exam` category may be created through this
 * workflow — the category is fetched from the backend (never hardcoded). The
 * governed store endpoint (POST /v1/teacher/real-exams) accepts title,
 * description, departments (multiple), duration, passing percentage and password; every
 * exam is born as a draft.
 */
export function AdminExamCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [totalTime, setTotalTime] = useState(60);
  const [passing, setPassing] = useState(50);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const deptQuery = useQuery({
    queryKey: ['admin-exams', 'departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });
  const catQuery = useQuery({
    queryKey: ['admin-exams', 'categories'],
    queryFn: ({ signal }) => adminExamApi.categories(signal),
    staleTime: 5 * 60_000,
  });

  /** The one category this workflow may create — resolved from the backend. */
  const realCategory = useMemo(() => {
    const cats = catQuery.data ?? [];
    return (
      cats.find((c) => (c.slug ?? '').toLowerCase().replace(/_/g, '-') === 'real-exam') ??
      cats.find((c) => (c.slug ?? '').toLowerCase().replace(/_/g, '-') === 'realexam') ??
      cats.find((c) => c.name.toLowerCase() === 'real exam') ??
      null
    );
  }, [catQuery.data]);

  const createMutation = useMutation({
    mutationFn: () =>
      adminExamApi.createExam({
        exam_title: title.trim(),
        description: description.trim() || null,
        department_id: departmentIds.length > 0 ? departmentIds[0] : undefined,
        department_ids: departmentIds.length > 0 ? departmentIds : undefined,
        total_time: Number(totalTime),
        passing_percentage: Number(passing),
        ...(password ? { exam_password: password } : {}),
      }),
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      setLocation(`/admin/exams/${exam.id}`);
    },
  });

  const clientErrors: Record<string, string> = {};
  if (!title.trim()) clientErrors.title = 'An exam title is required.';
  if (departmentIds.length === 0) clientErrors.department = 'Select at least one target department.';
  if (!Number.isFinite(Number(totalTime)) || Number(totalTime) <= 0)
    clientErrors.total_time = 'Allocated time must be at least 1 minute.';
  if (Number(passing) < 0 || Number(passing) > 100)
    clientErrors.passing = 'Passing percentage must be between 0 and 100.';
  if (password && (!/^\d{4}$/.test(password))) clientErrors.password = 'The password must be exactly 4 digits.';
  const valid = Object.keys(clientErrors).length === 0;

  const error = createMutation.error;
  const serverErrors =
    error instanceof ApiError && error.errors ? error.errors : undefined;

  const errFor = (field: string, serverField = field) => {
    if (touched && serverErrors?.[serverField]?.[0]) return serverErrors[serverField][0];
    if (touched) return clientErrors[field];
    return undefined;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || createMutation.isPending) return;
    createMutation.mutate();
  };

  const addDepartment = (deptId: number) => {
    if (!departmentIds.includes(deptId)) {
      setDepartmentIds([...departmentIds, deptId]);
    }
  };

  const removeDepartment = (deptId: number) => {
    setDepartmentIds(departmentIds.filter(id => id !== deptId));
  };

  return (
    <div className="page">
      <PageTitle
        eyebrow="ADMIN PORTAL / EXAMS"
        title="Create an official examination"
        detail="Real Exam category · saved as a draft until you publish it"
        action={
          <Link href="/admin/exams" className="button button-secondary">
            <ArrowLeft size={15} /> Back to exams
          </Link>
        }
      />

      {catQuery.isLoading ? (
        <LoadingBlock label="Resolving the exam category…" />
      ) : (
        !realCategory && (
          <div className="exam-alert" role="alert">
            <Info size={16} />
            <span>
              The <strong>Real Exam</strong> category was not found on the server. Exams are still
              created, but verify the category assignment after publishing.
            </span>
          </div>
        )
      )}

      <ErrorBox error={error} testId="create-exam-error" />

      <form onSubmit={submit} noValidate>
        <div className="card exam-form-section">
          <div className="card-header">
            <h2>1 · Basic information</h2>
          </div>
          <div className="card-body exam-form-grid">
            <div className="form-group span-2">
              <label htmlFor="exam-title">Exam title *</label>
              <input
                id="exam-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Data Structures — Final Examination"
                data-testid="input-exam-title"
              />
              {errFor('title', 'exam_title') && (
                <small className="field-error">{errFor('title', 'exam_title')}</small>
              )}
            </div>

            <div className="form-group span-2">
              <label htmlFor="exam-description">Description</label>
              <textarea
                id="exam-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description shown to assigned students."
                data-testid="textarea-exam-description"
              />
            </div>

            <div className="form-group">
              <label htmlFor="exam-category">Exam category</label>
              <input
                id="exam-category"
                type="text"
                readOnly
                value={
                  catQuery.isLoading
                    ? 'Loading…'
                    : realCategory
                      ? `${realCategory.name} (#${realCategory.id})`
                      : 'Real Exam (not found on server)'
                }
                className="readonly-input"
                data-testid="input-exam-category"
              />
              <small className="field-hint">
                This workflow only creates official Real Exams; the category comes from the backend.
              </small>
            </div>

            <div className="form-group span-2">
              <label htmlFor="exam-department">Target departments *</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <select
                  id="exam-department"
                  className="select"
                  value=""
                  onChange={(e) => {
                    const deptId = parseInt(e.target.value, 10);
                    if (deptId) addDepartment(deptId);
                  }}
                  data-testid="select-exam-department"
                  style={{ flex: 1 }}
                >
                  <option value="">Add a department…</option>
                  {(deptQuery.data ?? [])
                    .filter(dept => !departmentIds.includes(dept.id))
                    .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {departmentIds.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  background: 'var(--muted-bg, #f8fafc)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                }}>
                  {departmentIds.map((deptId) => {
                    const dept = (deptQuery.data ?? []).find(d => d.id === deptId);
                    if (!dept) return null;
                    return (
                      <div
                        key={deptId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.4rem 0.75rem',
                          background: 'white',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '9999px',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                        }}
                      >
                        <span>{dept.name}</span>
                        <button
                          type="button"
                          onClick={() => removeDepartment(deptId)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.color = '#ef4444';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-muted)';
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {errFor('department', 'department_id') && (
                <small className="field-error">{errFor('department', 'department_id')}</small>
              )}
              <small className="field-hint">
                Select one or more departments that will take this exam. Students from all selected departments will be eligible.
              </small>
            </div>
          </div>
        </div>

        <div className="card exam-form-section">
          <div className="card-header">
            <h2>2 · Examination configuration</h2>
          </div>
          <div className="card-body exam-form-grid">
            <div className="form-group">
              <label htmlFor="exam-duration">Allocated time (minutes) *</label>
              <input
                id="exam-duration"
                type="number"
                min={1}
                max={600}
                value={totalTime}
                onChange={(e) => setTotalTime(Number(e.target.value))}
                data-testid="input-exam-duration"
              />
              {errFor('total_time', 'total_time') && (
                <small className="field-error">{errFor('total_time', 'total_time')}</small>
              )}
              <small className="field-hint">
                The server enforces this clock — extending a frontend timer has no effect.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="exam-passing">Passing percentage (%)</label>
              <input
                id="exam-passing"
                type="number"
                min={0}
                max={100}
                value={passing}
                onChange={(e) => setPassing(Number(e.target.value))}
                data-testid="input-exam-passing"
              />
              {errFor('passing', 'passing_percentage') && (
                <small className="field-error">{errFor('passing', 'passing_percentage')}</small>
              )}
            </div>

            <div className="form-group span-2">
              <label htmlFor="exam-password">Exam password</label>
              <input
                id="exam-password"
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
                placeholder="Enter 4-digit password"
                data-testid="input-exam-password"
                style={{ letterSpacing: '0.5em', fontFamily: 'monospace', fontSize: '1.1rem' }}
              />
              {errFor('password', 'exam_password') && (
                <small className="field-error">{errFor('password', 'exam_password')}</small>
              )}
              <small className="field-hint">
                Students must enter this 4-digit PIN to open the exam. Publishing is blocked until a password is set.
              </small>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Link href="/admin/exams" className="button button-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="button button-primary"
            disabled={createMutation.isPending}
            data-testid="button-save-draft"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Creating draft…' : 'Save as draft'}
          </button>
        </div>
        <small className="field-hint form-footnote">
          The exam starts as a <strong>draft</strong>: add questions and students, then publish it
          from the exam page.
        </small>
      </form>
    </div>
  );
}
