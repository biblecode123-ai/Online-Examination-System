import { useState } from 'react';
import { Building2, Edit, Trash2, Plus } from 'lucide-react';

export function AdminDepartments() {
  const [search, setSearch] = useState('');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Department Management</h1>
        <p>Manage university departments and colleges</p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search departments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="button button-primary">
            <Plus size={16} /> Add Department
          </button>
        </div>
        <div className="card-body">
          <p>Department management coming soon.</p>
          <ul>
            <li>Create and edit departments</li>
            <li>Manage department-college relationships</li>
            <li>View department statistics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
