import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherApi } from '../../lib/endpoints';
import { Save, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export function TeacherCreateExam() {
  const [formData, setFormData] = useState({
    exam_title: '',
    category_id: 1,
    department_id: 1,
    duration_minutes: 60,
    passing_percentage: 50,
    instructions: '',
  });
  const queryClient = useQueryClient();

  const createExamMutation = useMutation({
    mutationFn: teacherApi.createRealExam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-exams'] });
      alert('Exam created successfully!');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createExamMutation.mutate(formData);
  };

  return (
    <div className="page">
      <div className="page-header">
        <Link href="/teacher" className="button button-secondary">
          <ArrowLeft size={16} /> Back to Exams
        </Link>
        <h1>Create Real Exam</h1>
        <p>Create a new examination for your department</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Exam Details</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="exam_title">Exam Title</label>
              <input
                id="exam_title"
                type="text"
                value={formData.exam_title}
                onChange={(e) => setFormData({ ...formData, exam_title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="category_id">Category</label>
              <select
                id="category_id"
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
                className="select"
              >
                <option value={1}>Real Exam</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="department_id">Target Department</label>
              <select
                id="department_id"
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: parseInt(e.target.value) })}
                className="select"
              >
                <option value={1}>Computer Science</option>
                <option value={2}>Mathematics</option>
                <option value={3}>Physics</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="duration_minutes">Duration (minutes)</label>
                <input
                  id="duration_minutes"
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                  min={1}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="passing_percentage">Passing Score (%)</label>
                <input
                  id="passing_percentage"
                  type="number"
                  value={formData.passing_percentage}
                  onChange={(e) => setFormData({ ...formData, passing_percentage: parseInt(e.target.value) })}
                  min={0}
                  max={100}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="instructions">Instructions</label>
              <textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                rows={4}
              />
            </div>

            <button type="submit" className="button button-primary" disabled={createExamMutation.isPending}>
              <Save size={16} /> {createExamMutation.isPending ? 'Creating...' : 'Create Exam'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
