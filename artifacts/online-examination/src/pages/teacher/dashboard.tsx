import { useQuery } from '@tanstack/react-query';
import { adminExamApi } from '../../lib/endpoints';
import {
  FileText,
  Plus,
  Users,
  CheckCircle,
  Clock,
  ArrowRight,
  UserPlus,
  Edit3,
  Calendar,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { AdminRealExam } from '../../lib/types';

export function TeacherDashboard() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-exams'],
    queryFn: ({ signal }) => adminExamApi.listExams(signal),
  });

  const deptsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });

  const examList: AdminRealExam[] = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-block">
          <span className="spinner" aria-hidden="true" />
          Loading teacher dashboard...
        </div>
      </div>
    );
  }

  const draftExams = examList.filter((e) => e.lifecycle_status === 'draft');
  const readyExams = examList.filter((e) => e.lifecycle_status === 'ready');
  const startedExams = examList.filter((e) => e.lifecycle_status === 'started');
  const completedExams = examList.filter((e) => e.lifecycle_status === 'completed');

  const totalAssignedStudents = examList.reduce((acc, exam) => {
    const count = (exam as unknown as { assigned_count?: number; students_count?: number }).assigned_count
      ?? (exam as unknown as { assigned_count?: number; students_count?: number }).students_count
      ?? 0;
    return acc + count;
  }, 0);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ready':
        return <span className="status status-ready">Ready</span>;
      case 'started':
        return <span className="status status-active">Active</span>;
      case 'completed':
        return <span className="status status-completed">Completed</span>;
      case 'draft':
      default:
        return <span className="status status-draft">Draft</span>;
    }
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Teacher Dashboard</h1>
          <p>Oversee your Real Exams, manage student assignments, and evaluate attempts</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate('/teacher/create')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} /> Create Exam
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue">
            <FileText size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{examList.length}</div>
            <div className="stat-label">Total Examinations</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-orange">
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{startedExams.length}</div>
            <div className="stat-label">In Progress (Active)</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <CheckCircle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{readyExams.length}</div>
            <div className="stat-label">Ready / Published</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{draftExams.length}</div>
            <div className="stat-label">Drafts Under Setup</div>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/teacher/create" className="card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'border-color 0.2s' }}>
          <div style={{ background: 'var(--primary-subtle, #eff6ff)', color: 'var(--primary, #3b82f6)', padding: '0.75rem', borderRadius: '8px' }}>
            <Plus size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Create New Real Exam</strong>
            <small style={{ color: 'var(--text-muted)' }}>Configure title, department &amp; password</small>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>

        <Link href="/teacher/assignments" className="card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'border-color 0.2s' }}>
          <div style={{ background: '#ecfdf5', color: '#059669', padding: '0.75rem', borderRadius: '8px' }}>
            <UserPlus size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Student Assignments</strong>
            <small style={{ color: 'var(--text-muted)' }}>Assign candidates from target departments</small>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>

        <Link href="/teacher/grading" className="card" style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'border-color 0.2s' }}>
          <div style={{ background: '#fef3c7', color: '#d97706', padding: '0.75rem', borderRadius: '8px' }}>
            <Edit3 size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Attempt Grading</strong>
            <small style={{ color: 'var(--text-muted)' }}>Score subjective answers &amp; review results</small>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>
      </div>

      {/* Real Exams Table Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>My Real Examinations</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {examList.length} total
          </span>
        </div>
        <div className="card-body">
          {examList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <FileText size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h3>No examinations created yet</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 1.25rem' }}>
                Create your first examination to configure questions, assign students, and run assessments.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => navigate('/teacher/create')}
              >
                <Plus size={16} /> Create Exam
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem' }}>Examination</th>
                    <th style={{ padding: '0.75rem' }}>Department</th>
                    <th style={{ padding: '0.75rem' }}>Duration</th>
                    <th style={{ padding: '0.75rem' }}>Pass Mark</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {examList.map((exam) => (
                    <tr key={exam.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                      <td style={{ padding: '0.85rem 0.75rem' }}>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{exam.exam_title}</strong>
                        {exam.description && (
                          <small style={{ color: 'var(--text-muted)', display: 'block', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exam.description}
                          </small>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        {deptsQuery.data?.find((d) => d.id === exam.department_id)?.name ?? `Dept #${exam.department_id}`}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        {exam.total_time ? `${exam.total_time} min` : 'Untimed'}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        {exam.passing_percentage ?? 50}%
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem' }}>
                        {getStatusBadge(exam.lifecycle_status)}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <Link
                            href={`/teacher/exams/${exam.id}`}
                            className="button button-secondary button-sm"
                            title="Manage exam content, questions, sections, and lifecycle"
                          >
                            Manage
                          </Link>
                          <Link
                            href="/teacher/assignments"
                            className="button button-secondary button-sm"
                            title="Assign students"
                          >
                            Assign
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
