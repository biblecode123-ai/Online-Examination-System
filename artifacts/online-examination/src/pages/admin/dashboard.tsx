import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/endpoints';
import { BarChart3, Users, Building2, FileText, TrendingUp } from 'lucide-react';

export function AdminDashboard() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['admin-summary'],
    queryFn: () => adminApi.summary(),
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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin Dashboard</h1>
        <p>System overview and management</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{typeof summary?.total_users === 'number' ? summary.total_users : 0}</div>
            <div className="stat-label">Total Users</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <Building2 size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{typeof summary?.total_departments === 'number' ? summary.total_departments : 0}</div>
            <div className="stat-label">Departments</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <FileText size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{typeof summary?.total_exams === 'number' ? summary.total_exams : 0}</div>
            <div className="stat-label">Total Exams</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-orange">
            <BarChart3 size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{typeof summary?.total_attempts === 'number' ? summary.total_attempts : 0}</div>
            <div className="stat-label">Exam Attempts</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent Activity</h2>
        </div>
        <div className="card-body">
          <p>Admin dashboard features coming soon.</p>
          <ul>
            <li>User management</li>
            <li>Department management</li>
            <li>Exam oversight</li>
            <li>Results export</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
