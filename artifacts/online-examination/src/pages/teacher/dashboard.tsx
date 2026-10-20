import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '../../lib/endpoints';
import { FileText, Plus, Users, CheckCircle, Clock } from 'lucide-react';

export function TeacherDashboard() {
  const { data: exams, isLoading } = useQuery({
    queryKey: ['teacher-exams'],
    queryFn: () => teacherApi.listRealExams({ page: 1, perPage: 10 }),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-block">
          <span className="spinner" aria-hidden="true" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  const examList = exams?.data ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Teacher Dashboard</h1>
        <p>Manage your Real Exams and student assignments</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue">
            <FileText size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{examList.length}</div>
            <div className="stat-label">My Exams</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">0</div>
            <div className="stat-label">Assigned Students</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-orange">
            <Clock size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">0</div>
            <div className="stat-label">Pending Grading</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <CheckCircle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">0</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>My Real Exams</h2>
          <button className="button button-primary">
            <Plus size={16} /> Create Exam
          </button>
        </div>
        <div className="card-body">
          {examList.length === 0 ? (
            <p>No exams created yet. Create your first Real Exam to get started.</p>
          ) : (
            <ul>
              {examList.map((exam) => (
                <li key={exam.id}>{exam.exam_title}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
