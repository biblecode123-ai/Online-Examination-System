import { useState } from 'react';
import { adminApi } from '../../lib/endpoints';
import { Download, Search, Filter, Calendar } from 'lucide-react';

export function AdminResults() {
  const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleExport = async () => {
    try {
      const blob = await adminApi.exportResults({
        exam_id: examFilter ? parseInt(examFilter) : undefined,
        department_id: deptFilter ? parseInt(deptFilter) : undefined,
        status: statusFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Results Management</h1>
        <p>System-wide examination results and analytics</p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search results..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="button button-primary" onClick={handleExport}>
            <Download size={16} /> Export Results
          </button>
        </div>
        <div className="card-body">
          <div className="filters-row">
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="select"
            >
              <option value="">All Exams</option>
            </select>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="select"
            >
              <option value="">All Departments</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="graded">Graded</option>
              <option value="submitted">Submitted</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="input"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="input"
            />
          </div>
          <p>Results management coming soon.</p>
          <ul>
            <li>View system-wide exam results</li>
            <li>Filter by exam, department, status, date range</li>
            <li>Export results to Excel</li>
            <li>Review grading status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
