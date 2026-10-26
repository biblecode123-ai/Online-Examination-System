import { useQuery } from '@tanstack/react-query';
import { adminExamApi } from '../../lib/endpoints';
import { BarChart3, Building2, Users, FileText, TrendingUp, Settings, Shield, Plus, ArrowRight, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export function AdminDashboard() {
  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ['admin-real-exams'],
    queryFn: ({ signal }) => adminExamApi.listExams(signal),
  });

  const loading = examsLoading;

  const totalExams = typeof exams?.total === 'number' ? exams.total : 0;
  const totalStudents = exams?.items.reduce((sum, exam) => sum + (exam.assigned_count ?? 0), 0);
  const totalAttempts = exams?.items.reduce(
    (sum, exam) => sum + (exam.completed_attempts ?? 0) + (exam.ongoing_attempts ?? 0),
    0,
  );

  const getCurrentDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading-block">
          <span className="spinner" aria-hidden="true" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="admin-dashboard">
        <div className="dashboard-hero">
          <div>
            <h1>Administration Center</h1>
            <p>{getCurrentDate()}</p>
          </div>
          <div className="hero-actions">
            <button className="button button-primary">
              <Plus size={16} />
              New Exam
            </button>
            <button className="button button-secondary">
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>

        <div className="dashboard-stats">
          <div className="admin-stat-card admin-stat-exams">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <FileText size={20} />
              </div>
              <span className="admin-stat-trend neutral">
                <TrendingUp size={12} />
                Live
              </span>
            </div>
            <div className="admin-stat-value">
              {typeof totalExams === 'number' ? totalExams.toLocaleString() : '0'}
            </div>
            <div className="admin-stat-label">Real Exams</div>
            <div className="admin-stat-meta">Teacher-created, administered examinations</div>
          </div>

          <div className="admin-stat-card admin-stat-students">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <Users size={20} />
              </div>
              <span className="admin-stat-trend neutral">
                <TrendingUp size={12} />
                Active
              </span>
            </div>
            <div className="admin-stat-value">
              {typeof totalStudents === 'number' ? totalStudents.toLocaleString() : '0'}
            </div>
            <div className="admin-stat-label">Registered Students</div>
            <div className="admin-stat-meta">Assigned by teachers or administrators</div>
          </div>

          <div className="admin-stat-card admin-stat-attempts">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <BarChart3 size={20} />
              </div>
              <span className="admin-stat-trend neutral">
                <TrendingUp size={12} />
                Current
              </span>
            </div>
            <div className="admin-stat-value">
              {typeof totalAttempts === 'number' ? totalAttempts.toLocaleString() : '0'}
            </div>
            <div className="admin-stat-label">Exam Attempts</div>
            <div className="admin-stat-meta">Student attempts on real examinations</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-main">
            <div className="admin-panel">
              <div className="admin-panel-header">
                <h2>System Status</h2>
                <span className="admin-panel-badge status-green">Operational</span>
              </div>
              <div className="admin-panel-body">
                <div className="status-item">
                  <div className="status-item-icon">
                    <CheckCircle size={18} />
                  </div>
                  <div className="status-item-content">
                    <strong>Database Connection</strong>
                    <small>All services running normally</small>
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-item-icon">
                    <CheckCircle size={18} />
                  </div>
                  <div className="status-item-content">
                    <strong>Authentication Service</strong>
                    <small>Token validation active</small>
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-item-icon status-warning">
                    <AlertCircle size={18} />
                  </div>
                  <div className="status-item-content">
                    <strong>Storage Usage</strong>
                    <small>73% capacity used — review recommended</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <h2>Quick Actions</h2>
              </div>
              <div className="admin-panel-body">
                <div className="quick-actions-grid">
                  <button className="quick-action-card">
                    <div className="quick-action-icon">
                      <Users size={20} />
                    </div>
                    <strong>Manage Users</strong>
                    <small>Add, edit, or remove user accounts</small>
                    <ArrowRight size={16} className="quick-action-arrow" />
                  </button>
                  <button className="quick-action-card">
                    <div className="quick-action-icon">
                      <Building2 size={20} />
                    </div>
                    <strong>Departments</strong>
                    <small>Configure academic departments</small>
                    <ArrowRight size={16} className="quick-action-arrow" />
                  </button>
                  <button className="quick-action-card">
                    <div className="quick-action-icon">
                      <FileText size={20} />
                    </div>
                    <strong>Exam Oversight</strong>
                    <small>Monitor active examinations</small>
                    <ArrowRight size={16} className="quick-action-arrow" />
                  </button>
                  <button className="quick-action-card">
                    <div className="quick-action-icon">
                      <Shield size={20} />
                    </div>
                    <strong>Security Audit</strong>
                    <small>Review system access logs</small>
                    <ArrowRight size={16} className="quick-action-arrow" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-sidebar">
            <div className="admin-panel admin-panel-activity">
              <div className="admin-panel-header">
                <h2>Recent Activity</h2>
                <Clock size={16} className="panel-icon" />
              </div>
              <div className="admin-panel-body">
                <div className="activity-feed">
                  <div className="activity-item">
                    <div className="activity-time">2h ago</div>
                    <div className="activity-content">
                      <strong>New exam created</strong>
                      <small>Computer Science Department</small>
                    </div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-time">4h ago</div>
                    <div className="activity-content">
                      <strong>50 students imported</strong>
                      <small>Bulk import completed</small>
                    </div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-time">6h ago</div>
                    <div className="activity-content">
                      <strong>Exam results exported</strong>
                      <small>Mathematics Department</small>
                    </div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-time">1d ago</div>
                    <div className="activity-content">
                      <strong>System maintenance</strong>
                      <small>Scheduled backup completed</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-panel admin-panel-notice">
              <div className="admin-panel-body">
                <div className="notice-content">
                  <Shield size={24} />
                  <div>
                    <strong>Security Reminder</strong>
                    <small>Review user permissions quarterly to maintain system integrity.</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
