import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminExamApi } from '../../lib/endpoints';
import { UserPlus, Edit, Trash2, Power, PowerOff, Search, Upload, Users, Shield, Filter } from 'lucide-react';
import { CreateUserModal } from '../../components/admin/CreateUserModal';
import { BulkImportModal } from '../../components/admin/BulkImportModal';

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', page, roleFilter, statusFilter, departmentFilter, search],
    queryFn: async () => {
      const params = {
        page,
        perPage: 20,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        department_id: departmentFilter ?? undefined,
        active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
      };
      console.log('Fetching users with params:', params);
      return adminApi.listUsers(params);
    },
  });

  const { data: departmentsData, isLoading: departmentsLoading, error: departmentsError } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: async () => {
      try {
        const response = await adminApi.listDepartments({ per_page: 100 });
        console.log('Departments loaded:', response);
        return response;
      } catch (err) {
        console.error('Failed to load departments:', err);
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });

  const departments = departmentsData?.items ?? [];

  const deleteUserMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const activateUserMutation = useMutation({
    mutationFn: adminApi.activateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: adminApi.deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="loading-block">
          <span className="spinner" aria-hidden="true" />
          Loading users...
        </div>
      </div>
    );
  }

  const userList = users?.data ?? [];
  const totalUsers = users?.meta?.total || 0;

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'badge-purple';
      case 'teacher': return 'badge-blue';
      case 'student': return 'badge-green';
      case 'encoder': return 'badge-amber';
      default: return 'badge-gray';
    }
  };

  return (
    <div className="page">
      <div className="admin-users-page">
        <div className="users-header">
          <div>
            <h1>User Management</h1>
            <p>Manage system users, roles, and permissions</p>
          </div>
          <div className="header-actions">
            <button
              className="button button-secondary"
              onClick={() => setShowBulkImportModal(true)}
            >
              <Upload size={16} />
              Bulk Import
            </button>
            <button
              className="button button-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <UserPlus size={16} />
              Add User
            </button>
          </div>
        </div>

        <div className="users-stats">
          <div className="user-stat-card">
            <div className="user-stat-icon">
              <Users size={20} />
            </div>
            <div className="user-stat-content">
              <strong>{totalUsers.toLocaleString()}</strong>
              <small>Total Users</small>
            </div>
          </div>
          <div className="user-stat-card">
            <div className="user-stat-icon user-stat-icon-active">
              <Shield size={20} />
            </div>
            <div className="user-stat-content">
              <strong>{userList.filter(u => u.is_active).length}</strong>
              <small>Active Users</small>
            </div>
          </div>
          <div className="user-stat-card">
            <div className="user-stat-icon user-stat-icon-inactive">
              <PowerOff size={20} />
            </div>
            <div className="user-stat-content">
              <strong>{userList.filter(u => !u.is_active).length}</strong>
              <small>Inactive Users</small>
            </div>
          </div>
        </div>

        <div className="users-table-container">
          <div className="table-toolbar">
            <div className="search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-group">
              <div className="filter-select-wrapper">
                <Filter size={14} className="filter-icon" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Roles</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="admin">Admins</option>
                  <option value="encoder">Encoders</option>
                </select>
              </div>
              <div className="filter-select-wrapper">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="filter-select-wrapper">
                <Filter size={14} className="filter-icon" />
                <select
                  value={departmentFilter ?? ''}
                  onChange={(e) => { setDepartmentFilter(e.target.value ? Number(e.target.value) : null); setPage(1); }}
                  className="filter-select"
                  disabled={departmentsLoading || departmentsError != null}
                  title={departmentsError ? 'Failed to load departments' : undefined}
                >
                  <option value="">All Departments</option>
                  {departmentsError ? (
                    <option disabled>Error loading departments</option>
                  ) : departmentsLoading ? (
                    <option disabled>Loading departments...</option>
                  ) : departments.length === 0 ? (
                    <option disabled>No departments available</option>
                  ) : (
                    departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-table">
                      <div className="empty-state">
                        <Users size={32} />
                        <h3>No users found</h3>
                        <p>Try adjusting your filters or add a new user</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  userList.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">
                            {user.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="user-info">
                            <strong>{user.name}</strong>
                            <small>{user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                          <span className={`badge ${getRoleBadgeClass(user.role_slug ?? '')}`}>
                          {user.role_slug}
                        </span>
                      </td>
                      <td>
                        <span className="text-muted">
                          {user.department_detail?.name || user.department || 'N/A'}
                        </span>
                      </td>
                      <td>
                        {user.is_active ? (
                          <span className="status status-green">Active</span>
                        ) : (
                          <span className="status status-red">Inactive</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="icon-button" title="Edit User">
                            <Edit size={16} />
                          </button>
                          {user.is_active ? (
                            <button
                              className="icon-button"
                              title="Deactivate User"
                              onClick={() => deactivateUserMutation.mutate(user.id)}
                            >
                              <PowerOff size={16} />
                            </button>
                          ) : (
                            <button
                              className="icon-button"
                              title="Activate User"
                              onClick={() => activateUserMutation.mutate(user.id)}
                            >
                              <Power size={16} />
                            </button>
                          )}
                          <button
                            className="icon-button icon-button-danger"
                            title="Delete User"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {users && (users.meta?.last_page ?? 1) > 1 && (
            <div className="table-pagination">
              <button
                className="pagination-button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {page} of {users.meta?.last_page}
              </span>
              <button
                className="pagination-button"
                onClick={() => setPage(p => Math.min(users.meta?.last_page ?? 1, p + 1))}
                disabled={page === (users.meta?.last_page ?? 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <CreateUserModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <BulkImportModal isOpen={showBulkImportModal} onClose={() => setShowBulkImportModal(false)} />
    </div>
  );
}
