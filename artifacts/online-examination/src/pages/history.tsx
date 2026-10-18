import { useMemo, useState } from 'react';
import { ChevronRight, FileCheck2, History as HistoryIcon, Search } from 'lucide-react';
import { Link } from 'wouter';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../components/shell';
import { useAuth } from '../lib/auth';
import { dateLabel } from '../lib/format';
import { isFinishedAttempt } from '../lib/examState';
import { useExams, useMyAttempts } from '../lib/queries';

export function HistoryPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'result' | 'pending'>('all');

  const attemptsQuery = useMyAttempts();
  const examsQuery = useExams(1, '', user?.department_id ?? null);

  const exams = examsQuery.data?.data ?? [];
  const titleFor = (examId: number) =>
    exams.find((exam) => exam.id === examId)?.exam_title ?? `Examination #${examId}`;

  const rows = useMemo(() => {
    const attempts = attemptsQuery.data ?? [];
    return attempts
      .filter(isFinishedAttempt)
      .map((attempt) => ({
        attempt,
        title: attempt.exam?.exam_title ?? titleFor(attempt.exam_id),
        released: typeof attempt.score === 'number',
      }))
      .filter((row) => {
        const matchesQuery = row.title.toLowerCase().includes(query.trim().toLowerCase());
        const matchesFilter =
          filter === 'all' ||
          (filter === 'result' ? row.released : !row.released);
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => (a.attempt.id > b.attempt.id ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptsQuery.data, exams, query, filter]);

  return (
    <>
      <PageTitle
        eyebrow="YOUR RECORD"
        title="Attempt history"
        detail="Submitted examinations recorded by the university server."
      />

      <div className="history-controls">
        <label className="search-box">
          <span className="sr-only">Search attempt history</span>
          <input
            data-testid="input-history-search"
            type="search"
            placeholder="Search assessments…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Search size={15} />
        </label>
        <label className="filter-select">
          <span className="sr-only">Filter by result status</span>
          <select
            data-testid="select-history-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">All attempts</option>
            <option value="result">Score available</option>
            <option value="pending">Awaiting score</option>
          </select>
        </label>
      </div>

      {attemptsQuery.isPending && <LoadingBlock label="Loading your attempts…" />}
      {attemptsQuery.isError && (
        <ErrorBox
          error={attemptsQuery.error}
          onRetry={() => void attemptsQuery.refetch()}
          retryLabel="Reload"
        />
      )}

      {!attemptsQuery.isPending && !attemptsQuery.isError && (
        <section className="panel history-panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">SUBMISSION RECORDS</div>
              <h2>Previous attempts</h2>
            </div>
            <span className="prototype-tag">{rows.length} RECORDS</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={22} />}
              title="No matching attempts"
              description="Submitted attempts will appear here once the server records them."
            />
          ) : (
            <div className="history-list">
              {rows.map(({ attempt, title, released }) => (
                <div className="history-item" key={attempt.id} data-testid={`history-item-${attempt.id}`}>
                  <div className="history-symbol">
                    <FileCheck2 size={18} />
                  </div>
                  <div className="history-main">
                    <strong>{title}</strong>
                    <span>
                      Submitted{' '}
                      {dateLabel(attempt.completed_at ?? attempt.end_time ?? attempt.start_time)}
                    </span>
                    <small>Attempt #{attempt.id}</small>
                  </div>
                  <div className="history-outcome">
                    {released ? (
                      <>
                        <strong>Score {attempt.score}</strong>
                        <Status tone={attempt.passed ? 'green' : 'red'}>
                          {attempt.passed ? 'Passed' : 'Not passed'}
                        </Status>
                      </>
                    ) : (
                      <Status tone="amber">Awaiting score</Status>
                    )}
                  </div>
                  <Link
                    href={`/results/${attempt.id}`}
                    aria-label={`View result for ${title}`}
                    className="row-arrow"
                    data-testid={`link-history-result-${attempt.id}`}
                  >
                    <ChevronRight size={18} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
