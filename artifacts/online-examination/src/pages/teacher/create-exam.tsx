import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminExamApi } from '../../lib/endpoints';
import { ApiError } from '../../lib/api';
import { Save, ArrowLeft, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function TeacherCreateExam() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    exam_title: '',
    department_ids: [] as number[],
    total_time: 60,
    passing_percentage: 50,
    exam_password: '',
    description: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');

  // Load departments from the backend (never hardcode)
  const deptQuery = useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });

  // Load categories from backend, find the real-exam category id
  const catQuery = useQuery({
    queryKey: ['exam-categories'],
    queryFn: ({ signal }) => adminExamApi.categories(signal),
    staleTime: 5 * 60_000,
  });

  const realExamCategoryId = catQuery.data?.find(
    (c) => (c.slug ?? '').toLowerCase().replace(/_/g, '-') === 'real-exam'
  )?.id;

  const createExamMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      adminExamApi.createExam({
        exam_title: data.exam_title,
        department_id: data.department_ids.length > 0 ? data.department_ids[0] : undefined,
        department_ids: data.department_ids.length > 0 ? data.department_ids : undefined,
        total_time: data.total_time,
        passing_percentage: data.passing_percentage,
        exam_password: data.exam_password,
        description: data.description || undefined,
      }),
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      // Navigate to the new exam's detail page
      navigate(`/admin/exams/${exam.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.errors) {
        const map: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(err.errors)) {
          map[field] = Array.isArray(msgs) ? msgs[0] : String(msgs);
        }
        setFieldErrors(map);
        setGlobalError(err.message || 'Validation failed.');
      } else {
        setGlobalError(err instanceof Error ? err.message : 'Could not create exam.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError('');

    if (!realExamCategoryId) {
      setGlobalError('Real Exam category is not configured in the backend. Please seed exam categories first.');
      return;
    }
    if (formData.department_ids.length === 0) {
      setFieldErrors((prev) => ({ ...prev, department_ids: 'Please select at least one department.' }));
      return;
    }
    if (!formData.exam_password) {
      setFieldErrors((prev) => ({ ...prev, exam_password: 'An exam access PIN is required.' }));
      return;
    }
    if (!/^\d{4}$/.test(formData.exam_password)) {
      setFieldErrors((prev) => ({ ...prev, exam_password: 'The PIN must be exactly 4 digits.' }));
      return;
    }

    createExamMutation.mutate(formData);
  };

  const addDepartment = (deptId: number) => {
    if (!formData.department_ids.includes(deptId)) {
      setFormData({ ...formData, department_ids: [...formData.department_ids, deptId] });
    }
  };

  const removeDepartment = (deptId: number) => {
    setFormData({ ...formData, department_ids: formData.department_ids.filter(id => id !== deptId) });
  };

  const isPending = createExamMutation.isPending;
  const depts = deptQuery.data ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <Link href="/admin/exams" className="button button-secondary">
          <ArrowLeft size={16} /> Back to Exams
        </Link>
        <h1>Create Real Exam</h1>
        <p>Create a new teacher-controlled examination. The exam will be saved as a draft.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Exam Details</h2>
        </div>
        <div className="card-body">
          {globalError && (
            <div className="alert alert-error" style={{ marginBottom: '1rem', color: 'red' }}>
              {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="exam_title">Exam Title *</label>
              <input
                id="exam_title"
                type="text"
                value={formData.exam_title}
                onChange={(e) => setFormData({ ...formData, exam_title: e.target.value })}
                required
                maxLength={255}
              />
              {fieldErrors.exam_title && <p className="field-error">{fieldErrors.exam_title}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className="form-group">
              <label htmlFor="department_id">Target Departments *</label>
              {deptQuery.isLoading ? (
                <p>Loading departments…</p>
              ) : deptQuery.isError ? (
                <p className="field-error">Could not load departments. Check your connection.</p>
              ) : (
                <>
                  <select
                    id="department_id"
                    value=""
                    onChange={(e) => {
                      const deptId = parseInt(e.target.value, 10);
                      if (deptId) addDepartment(deptId);
                    }}
                    className="select"
                    style={{ marginBottom: '0.75rem' }}
                  >
                    <option value="">Add a department…</option>
                    {depts
                      .filter(dept => !formData.department_ids.includes(dept.id))
                      .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  {formData.department_ids.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                    }}>
                      {formData.department_ids.map((deptId) => {
                        const dept = depts.find(d => d.id === deptId);
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
                              border: '1px solid #e2e8f0',
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
                                color: '#64748b',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                e.currentTarget.style.color = '#ef4444';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#64748b';
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {fieldErrors.department_ids && (
                <p className="field-error">{fieldErrors.department_ids}</p>
              )}
              <small style={{ color: '#666' }}>
                Select one or more departments that will take this exam. Students from all selected departments will be eligible.
              </small>
            </div>

            <div className="form-group">
              <label>Exam Category</label>
              {catQuery.isLoading ? (
                <p>Loading categories…</p>
              ) : !realExamCategoryId ? (
                <p className="field-error">
                  Real Exam category not found in the backend. Please seed exam categories.
                </p>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={
                    catQuery.data?.find((c) => c.id === realExamCategoryId)?.name ?? 'Real Exam'
                  }
                  style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                />
              )}
              <small style={{ color: '#666' }}>
                Only Real Exam category is allowed in the teacher workflow.
              </small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="total_time">Duration (minutes) *</label>
                <input
                  id="total_time"
                  type="number"
                  value={formData.total_time}
                  onChange={(e) =>
                    setFormData({ ...formData, total_time: parseInt(e.target.value) || 1 })
                  }
                  min={1}
                  max={480}
                  required
                />
                {fieldErrors.total_time && (
                  <p className="field-error">{fieldErrors.total_time}</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="passing_percentage">Passing Score (%) *</label>
                <input
                  id="passing_percentage"
                  type="number"
                  value={formData.passing_percentage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      passing_percentage: parseInt(e.target.value) || 0,
                    })
                  }
                  min={0}
                  max={100}
                  required
                />
                {fieldErrors.passing_percentage && (
                  <p className="field-error">{fieldErrors.passing_percentage}</p>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="exam_password">Exam Access Password *</label>
              <input
                id="exam_password"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={formData.exam_password}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setFormData({ ...formData, exam_password: value });
                }}
                required
                autoComplete="new-password"
                placeholder="Enter 4-digit PIN"
                style={{ letterSpacing: '0.5em', fontFamily: 'monospace', fontSize: '1.1rem' }}
              />
              <small style={{ color: '#666' }}>
                Students must enter this 4-digit PIN to begin the exam. Stored securely.
              </small>
              {fieldErrors.exam_password && (
                <p className="field-error">{fieldErrors.exam_password}</p>
              )}
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={isPending || !realExamCategoryId}
            >
              <Save size={16} /> {isPending ? 'Creating…' : 'Create Exam (Draft)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
