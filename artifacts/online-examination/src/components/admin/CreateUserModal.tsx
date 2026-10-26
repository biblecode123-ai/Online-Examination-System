import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminExamApi } from '../../lib/endpoints';
import { X, UserPlus, Loader2 } from 'lucide-react';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    department_id: '',
    telegram_username: '',
  });
  const queryClient = useQueryClient();

  const { data: departments = [] } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () => adminExamApi.departments(),
    staleTime: 5 * 60_000,
  });

  const createUserMutation = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'student',
        department_id: '',
        telegram_username: '',
      });
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      ...formData,
      department_id: formData.department_id ? Number(formData.department_id) : undefined,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="create-user-modal">
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon">
              <UserPlus size={20} />
            </div>
            <h2>Create New User</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
                required
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
              />
            </div>

            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
                <option value="encoder">Encoder</option>
              </select>
            </div>

            <div className="form-group">
              <label>Department</label>
              <select
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
              >
                <option value="">None</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Telegram Username</label>
              <input
                type="text"
                value={formData.telegram_username}
                onChange={(e) => setFormData({ ...formData, telegram_username: e.target.value })}
                placeholder="@username (optional)"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Create User
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
