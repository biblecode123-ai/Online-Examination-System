import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminExamApi } from '../../lib/endpoints';
import { ApiError } from '../../lib/api';
import { Save, ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function TeacherCreateExam() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    exam_title: '',
    department_id: 0,
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
        department_id: data.department_id,
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
    if (!formData.department_id) {
      setFieldErrors((prev) => ({ ...prev, department_id: 'Please select a department.' }));
      return;
    }
    if (!formData.exam_password) {
      setFieldErrors((prev) => ({ ...prev, exam_password: 'An exam access password is required.' }));
      return;
    }

    createExamMutation.mutate(formData);
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
              <label htmlFor="department_id">Target Department *</label>
              {deptQuery.isLoading ? (
                <p>Loading departments…</p>
              ) : deptQuery.isError ? (
                <p className="field-error">Could not load departments. Check your connection.</p>
              ) : (
                <select
                  id="department_id"
                  value={formData.department_id || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, department_id: parseInt(e.target.value) || 0 })
                  }
                  className="select"
                  required
                >
                  <option value="">Select a department…</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {fieldErrors.department_id && (
                <p className="field-error">{fieldErrors.department_id}</p>
              )}
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
                type="password"
                value={formData.exam_password}
                onChange={(e) => setFormData({ ...formData, exam_password: e.target.value })}
                minLength={4}
                maxLength={100}
                required
                autoComplete="new-password"
              />
              <small style={{ color: '#666' }}>
                Students must enter this password to begin the exam. Stored as a one-way hash — never
                retrievable.
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
