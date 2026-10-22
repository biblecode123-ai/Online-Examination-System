import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Info, Save } from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { ApiError } from '../../../lib/api';
import { ErrorBox, LoadingBlock, PageTitle } from '../../../components/shell';

/**
 * Create a new official Real Exam.
 *
 * Only exams of the existing `Real Exam` category may be created through this
 * workflow — the category is fetched from the backend (never hardcoded). The
 * governed store endpoint (POST /v1/teacher/real-exams) accepts title,
 * description, ONE department, duration (1–480 min), passing percentage and a
 * REQUIRED password; every exam is born as a draft. Cross-checked against
 * TeacherRealExamController::store in ofijan-backend.
 */
export function AdminExamCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
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
        department_id: departmentId ?? undefined,
        total_time: Number(totalTime),
        passing_percentage: Number(passing),
        exam_password: password,
      }),
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      setLocation(`/admin/exams/${exam.id}`);
    },
  });

  const clientErrors: Record<string, string> = {};
  if (!title.trim()) clientErrors.title = 'An exam title is required.';
  if (!departmentId) clientErrors.department = 'Select the department this exam belongs to.';
  if (!Number.isFinite(Number(totalTime)) || Number(totalTime) < 1 || Number(totalTime) > 480)
    clientErrors.total_time = 'Allocated time must be between 1 and 480 minutes (backend limit).';
  if (Number(passing) < 0 || Number(passing) > 100)
    clientErrors.passing = 'Passing percentage must be between 0 and 100.';
  if (!password) clientErrors.password = 'An exam password is required by the server.';
  else if (!/^\d{4}$/.test(password)) clientErrors.password = 'The password must be exactly 4 digits.';
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
              <label htmlFor="exam-department">Department *</label>
              <select
                id="exam-department"
                className="select"
                value={departmentId ?? ''}
                onChange={(e) => setDepartmentId(Number(e.target.value) || null)}
                data-testid="select-exam-department"
              >
                <option value="">Select a department…</option>
                {(deptQuery.data ?? []).map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>

              {errFor('department', 'department_id') && (
                <small className="field-error">{errFor('department', 'department_id')}</small>
              )}
              <small className="field-hint">
                One department per exam — the governed backend workflow accepts a single department.
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
                max={480}
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
              <label htmlFor="exam-password">Exam password *</label>
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
                Students must enter this 4-digit PIN to open the exam. The server rejects Real Exams without a password.
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
