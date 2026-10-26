import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminExamApi, teacherApi } from '../../lib/endpoints';
import { ApiError } from '../../lib/api';
import {
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import type { ExamAttemptRow, AdminQuestionRow } from '../../lib/types';

// ── Types ───────────────────────────────────────────────────────────────────

interface GradeEntry {
  question_id: number;
  is_correct: boolean;
  points: number;
  grading_notes: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ESSAY_TYPES = new Set(['essay', 'long_answer', 'short_answer', 'open_ended']);
const MATCHING_TYPES = new Set(['matching', 'match']);

function needsManualGrading(q: AdminQuestionRow): boolean {
  return ESSAY_TYPES.has(q.question_type) || MATCHING_TYPES.has(q.question_type);
}

function statusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case 'graded': return 'badge badge-green';
    case 'completed': return 'badge badge-blue';
    case 'submitted': return 'badge badge-yellow';
    case 'active': return 'badge badge-orange';
    default: return 'badge badge-gray';
  }
}

// ── GradingModal: grade one attempt ─────────────────────────────────────────

function GradingModal({
  examId,
  attempt,
  questions,
  onClose,
}: {
  examId: number;
  attempt: ExamAttemptRow;
  questions: AdminQuestionRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const essayQuestions = questions.filter(needsManualGrading);

  const [grades, setGrades] = useState<Record<number, GradeEntry>>(() => {
    const init: Record<number, GradeEntry> = {};
    for (const q of essayQuestions) {
      init[q.id] = {
        question_id: q.id,
        is_correct: false,
        points: 0,
        grading_notes: '',
      };
    }
    return init;
  });

  const [globalError, setGlobalError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      teacherApi.gradeAttempt(examId, attempt.id, Object.values(grades)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-attempts', examId] });
      onClose();
    },
    onError: (err: unknown) => {
      setGlobalError(
        err instanceof ApiError
          ? err.message
          : 'Grading failed. Please try again.'
      );
    },
  });

  if (essayQuestions.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>No Manual Grading Required</h3>
            <button className="button button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="modal-body">
            <p>This attempt has no essay or matching questions requiring manual grading.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '640px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>
            Grade Attempt #{attempt.id} — {attempt.student?.name ?? 'Unknown'}
          </h3>
          <button className="button button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {globalError && (
          <div style={{ color: 'red', marginBottom: '12px', padding: '8px', background: '#fff0f0', borderRadius: '4px' }}>
            {globalError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {essayQuestions.map((q) => {
            const entry = grades[q.id];
            const maxPts = q.points ?? 1;
            return (
              <div
                key={q.id}
                style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '16px' }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      background: '#e5e7eb',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      marginRight: '8px',
                    }}
                  >
                    {q.question_type.toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 500 }}>{q.question_text}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                      Points Awarded (max {maxPts}) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxPts}
                      value={entry.points}
                      onChange={(e) => {
                        const pts = Math.min(maxPts, Math.max(0, parseInt(e.target.value) || 0));
                        setGrades((prev) => ({
                          ...prev,
                          [q.id]: { ...prev[q.id], points: pts, is_correct: pts > 0 },
                        }));
                      }}
                      style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                      Mark as Correct
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={entry.is_correct}
                        onChange={(e) =>
                          setGrades((prev) => ({
                            ...prev,
                            [q.id]: { ...prev[q.id], is_correct: e.target.checked },
                          }))
                        }
                      />
                      <span style={{ fontSize: '13px' }}>Correct</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                    Grading Notes (optional)
                  </label>
                  <textarea
                    value={entry.grading_notes}
                    onChange={(e) =>
                      setGrades((prev) => ({
                        ...prev,
                        [q.id]: { ...prev[q.id], grading_notes: e.target.value },
                      }))
                    }
                    rows={2}
                    maxLength={1000}
                    style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="button button-secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            className="button button-primary"
            onClick={() => {
              setGlobalError('');
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle size={16} /> Submit Grades
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeacherGrading() {
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');
  const [gradingAttempt, setGradingAttempt] = useState<ExamAttemptRow | null>(null);

  // ── Fetch exam list ──
  const examsQuery = useQuery({
    queryKey: ['admin-exams'],
    queryFn: () => adminExamApi.listExams(),
    staleTime: 2 * 60_000,
  });

  // ── Fetch attempts for the selected exam ──
  const attemptsQuery = useQuery({
    queryKey: ['exam-attempts', selectedExamId, filter],
    queryFn: ({ signal }) =>
      adminExamApi.listAttempts(selectedExamId!, { filter }, signal),
    enabled: !!selectedExamId,
    staleTime: 30_000,
  });

  // ── Fetch questions for the selected exam (for grading modal) ──
  const questionsQuery = useQuery({
    queryKey: ['admin-exam-questions', selectedExamId],
    queryFn: ({ signal }) => adminExamApi.examQuestions(selectedExamId!, signal),
    enabled: !!selectedExamId,
    staleTime: 5 * 60_000,
  });

  const handleExport = async () => {
    if (!selectedExamId) return;
    try {
      const blob = await teacherApi.exportResults(selectedExamId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam_${selectedExamId}_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const attempts = attemptsQuery.data?.items ?? [];
  const questions = questionsQuery.data?.items ?? [];
  const hasEssayQuestions = questions.some(needsManualGrading);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Essay Grading</h1>
        <p>Grade essay and matching questions for your exams</p>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedExamId ?? ''}
            onChange={(e) => {
              setSelectedExamId(e.target.value ? parseInt(e.target.value) : null);
            }}
            className="select"
            style={{ minWidth: '240px' }}
          >
            <option value="">Select an exam…</option>
            {examsQuery.isLoading && <option disabled>Loading exams…</option>}
            {(examsQuery.data?.items ?? []).map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.exam_title}
              </option>
            ))}
          </select>

          {selectedExamId && (
            <>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="select"
              >
                <option value="all">All Attempts</option>
                <option value="completed">Completed</option>
                <option value="ongoing">Ongoing</option>
              </select>

              <button className="button button-secondary" onClick={handleExport}>
                <Download size={16} /> Export Results
              </button>
            </>
          )}
        </div>

        <div className="card-body">
          {!selectedExamId ? (
            <p style={{ color: '#6b7280' }}>
              Select an exam to view attempts and grade essay questions.
            </p>
          ) : attemptsQuery.isLoading ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '20px 0' }}>
              <Loader2 size={18} className="animate-spin" />
              <span>Loading attempts…</span>
            </div>
          ) : attemptsQuery.isError ? (
            <p style={{ color: 'red' }}>
              Could not load attempts:{' '}
              {attemptsQuery.error instanceof ApiError
                ? attemptsQuery.error.message
                : 'Unknown error'}
            </p>
          ) : attempts.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No attempts found for this exam.</p>
          ) : (
            <>
              {!hasEssayQuestions && (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '10px 14px',
                    background: '#fefce8',
                    border: '1px solid #fde047',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#854d0e',
                  }}
                >
                  <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  This exam has no essay or matching questions. All questions are auto-graded.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {attempts.map((attempt) => {
                  const status = attempt.status ?? '';
                  const canGrade =
                    hasEssayQuestions &&
                    ['completed', 'submitted', 'graded'].includes(status);

                  return (
                    <div
                      key={attempt.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                          <strong>#{attempt.id}</strong>
                          <span className={statusBadgeClass(status)}>{status}</span>
                          {attempt.is_graded && (
                            <span className="badge badge-green">
                              <CheckCircle size={10} /> Graded
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#4b5563', flexWrap: 'wrap' }}>
                          <span>
                            <strong>Student:</strong>{' '}
                            {attempt.student?.name ?? 'Unknown'}
                          </span>
                          <span>
                            <strong>Score:</strong>{' '}
                            {attempt.score != null ? `${attempt.score}%` : '—'}
                          </span>
                          <span>
                            <strong>Correct:</strong>{' '}
                            {attempt.correct_answers != null && attempt.total_questions != null
                              ? `${attempt.correct_answers} / ${attempt.total_questions}`
                              : '—'}
                          </span>
                          {attempt.submitted_at && (
                            <span>
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {new Date(attempt.submitted_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        className={canGrade ? 'button button-primary' : 'button button-secondary'}
                        disabled={!canGrade}
                        onClick={() => setGradingAttempt(attempt)}
                        title={!canGrade ? 'Only completed/submitted attempts with essay questions can be graded' : ''}
                      >
                        <FileText size={16} />
                        {attempt.is_graded ? 'Re-grade' : 'Grade'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {attemptsQuery.data && attemptsQuery.data.total > attempts.length && (
                <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '12px' }}>
                  Showing {attempts.length} of {attemptsQuery.data.total} attempts.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {gradingAttempt && selectedExamId && (
        <GradingModal
          examId={selectedExamId}
          attempt={gradingAttempt}
          questions={questions}
          onClose={() => setGradingAttempt(null)}
        />
      )}
    </div>
  );
}
