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
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import type { AdminDepartmentRow } from '../../lib/types';

export function AdminDepartments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<AdminDepartmentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDepartmentRow | null>(null);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedCollege, setSelectedCollege] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [description, setDescription] = useState('');

  // 1. Fetch departments with pagination
  const departmentsQuery = useQuery({
    queryKey: ['admin-departments', page, search, selectedCollege],
    queryFn: () => adminApi.listDepartments({ page, search: search || undefined }),
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

  const departments = departmentsQuery.data?.items ?? [];
  const lastPage = departmentsQuery.data?.lastPage ?? 1;
  const total = departmentsQuery.data?.total ?? 0;
  const colleges = collegesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  // Reset to page 1 when search or filter changes
  useMemo(() => {
    setPage(1);
  }, [search, selectedCollege]);

  // Filter departments client-side by college if needed
  const filteredDepartments = useMemo(() => {
    if (!selectedCollege) return departments;
    return departments.filter(d => d.college_id === selectedCollege);
  }, [departments, selectedCollege]);

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

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
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

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building2 size={24} style={{ opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{total}</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Total Departments</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BookOpen size={24} style={{ opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                  {!search
                    ? departments.reduce((sum, d) => sum + (d.exams_count ?? 0), 0)
                    : filteredDepartments.reduce((sum, d) => sum + (d.exams_count ?? 0), 0)}
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Total Exams</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <HelpCircle size={24} style={{ opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                  {!search
                    ? departments.reduce((sum, d) => sum + (d.questions_count ?? 0), 0)
                    : filteredDepartments.reduce((sum, d) => sum + (d.questions_count ?? 0), 0)}
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Total Questions</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building2 size={24} style={{ opacity: 0.9 }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{colleges.length}</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Colleges</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            {colleges.length > 0 && (
              <select
                value={selectedCollege ?? ''}
                onChange={(e) => setSelectedCollege(e.target.value ? parseInt(e.target.value, 10) : null)}
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px', background: 'white', cursor: 'pointer' }}
              >
                <option value="">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="icon-button"
              onClick={() => departmentsQuery.refetch()}
              title="Refresh"
              disabled={departmentsQuery.isLoading}
            >
              <RefreshCw size={18} className={departmentsQuery.isLoading ? 'spin' : ''} />
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {filteredDepartments.length} department{filteredDepartments.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="card-body">
          {departmentsQuery.isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <RefreshCw size={32} className="spin" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)' }}>Loading departments...</p>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Building2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{search || selectedCollege ? 'No matching departments' : 'No departments yet'}</h3>
              <p style={{ maxWidth: '400px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                {search || selectedCollege
                  ? 'Try adjusting your search criteria or filters.'
                  : 'Get started by creating your first academic department to organize your institution.'}
              </p>
              {!search && !selectedCollege && (
                <button type="button" className="button button-primary" onClick={openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={16} /> Add Department
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color, #e2e8f0)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '1rem 0.75rem', fontWeight: 600 }}>Department Name</th>
                      <th style={{ padding: '1rem 0.75rem', fontWeight: 600 }}>College</th>
                      <th style={{ padding: '1rem 0.75rem', fontWeight: 600 }}>Exams</th>
                      <th style={{ padding: '1rem 0.75rem', fontWeight: 600 }}>Questions</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepartments.map((dept, index) => (
                      <tr
                        key={dept.id}
                        style={{
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg, #f8fafc)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '1rem 0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              flexShrink: 0,
                            }}>
                              {dept.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-primary)' }}>{dept.name}</strong>
                              {dept.description && (
                                <small style={{ color: 'var(--text-muted)', display: 'block', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.25rem' }}>
                                  {dept.description}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            background: 'var(--badge-bg, #f1f5f9)',
                            borderRadius: '9999px',
                            fontSize: '0.85rem',
                          }}>
                            <Building2 size={14} />
                            {colleges.find(c => c.id === dept.college_id)?.name ?? `College #${dept.college_id ?? 'N/A'}`}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.9rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            background: 'rgba(79, 172, 254, 0.1)',
                            color: '#4facfe',
                            borderRadius: '6px',
                            fontWeight: 500,
                          }}>
                            <BookOpen size={14} />
                            {dept.exams_count ?? 0}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', fontSize: '0.9rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            background: 'rgba(67, 233, 123, 0.1)',
                            color: '#43e97b',
                            borderRadius: '6px',
                            fontWeight: 500,
                          }}>
                            <HelpCircle size={14} />
                            {dept.questions_count ?? 0}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="icon-button"
                              title="Edit Department"
                              onClick={() => openEditModal(dept)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color, #e2e8f0)',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--hover-bg, #f8fafc)';
                                e.currentTarget.style.borderColor = 'var(--primary-color, #667eea)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'white';
                                e.currentTarget.style.borderColor = 'var(--border-color, #e2e8f0)';
                              }}
                            >
                              <Edit size={16} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                            <button
                              type="button"
                              className="icon-button text-danger"
                              title="Delete Department"
                              onClick={() => setDeleteTarget(dept)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color, #e2e8f0)',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                e.currentTarget.style.borderColor = '#ef4444';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'white';
                                e.currentTarget.style.borderColor = 'var(--border-color, #e2e8f0)';
                              }}
                            >
                              <Trash2 size={16} style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {lastPage > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, total)} of {total} departments
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        background: 'white',
                        cursor: page === 1 ? 'not-allowed' : 'pointer',
                        opacity: page === 1 ? 0.5 : 1,
                      }}
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
                        const pageNum = i + 1;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => handlePageChange(pageNum)}
                            style={{
                              padding: '0.5rem 0.75rem',
                              borderRadius: '6px',
                              border: page === pageNum ? 'none' : '1px solid var(--border-color, #e2e8f0)',
                              background: page === pageNum ? 'var(--primary-color, #667eea)' : 'white',
                              color: page === pageNum ? 'white' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              minWidth: '40px',
                              fontWeight: page === pageNum ? 600 : 400,
                            }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === lastPage}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        background: 'white',
                        cursor: page === lastPage ? 'not-allowed' : 'pointer',
                        opacity: page === lastPage ? 0.5 : 1,
                      }}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
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
