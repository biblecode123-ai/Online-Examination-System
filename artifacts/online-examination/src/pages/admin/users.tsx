import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../lib/endpoints';
import { UserPlus, Edit, Trash2, Power, PowerOff, Search } from 'lucide-react';

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', page, roleFilter],
    queryFn: () => adminApi.listUsers({ page, perPage: 20, role: roleFilter || undefined }),
  });

  const createUserMutation = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

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

  return (
    <div className="page">
      <div className="page-header">
        <h1>User Management</h1>
        <p>Manage system users and their roles</p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="select"
          >
            <option value="">All Roles</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Admins</option>
            <option value="encoder">Encoders</option>
          </select>
          <button className="button button-primary">
            <UserPlus size={16} /> Add User
          </button>
        </div>
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userList.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="badge badge-blue">{user.role_slug}</span>
                  </td>
                  <td>{user.department_detail?.name || user.department || 'N/A'}</td>
                  <td>
                    {user.is_active ? (
                      <span className="badge badge-green">Active</span>
                    ) : (
                      <span className="badge badge-red">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div className="button-group">
                      <button className="icon-button" title="Edit">
                        <Edit size={16} />
                      </button>
                      {user.is_active ? (
                        <button
                          className="icon-button"
                          title="Deactivate"
                          onClick={() => deactivateUserMutation.mutate(user.id)}
                        >
                          <PowerOff size={16} />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          title="Activate"
                          onClick={() => activateUserMutation.mutate(user.id)}
                        >
                          <Power size={16} />
                        </button>
                      )}
                      <button
                        className="icon-button text-danger"
                        title="Delete"
                        onClick={() => deleteUserMutation.mutate(user.id)}
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
      </div>
    </div>
  );
}
