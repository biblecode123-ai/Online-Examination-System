import { useState } from 'react';
import { FileText, Eye, Edit, Trash2, Search, Filter } from 'lucide-react';

export function AdminExams() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Exam Management</h1>
        <p>Overview and oversight of all system examinations</p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search exams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="card-body">
          <p>Exam management coming soon.</p>
          <ul>
            <li>View all exams across departments</li>
            <li>Monitor exam lifecycle status</li>
            <li>Review exam statistics</li>
            <li>Access exam content oversight</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
