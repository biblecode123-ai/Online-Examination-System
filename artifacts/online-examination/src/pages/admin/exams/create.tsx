import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft,
  CheckSquare,
  FileText,
  Info,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { ApiError } from '../../../lib/api';
import { ErrorBox, LoadingBlock, PageTitle } from '../../../components/shell';

const DEFAULT_INSTRUCTIONS = `1. Ensure you are in a quiet environment with a stable internet connection.
2. Read each question carefully before submitting your answer.
3. Your responses are automatically saved in the background. If your connection drops, reconnect promptly to continue.
4. Leaving full-screen mode, switching tabs, or using external aids is strictly monitored and recorded.
5. All unanswered questions will receive zero marks. Ensure you review your work before clicking Final Submit.`;

/**
 * Create a new official Real Exam.
 *
 * Only exams of the existing `Real Exam` category may be created through this
 * workflow — the category is fetched from the backend (never hardcoded). The
 * governed store endpoint (POST /v1/teacher/real-exams) accepts title,
 * description, exam-level instructions, one or more departments, duration (1–480 min),
 * passing percentage, and a REQUIRED password; every exam is born as a draft.
 */
export function AdminExamCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [deptSearch, setDeptSearch] = useState('');
  const [selectedCollege, setSelectedCollege] = useState<string>('all');
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

  /** List of distinct colleges for filtering departments */
  const colleges = useMemo(() => {
    const list = deptQuery.data ?? [];
    const set = new Set<string>();
    for (const d of list) {
      if (d.college && d.college.trim()) {
        set.add(d.college.trim());
      }
    }
    return Array.from(set).sort();
  }, [deptQuery.data]);

  /** Filter departments by search keyword and college */
  const filteredDepartments = useMemo(() => {
    const list = deptQuery.data ?? [];
    const q = deptSearch.trim().toLowerCase();
    return list.filter((dept) => {
      const matchesSearch =
        !q ||
        dept.name.toLowerCase().includes(q) ||
        (dept.college && dept.college.toLowerCase().includes(q)) ||
        (dept.abbreviation && dept.abbreviation.toLowerCase().includes(q));
      const matchesCollege = selectedCollege === 'all' || dept.college === selectedCollege;
      return matchesSearch && matchesCollege;
    });
  }, [deptQuery.data, deptSearch, selectedCollege]);

  /** Selected department objects for chips display */
  const selectedDeptObjects = useMemo(() => {
    const list = deptQuery.data ?? [];
    const map = new Map(list.map((d) => [d.id, d]));
    return departmentIds.map((id) => map.get(id)).filter(Boolean) as {
      id: number;
      name: string;
      college?: string | null;
    }[];
  }, [deptQuery.data, departmentIds]);

  const toggleDepartment = (id: number) => {
    setDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredDepartments.map((d) => d.id);
    setDepartmentIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => {
    setDepartmentIds([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const exam = await adminExamApi.createExam({
        exam_title: title.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        department_id: departmentIds[0],
        department_ids: departmentIds.length > 0 ? departmentIds : undefined,
        total_time: Number(totalTime),
        passing_percentage: Number(passing),
        exam_password: password,
      });

      // Also persist instructions to structure if provided
      if (instructions.trim()) {
        try {
          await adminExamApi.putStructure(exam.id, {
            instructions: instructions.trim(),
            sections: [],
          });
        } catch (e) {
          console.warn('Could not save instructions via putStructure:', e);
        }
      }

      return exam;
    },
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      setLocation(`/admin/exams/${exam.id}`);
    },
  });

  const clientErrors: Record<string, string> = {};
  if (!title.trim()) clientErrors.title = 'An exam title is required.';
  if (departmentIds.length === 0) clientErrors.department = 'Select at least one department.';
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
        {/* SECTION 1: BASIC INFORMATION */}
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
                placeholder="e.g. Data Structures & Algorithms — Final Examination"
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

            <div className="form-group span-2">
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
          </div>
        </div>

        {/* SECTION 2: TARGET DEPARTMENTS (Fixed & Redesigned) */}
        <div className="card exam-form-section">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>2 · Target departments *</h2>
              <small className="text-muted">
                Select one or more departments eligible to take this examination.
              </small>
            </div>
            <span className="badge badge-blue">
              {deptQuery.isLoading
                ? 'Loading departments…'
                : `${deptQuery.data?.length ?? 0} total departments`}
            </span>
          </div>
          <div className="card-body">
            {errFor('department', 'department_ids') && (
              <small className="field-error" style={{ display: 'block', marginBottom: 12 }}>
                {errFor('department', 'department_ids')}
              </small>
            )}

            {deptQuery.isLoading ? (
              <LoadingBlock label="Fetching all departments from server…" />
            ) : deptQuery.isError ? (
              <ErrorBox error={deptQuery.error} onRetry={() => void deptQuery.refetch()} />
            ) : (
              <div className="dept-selector-container">
                {/* Search and Filter Toolbar */}
                <div className="dept-selector-toolbar">
                  <div className="dept-selector-search-wrap">
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Search departments by name, college, code…"
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                      data-testid="input-dept-search"
                    />
                  </div>

                  {colleges.length > 0 && (
                    <select
                      className="select"
                      style={{ height: 36, fontSize: 13, width: 'auto', minWidth: 160 }}
                      value={selectedCollege}
                      onChange={(e) => setSelectedCollege(e.target.value)}
                      data-testid="select-college-filter"
                    >
                      <option value="all">All Colleges ({colleges.length})</option>
                      {colleges.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="dept-selector-actions">
                    <button
                      type="button"
                      className="dept-selector-btn"
                      onClick={selectAllFiltered}
                      title="Select all currently filtered departments"
                    >
                      <CheckSquare size={14} /> Select Filtered ({filteredDepartments.length})
                    </button>
                    {departmentIds.length > 0 && (
                      <button
                        type="button"
                        className="dept-selector-btn"
                        onClick={clearSelection}
                        title="Deselect all departments"
                      >
                        <RotateCcw size={14} /> Clear Selection
                      </button>
                    )}
                    <span className="dept-selector-count">
                      Selected: <strong>{departmentIds.length}</strong> of {deptQuery.data?.length ?? 0}
                    </span>
                  </div>
                </div>

                {/* Selected Departments Chips Bar */}
                {selectedDeptObjects.length > 0 && (
                  <div className="dept-selected-chips-area">
                    {selectedDeptObjects.map((d) => (
                      <span key={d.id} className="dept-chip">
                        <span>{d.name}</span>
                        <button
                          type="button"
                          className="dept-chip-remove"
                          onClick={() => toggleDepartment(d.id)}
                          aria-label={`Remove ${d.name}`}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Scrollable Department Grid */}
                <div className="dept-selector-list" data-testid="dept-selector-list">
                  {filteredDepartments.length === 0 ? (
                    <div className="dept-selector-empty">
                      <p>No departments found matching "{deptSearch}".</p>
                      {deptSearch && (
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            setDeptSearch('');
                            setSelectedCollege('all');
                          }}
                        >
                          Reset search filter
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredDepartments.map((dept) => {
                      const isSelected = departmentIds.includes(dept.id);
                      return (
                        <div
                          key={dept.id}
                          className={`dept-item-card ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => toggleDepartment(dept.id)}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              toggleDepartment(dept.id);
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            className="dept-item-checkbox"
                            checked={isSelected}
                            onChange={() => toggleDepartment(dept.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="dept-item-info">
                            <span className="dept-item-name" title={dept.name}>
                              {dept.name}
                            </span>
                            {dept.college && (
                              <span className="dept-item-college" title={dept.college}>
                                {dept.college}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: EXAM LEVEL INSTRUCTIONS */}
        <div className="card exam-form-section">
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <h2>3 · Exam-level instructions for students</h2>
              <small className="text-muted">
                General rules and directions presented to students before unlocking and attempting the exam.
              </small>
            </div>
            <div className="instructions-header-actions">
              <button
                type="button"
                className="instructions-template-btn"
                onClick={() => setInstructions(DEFAULT_INSTRUCTIONS)}
                title="Fill with standard exam instructions template"
              >
                <Sparkles size={14} /> Insert Standard Template
              </button>
              {instructions && (
                <button
                  type="button"
                  className="dept-selector-btn"
                  onClick={() => setInstructions('')}
                  title="Clear instructions"
                >
                  <RotateCcw size={13} /> Clear
                </button>
              )}
            </div>
          </div>
          <div className="card-body">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="exam-instructions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} /> General examination instructions
              </label>
              <textarea
                id="exam-instructions"
                rows={7}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Enter instructions for students (e.g. permitted materials, conduct rules, autosave policies, submission deadline)..."
                data-testid="textarea-exam-instructions"
                style={{ fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <small className="field-hint" style={{ marginTop: 6, display: 'block' }}>
                Instructions are saved directly with this examination. You can also refine them later in the exam detail page.
              </small>
            </div>
          </div>
        </div>

        {/* SECTION 4: EXAMINATION CONFIGURATION */}
        <div className="card exam-form-section">
          <div className="card-header">
            <h2>4 · Examination configuration</h2>
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