import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { BarChart3, CheckCircle2, Clock } from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { EmptyState, ErrorBox, LoadingBlock, Status } from '../../../components/shell';
import { fmtDate, fmtMinutes } from './logic';
import type { AdminRealExam } from '../../../lib/types';

type AttemptFilter = '' | 'ongoing' | 'completed';

const FILTERS: { value: AttemptFilter; label: string }[] = [
  { value: '', label: 'All attempts' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
];

/**
 * Attempts + results of one exam, straight from the staff attempts endpoint
 * (same data the teacher sees). Detailed grading lives in /admin/results.
 */
export function ResultsTab({ exam }: { exam: AdminRealExam }) {
  const [filter, setFilter] = useState<AttemptFilter>('');
  const [page, setPage] = useState(1);

  const attemptsQuery = useQuery({
    queryKey: ['admin-exam-attempts', exam.id, filter, page],
    queryFn: ({ signal }) =>
      adminExamApi.listAttempts(exam.id, { filter: filter || undefined, page }, signal),
    placeholderData: (previous) => previous,
  });

  const rows = attemptsQuery.data?.items ?? [];
  const lastPage = Math.max(1, attemptsQuery.data?.lastPage ?? 1);

  return (
    <div className="card">
      <div className="card-header questions-head">
        <div>
          <h2>Attempts &amp; results</h2>
          <small className="text-muted" data-testid="attempts-summary">
            {(attemptsQuery.data?.total ?? 0)} attempt{(attemptsQuery.data?.total ?? 0) === 1 ? '' : 's'} recorded
          </small>
        </div>
        <div className="button-group">
          <div className="segmented">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`segment ${filter === item.value ? 'segment-active' : ''}`}
                onClick={() => {
                  setFilter(item.value);
                  setPage(1);
                }}
                data-testid={`segment-attempts-${item.value || 'all'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Link href="/admin/results" className="button button-secondary" data-testid="link-all-results">
            <BarChart3 size={15} /> All results
          </Link>
        </div>
      </div>

      <div className="card-body">
        <ErrorBox
          error={attemptsQuery.error}
          onRetry={() => void attemptsQuery.refetch()}
          testId="attempts-error"
        />
        {attemptsQuery.isLoading ? (
          <LoadingBlock label="Loading attempts…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Clock size={26} />}
            title="No attempts yet"
            description="Attempts appear here as soon as assigned students begin the examination."
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table" data-testid="table-attempts">
                <thead>
                  <tr>
                    <th>Attempt</th>
                    <th>Student</th>
                    <th>Status</th>
                    <th className="num">Score</th>
                    <th className="num">Correct</th>
                    <th>Started</th>
                    <th>Submitted</th>
                    <th>Grading</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((attempt, index) => {
                    const status = (attempt.status ?? '').toLowerCase();
                    const ongoing = status === 'ongoing' || status === 'in_progress' || status === 'active';
                    return (
                      <tr key={attempt.id} data-testid={`row-attempt-${attempt.id}`}>
                        <td className="num">#{page > 1 ? (page - 1) * 10 + index + 1 : index + 1}</td>
                        <td>
                          {attempt.student?.name ?? `Student #${attempt.student_id ?? '?'}`}
                          {attempt.student?.email && (
                            <small className="row-subtext">{attempt.student.email}</small>
                          )}
                        </td>
                        <td>
                          <Status tone={ongoing ? 'amber' : status === 'completed' || status === 'submitted' ? 'green' : 'neutral'}>
                            {attempt.status ?? '—'}
                          </Status>
                        </td>
                        <td className="num">
                          {attempt.score != null
                            ? `${attempt.score}${attempt.percentage != null ? ` (${attempt.percentage}%)` : ''}`
                            : '—'}
                        </td>
                        <td className="num">
                          {attempt.correct_answers != null && attempt.total_questions != null
                            ? `${attempt.correct_answers}/${attempt.total_questions}`
                            : '—'}
                        </td>
                        <td>{fmtDate(attempt.started_at)}</td>
                        <td>{fmtDate(attempt.submitted_at ?? attempt.completed_at)}</td>
                        <td>
                          {attempt.is_graded === true ? (
                            <Status tone="green">Graded</Status>
                          ) : attempt.is_graded === false ? (
                            <Status tone="amber">Pending</Status>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lastPage > 1 && (
              <div className="table-pagination">
                <small>
                  Page {page} of {lastPage}
                </small>
                <div className="button-group">
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    disabled={page <= 1 || attemptsQuery.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    disabled={page >= lastPage || attemptsQuery.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <small className="field-hint form-footnote">
          Duration {fmtMinutes(exam.total_time)} · passing {exam.passing_percentage ?? '—'}% ·
          grading and detailed breakdowns are server-computed in{' '}
          <Link href="/admin/results">Results</Link>.
          {exam.ongoing_attempts ? (
            <>
              {' '}
              <CheckCircle2 size={12} /> {exam.ongoing_attempts} attempt(s) currently ongoing.
            </>
          ) : null}
        </small>
      </div>
    </div>
  );
}
