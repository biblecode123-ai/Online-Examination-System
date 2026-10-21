import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Search, Square, UserMinus, UserPlus, Users } from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { ConfirmDialog, EmptyState, ErrorBox, LoadingBlock, Status } from '../../../components/shell';
import type { AdminRealExam, ExamAssignmentRow } from '../../../lib/types';

/**
 * Student assignment — department-scoped picker against real backend data.
 * Removal is only offered while the exam has not started (the server refuses
 * unassignment afterwards as well).
 */
export function AssignTab({ exam }: { exam: AdminRealExam }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [removing, setRemoving] = useState<ExamAssignmentRow | null>(null);

  const started = Boolean(exam.started_at && exam.started_at !== 'null');
  const deptId = exam.department_id;

  const assignedQuery = useQuery({
    queryKey: ['admin-exam-assigned', exam.id],
    queryFn: ({ signal }) => adminExamApi.listAssigned(exam.id, 1, signal),
    staleTime: 10_000,
  });

  const deptStudentsQuery = useQuery({
    queryKey: ['admin-exam-dept-students', exam.id, deptId, search],
    queryFn: ({ signal }) =>
      adminExamApi.departmentStudents(
        deptId as number,
        { search: search.trim() || undefined, per_page: 50 },
        signal,
      ),
    enabled: Boolean(deptId),
    staleTime: 15_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-exam-assigned', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exam-detail', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
  };

  const assignMutation = useMutation({
    mutationFn: (ids: number[]) => adminExamApi.assignStudents(exam.id, ids),
    onSuccess: () => {
      setSelected(new Set());
      invalidate();
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (studentId: number) => adminExamApi.unassignStudent(exam.id, studentId),
    onSuccess: () => {
      setRemoving(null);
      invalidate();
    },
  });

  const assigned = assignedQuery.data?.items ?? [];
  const assignedIds = useMemo(
    () => new Set(assigned.map((row) => row.student_id)),
    [assigned],
  );
  const candidates = (deptStudentsQuery.data?.items ?? []).filter(
    (student) => !assignedIds.has(student.id),
  );
  const allSelected = candidates.length > 0 && candidates.every((s) => selected.has(s.id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map((s) => s.id)));
  };

  if (!deptId) {
    return (
      <div className="card">
        <div className="card-body">
          <EmptyState
            icon={<Users size={26} />}
            title="No target department"
            description="Set a target department on the Overview tab before assigning students."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="assign-grid">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Eligible students</h2>
            <small className="text-muted">
              {(deptStudentsQuery.data?.total ?? 0)} in this department
              {assigned.length > 0 && ` · ${assigned.length} already assigned`}
            </small>
          </div>
        </div>
        <div className="card-body">
          <div className="search-bar">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search students…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
              data-testid="input-search-students"
            />
          </div>

          <ErrorBox
            error={deptStudentsQuery.error}
            onRetry={() => void deptStudentsQuery.refetch()}
            testId="dept-students-error"
          />

          {deptStudentsQuery.isLoading ? (
            <LoadingBlock label="Loading students…" />
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={<Users size={24} />}
              title="No students available"
              description={
                assigned.length > 0
                  ? 'Every eligible student is already assigned.'
                  : 'This department has no active students.'
              }
            />
          ) : (
            <>
              <label className="checkbox-line select-all-line">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="checkbox-select-all" />
                Select all eligible ({candidates.length})
              </label>
              <ul className="student-picker" data-testid="list-candidates">
                {candidates.map((student) => (
                  <li key={student.id}>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={selected.has(student.id)}
                        onChange={() => toggle(student.id)}
                        data-testid={`checkbox-student-${student.id}`}
                      />
                      <span>
                        <strong>{student.name}</strong>
                        <small>{student.email}</small>
                      </span>
                    </label>
                    {student.is_active === false && <Status tone="red">Inactive</Status>}
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                <span className="text-muted" data-testid="selection-count">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={selected.size === 0 || assignMutation.isPending}
                  onClick={() => assignMutation.mutate([...selected])}
                  data-testid="button-assign-students"
                >
                  <UserPlus size={15} />
                  {assignMutation.isPending ? 'Assigning…' : `Assign ${selected.size || ''} student${selected.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
          <ErrorBox error={assignMutation.error} testId="assign-error" />
          {assignMutation.isSuccess && (
            <small className="field-hint success-hint" data-testid="assign-success">
              {assignMutation.data.total_assigned} student(s) assigned
              {assignMutation.data.skipped?.length ? `, ${assignMutation.data.skipped.length} skipped` : ''}.
            </small>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Assigned students</h2>
            <small className="text-muted" data-testid="assigned-count">
              {assigned.length} assigned
            </small>
          </div>
        </div>
        <div className="card-body">
          {started && (
            <small className="field-hint">
              The exam has started — assignments are locked (the server enforces this too).
            </small>
          )}
          <ErrorBox
            error={assignedQuery.error}
            onRetry={() => void assignedQuery.refetch()}
            testId="assigned-error"
          />
          {assignedQuery.isLoading ? (
            <LoadingBlock label="Loading assignments…" />
          ) : assigned.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={24} />}
              title="Nobody assigned yet"
              description="Pick eligible students on the left and assign them in bulk."
            />
          ) : (
            <ul className="student-picker" data-testid="list-assigned">
              {assigned.map((row) => (
                <li key={row.id}>
                  <span>
                    <strong>{row.student?.name ?? `Student #${row.student_id}`}</strong>
                    <small>{row.student?.email ?? ''}</small>
                  </span>
                  <Status tone={row.is_active === false ? 'red' : 'green'}>
                    {row.is_active === false ? 'Inactive' : 'Assigned'}
                  </Status>
                  <button
                    type="button"
                    className="icon-button icon-button-danger"
                    title="Remove assignment"
                    disabled={started || unassignMutation.isPending}
                    onClick={() => setRemoving(row)}
                    data-testid={`button-unassign-${row.student_id}`}
                  >
                    <UserMinus size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ErrorBox error={unassignMutation.error} testId="unassign-error" />
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this assignment?"
        message={
          <>
            <strong>{removing?.student?.name ?? `Student #${removing?.student_id}`}</strong> will
            lose access to this exam. You can assign them again before the exam starts.
          </>
        }
        confirmLabel="Remove"
        tone="danger"
        busy={unassignMutation.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && unassignMutation.mutate(removing.student_id)}
        testId="dialog-unassign"
      />
    </div>
  );
}
