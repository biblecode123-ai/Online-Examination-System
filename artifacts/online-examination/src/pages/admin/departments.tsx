import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminExamApi } from '../../lib/endpoints';
import { ApiError } from '../../lib/api';
import {
  Building2,
  Edit,
  Trash2,
  Plus,
  Search,
  BookOpen,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { AdminDepartmentRow } from '../../lib/types';

export function AdminDepartments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<AdminDepartmentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDepartmentRow | null>(null);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [description, setDescription] = useState('');

  // 1. Fetch departments
  const departmentsQuery = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () => adminApi.listDepartments(),
  });

  // 2. Fetch colleges
  const collegesQuery = useQuery({
    queryKey: ['colleges-list'],
    queryFn: () => adminApi.listColleges(),
    staleTime: 5 * 60_000,
  });

  // 3. Fetch exam categories
  const categoriesQuery = useQuery({
    queryKey: ['exam-categories'],
    queryFn: ({ signal }) => adminExamApi.categories(signal),
    staleTime: 5 * 60_000,
  });

  const departments = departmentsQuery.data ?? [];
  const colleges = collegesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.college?.name && d.college.name.toLowerCase().includes(q)),
    );
  }, [departments, search]);

  const openCreateModal = () => {
    setEditingDepartment(null);
    setName('');
    setCollegeId(colleges[0]?.id ?? 0);
    setCategoryId(categories[0]?.id ?? 0);
    setDescription('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (dept: AdminDepartmentRow) => {
    setEditingDepartment(dept);
    setName(dept.name);
    setCollegeId(dept.college_id ?? colleges[0]?.id ?? 0);
    setCategoryId(dept.exam_category_id ?? categories[0]?.id ?? 0);
    setDescription(dept.description ?? '');
    setFormError('');
    setModalOpen(true);
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Department name is required');
      if (!collegeId) throw new Error('Please select a college');
      if (!categoryId) throw new Error('Please select an exam category');

      if (editingDepartment) {
        return adminApi.updateDepartment(editingDepartment.id, {
          name: name.trim(),
          college_id: collegeId,
          exam_category_id: categoryId,
          description: description.trim() || undefined,
        });
      }
      return adminApi.createDepartment({
        name: name.trim(),
        college_id: collegeId,
        exam_category_id: categoryId,
        description: description.trim() || undefined,
      });
    },
    onSuccess: () => {
      setModalOpen(false);
      setSuccessMessage(
        editingDepartment
          ? 'Department updated successfully.'
          : 'Department created successfully.',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: unknown) => {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save department.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteDepartment(id),
    onSuccess: () => {
      setDeleteTarget(null);
      setSuccessMessage('Department deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: unknown) => {
      setSuccessMessage('');
      alert(err instanceof ApiError ? err.message : 'Could not delete department.');
    },
  });

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Department Management</h1>
          <p>Organize academic departments, associate colleges, and manage exam scopes</p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={openCreateModal}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} /> Add Department
        </button>
      </div>

      {successMessage && (
        <div className="notice-banner notice-success" style={{ marginBottom: '1.25rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '280px', padding: '0.5rem 0.75rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search departments or colleges..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', background: 'transparent' }}
            />
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {filteredDepartments.length} department{filteredDepartments.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="card-body">
          {departmentsQuery.isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>Loading departments...</div>
          ) : filteredDepartments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h3>{search ? 'No matching departments' : 'No departments yet'}</h3>
              <p style={{ maxWidth: '400px', margin: '0 auto 1.25rem' }}>
                {search
                  ? 'Try adjusting your search criteria.'
                  : 'Get started by creating your first academic department.'}
              </p>
              {!search && (
                <button type="button" className="button button-primary" onClick={openCreateModal}>
                  <Plus size={16} /> Add Department
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem' }}>Department Name</th>
                    <th style={{ padding: '0.75rem' }}>College</th>
                    <th style={{ padding: '0.75rem' }}>Exams</th>
                    <th style={{ padding: '0.75rem' }}>Questions</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartments.map((dept) => (
                    <tr key={dept.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                      <td style={{ padding: '0.85rem 0.75rem' }}>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{dept.name}</strong>
                        {dept.description && (
                          <small style={{ color: 'var(--text-muted)', display: 'block', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dept.description}
                          </small>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        {dept.college?.name ?? `College #${dept.college_id ?? 'N/A'}`}
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
                          {dept.exams_count ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.9rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <HelpCircle size={14} style={{ color: 'var(--text-muted)' }} />
                          {dept.questions_count ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="icon-button"
                            title="Edit Department"
                            onClick={() => openEditModal(dept)}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button text-danger"
                            title="Delete Department"
                            onClick={() => setDeleteTarget(dept)}
                          >
                            <Trash2 size={16} />
                          </button>
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

      {/* Create / Edit Department Modal */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '500px', width: '90%', background: 'var(--card-bg, #fff)', padding: '1.5rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2>{editingDepartment ? 'Edit Department' : 'Create Department'}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="notice-banner notice-danger" style={{ marginBottom: '1rem' }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError('');
                saveMutation.mutate();
              }}
            >
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Department Name *
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                  placeholder="e.g. Computer Science"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  College *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                  value={collegeId}
                  onChange={(e) => setCollegeId(parseInt(e.target.value, 10))}
                  required
                >
                  <option value={0}>-- Select College --</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Exam Category *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                  value={categoryId}
                  onChange={(e) => setCategoryId(parseInt(e.target.value, 10))}
                  required
                >
                  <option value={0}>-- Select Category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Description (Optional)
                </label>
                <textarea
                  className="textarea"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', minHeight: '80px' }}
                  placeholder="Department focus or notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : editingDepartment ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '440px', width: '90%', background: 'var(--card-bg, #fff)', padding: '1.5rem', borderRadius: '8px' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>Delete Department</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
