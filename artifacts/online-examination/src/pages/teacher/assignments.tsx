import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminExamApi } from '../../lib/endpoints';
import { ApiError } from '../../lib/api';
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  CheckCircle2,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import type { AdminRealExam, DepartmentStudent, ExamAssignmentRow } from '../../lib/types';

export function TeacherAssignments() {
  const queryClient = useQueryClient();
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [overrideDeptId, setOverrideDeptId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Fetch teacher real exams
  const examsQuery = useQuery({
    queryKey: ['admin-exams'],
    queryFn: ({ signal }) => adminExamApi.listExams(signal),
  });

  // 2. Fetch departments
  const deptsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });

  const exams = examsQuery.data?.items ?? [];
  const selectedExam: AdminRealExam | undefined = useMemo(
    () => exams.find((e) => e.id === selectedExamId),
    [exams, selectedExamId],
  );

  // Active department is either explicitly selected or inherited from selected exam
  const activeDeptId = overrideDeptId ?? selectedExam?.department_id ?? null;

  // 3. Fetch already assigned students for selected exam
  const assignedQuery = useQuery({
    queryKey: ['admin-exam-assigned', selectedExamId],
    queryFn: ({ signal }) => (selectedExamId ? adminExamApi.listAssigned(selectedExamId, 1, signal) : Promise.resolve({ items: [], lastPage: 1, total: 0 })),
    enabled: Boolean(selectedExamId),
  });

  // 4. Fetch department candidates
  const deptStudentsQuery = useQuery({
    queryKey: ['department-candidates', activeDeptId, search],
    queryFn: ({ signal }) =>
      activeDeptId
        ? adminExamApi.departmentStudents(activeDeptId, { search: search.trim() || undefined, per_page: 100 }, signal)
        : Promise.resolve({ items: [], lastPage: 1, total: 0 }),
    enabled: Boolean(activeDeptId),
  });

  const assignedList: ExamAssignmentRow[] = assignedQuery.data?.items ?? [];
  const assignedSet = useMemo(
    () => new Set(assignedList.map((a) => a.student_id)),
    [assignedList],
  );

  // Candidates not already assigned
  const candidateStudents: DepartmentStudent[] = useMemo(
    () => (deptStudentsQuery.data?.items ?? []).filter((s) => !assignedSet.has(s.id)),
    [deptStudentsQuery.data?.items, assignedSet],
  );

  const isExamStarted = Boolean(selectedExam?.started_at && selectedExam.started_at !== 'null');

  // Mutations
  const assignMutation = useMutation({
    mutationFn: (ids: number[]) => {
      if (!selectedExamId) throw new Error('No exam selected');
      return adminExamApi.assignStudents(selectedExamId, ids);
    },
    onSuccess: (res) => {
      setSelectedStudentIds(new Set());
      setActionMessage({
        type: 'success',
        text: `Assigned ${res.assigned.length} student(s) successfully.${res.skipped?.length ? ` (${res.skipped.length} skipped)` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-exam-assigned', selectedExamId] });
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to assign students.';
      setActionMessage({ type: 'error', text: msg });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (studentId: number) => {
      if (!selectedExamId) throw new Error('No exam selected');
      return adminExamApi.unassignStudent(selectedExamId, studentId);
    },
    onSuccess: () => {
      setActionMessage({ type: 'success', text: 'Student unassigned successfully.' });
      queryClient.invalidateQueries({ queryKey: ['admin-exam-assigned', selectedExamId] });
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to unassign student.';
      setActionMessage({ type: 'error', text: msg });
    },
  });

  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allCandidatesSelected =
    candidateStudents.length > 0 && candidateStudents.every((s) => selectedStudentIds.has(s.id));

  const toggleSelectAll = () => {
    if (allCandidatesSelected) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(candidateStudents.map((s) => s.id)));
    }
  };

  const handleAssignSelected = () => {
    if (selectedStudentIds.size === 0) return;
    setActionMessage(null);
    assignMutation.mutate(Array.from(selectedStudentIds));
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Student Assignments</h1>
        <p>Assign eligible students from target departments to your Real Exams</p>
      </div>

      {actionMessage && (
        <div className={`notice-banner ${actionMessage.type === 'error' ? 'notice-danger' : 'notice-success'}`} style={{ marginBottom: '1.25rem' }}>
          {actionMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Exam Selector Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2>Select Target Examination</h2>
        </div>
        <div className="card-body">
          <div className="form-row" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <label htmlFor="exam-select" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                Real Exam
              </label>
              <select
                id="exam-select"
                value={selectedExamId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  setSelectedExamId(val);
                  setOverrideDeptId(null);
                  setSelectedStudentIds(new Set());
                  setActionMessage(null);
                }}
                className="select"
                style={{ width: '100%' }}
              >
                <option value="">-- Choose an Examination --</option>
                {exams.map((exam) => {
                  const deptName = deptsQuery.data?.find((d) => d.id === exam.department_id)?.name ?? `Dept #${exam.department_id}`;
                  return (
                    <option key={exam.id} value={exam.id}>
                      {exam.exam_title} ({deptName}) - {exam.lifecycle_status ?? 'draft'}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedExam && (
              <div style={{ minWidth: '220px' }}>
                <label htmlFor="dept-select" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Target Department
                </label>
                <select
                  id="dept-select"
                  value={activeDeptId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setOverrideDeptId(val);
                    setSelectedStudentIds(new Set());
                  }}
                  className="select"
                  style={{ width: '100%' }}
                >
                  <option value="">-- All / Select Department --</option>
                  {(deptsQuery.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedExam && isExamStarted && (
            <div className="notice-banner notice-warning" style={{ marginTop: '1rem' }}>
              <ShieldAlert size={18} />
              <span>
                <strong>Exam has already started.</strong> Assignments are locked: student removal is prevented to maintain exam integrity.
              </span>
            </div>
          )}
        </div>
      </div>

      {selectedExam ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {/* Left Column: Eligible Candidates */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Eligible Candidates</h2>
                <small style={{ color: 'var(--text-muted)' }}>
                  {candidateStudents.length} available to assign
                </small>
              </div>
              {candidateStudents.length > 0 && (
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  onClick={toggleSelectAll}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {allCandidatesSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  {allCandidatesSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            <div className="card-body">
              {/* Search filter */}
              <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0.75rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px' }}>
                <Search size={18} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter candidates by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', width: '100%', background: 'transparent' }}
                />
              </div>

              {deptStudentsQuery.isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading eligible students...</div>
              ) : candidateStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  {search ? 'No matching candidates found.' : 'All students in this department are already assigned or none exist.'}
                </div>
              ) : (
                <div className="student-list" style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {candidateStudents.map((student) => {
                    const isChecked = selectedStudentIds.has(student.id);
                    return (
                      <div
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '6px',
                          border: isChecked ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--border-color, #e2e8f0)',
                          background: isChecked ? 'var(--primary-subtle, #eff6ff)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Controlled by row click
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: 'block', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {student.name}
                          </strong>
                          <small style={{ color: 'var(--text-muted)' }}>{student.email}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={selectedStudentIds.size === 0 || assignMutation.isPending}
                  onClick={handleAssignSelected}
                  style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                >
                  <UserPlus size={16} />
                  {assignMutation.isPending
                    ? 'Assigning...'
                    : `Assign ${selectedStudentIds.size} Selected Student${selectedStudentIds.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Currently Assigned */}
          <div className="card">
            <div className="card-header">
              <h2>Currently Assigned Students</h2>
              <small style={{ color: 'var(--text-muted)' }}>
                {assignedList.length} student{assignedList.length === 1 ? '' : 's'} assigned to this exam
              </small>
            </div>

            <div className="card-body">
              {assignedQuery.isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading assigned students...</div>
              ) : assignedList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No students currently assigned to this examination.
                </div>
              ) : (
                <div className="assigned-list" style={{ maxHeight: '490px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {assignedList.map((row) => (
                    <div
                      key={row.id ?? row.student_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.student?.name ?? `Student #${row.student_id}`}
                        </strong>
                        <small style={{ color: 'var(--text-muted)' }}>{row.student?.email ?? ''}</small>
                      </div>

                      <button
                        type="button"
                        className="icon-button text-danger"
                        disabled={isExamStarted || unassignMutation.isPending}
                        title={isExamStarted ? 'Cannot remove: exam has started' : 'Unassign student'}
                        onClick={() => {
                          const studentName = row.student?.name || `Student #${row.student_id}`;
                          if (window.confirm(`Unassign ${studentName} from this examination?`)) {
                            unassignMutation.mutate(row.student_id);
                          }
                        }}
                        style={{ opacity: isExamStarted ? 0.4 : 1, cursor: isExamStarted ? 'not-allowed' : 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
            <Users size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3>No Examination Selected</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
              Please select a Real Exam from the dropdown above to view assigned students and add eligible candidates from the target department.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
