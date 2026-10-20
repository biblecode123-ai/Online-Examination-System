import { ChevronLeft, ChevronRight, FileCheck2, History } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { EmptyState, ErrorBox, LoadingBlock, Metric, PageTitle, Status } from '../components/shell';
import { dateLabel } from '../lib/format';
import { isFinishedAttempt } from '../lib/examState';
import { useExams, useMyAttempts, useResult } from '../lib/queries';
import { useAuth } from '../lib/auth';

function readVisibility(attemptId: string): string | null {
  try {
    return window.sessionStorage.getItem(`ofijan.exam.result-visibility.${attemptId}`);
  } catch {
    return null;
  }
}

export function ResultsPage() {
  const { user } = useAuth();
  const attemptsQuery = useMyAttempts();
  const examsQuery = useExams(1, '', user?.department_id ?? null);

  const attempts = attemptsQuery.data ?? [];
  const exams = examsQuery.data?.data ?? [];
  const titleFor = (examId: number) =>
    exams.find((exam) => exam.id === examId)?.exam_title ?? `Examination #${examId}`;

  const finished = attempts.filter(isFinishedAttempt);
  const pending = attempts.filter((attempt) => !isFinishedAttempt(attempt));
  const releasedCount = finished.filter((attempt) => typeof attempt.score === 'number').length;

  return (
    <>
      <PageTitle
        eyebrow="ACADEMIC OUTCOMES"
        title="Results"
        detail="Scores and outcomes confirmed by the examination server."
      />

      {attemptsQuery.isPending && <LoadingBlock label="Loading your results…" />}
      {attemptsQuery.isError && (
        <ErrorBox
          error={attemptsQuery.error}
          onRetry={() => void attemptsQuery.refetch()}
          retryLabel="Reload"
        />
      )}

      {!attemptsQuery.isPending && !attemptsQuery.isError && (
        <>
          <div className="results-summary">
            <div>
              <span className="summary-icon">
                <FileCheck2 size={19} />
              </span>
              <span>
                <small>SCORE AVAILABLE</small>
                <strong data-testid="released-count">{releasedCount}</strong>
              </span>
            </div>
            <div>
              <span className="summary-icon summary-pending">
                <History size={19} />
              </span>
              <span>
                <small>AWAITING SCORE</small>
                <strong data-testid="pending-count">{finished.length - releasedCount + pending.length}</strong>
              </span>
            </div>
          </div>

          <section className="panel results-panel">
            <div className="section-head">
              <div>
                <div className="eyebrow">YOUR RESULTS</div>
                <h2>Assessment outcomes</h2>
              </div>
            </div>

            {finished.length === 0 ? (
              <EmptyState
                icon={<FileCheck2 size={23} />}
                title="No results yet"
                description="Submitted examinations will appear here once the server records them."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ASSESSMENT</th>
                      <th>SUBMITTED</th>
                      <th>OUTCOME</th>
                      <th>STATUS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {finished.map((attempt) => {
                      const released = typeof attempt.score === 'number';
                      return (
                        <tr key={attempt.id} data-testid={`row-result-${attempt.id}`}>
                          <td>
                            <strong>{attempt.exam?.exam_title ?? titleFor(attempt.exam_id)}</strong>
                            <small>Attempt #{attempt.id}</small>
                          </td>
                          <td>{dateLabel(attempt.completed_at ?? attempt.end_time ?? attempt.start_time)}</td>
                          <td>
                            {released ? (
                              <>
                                <strong data-testid={`score-${attempt.id}`}>{attempt.score}</strong>
                                <small>{attempt.passed ? 'Pass' : 'Below pass mark'}</small>
                              </>
                            ) : (
                              <span className="muted">Not yet published</span>
                            )}
                          </td>
                          <td>
                            <Status tone={released ? (attempt.passed ? 'green' : 'red') : 'amber'}>
                              {released ? (attempt.passed ? 'Passed' : 'Not passed') : 'Pending'}
                            </Status>
                          </td>
                          <td>
                            <Link
                              href={`/results/${attempt.id}`}
                              className="text-link"
                              data-testid={`link-result-${attempt.id}`}
                            >
                              View <ChevronRight size={14} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="bottom-note">
            <History size={17} />
            <span>
              Scores are calculated by the server. Attempts still open or awaiting release are
              listed as pending.
            </span>
          </div>
        </>
      )}
    </>
  );
}

export function ResultDetails() {
  const params = useParams();
  const attemptId = params.attemptId ?? '';
  const { user } = useAuth();
  const attemptsQuery = useMyAttempts();
  const examsQuery = useExams(1, '', user?.department_id ?? null);
  const resultQuery = useResult(attemptId);

  const attempts = attemptsQuery.data ?? [];
  const attempt = attempts.find((item) => String(item.id) === attemptId);
  const examDetail = examsQuery.data?.data.find((item) => item.id === attempt?.exam_id);

  if (resultQuery.isPending) {
    return <LoadingBlock label="Loading your result…" />;
  }

  if (resultQuery.isError || !resultQuery.data) {
    const notCompleted =
      resultQuery.error instanceof Error &&
      /not yet completed/i.test(resultQuery.error.message);
    return (
      <>
        <div className="back-row">
          <Link href="/results" className="text-link" data-testid="link-back-results">
            <ChevronLeft size={16} /> Results
          </Link>
        </div>
        <PageTitle
          eyebrow="RESULT DETAILS"
          title={notCompleted ? 'Result not available yet' : 'Result unavailable'}
          detail={
            notCompleted
              ? 'This attempt has not been finalized by the server, so no result exists yet.'
              : 'This result could not be loaded.'
          }
        />
        {notCompleted ? (
          <Link href="/history" className="button button-secondary">
            Attempt history
          </Link>
        ) : (
          <ErrorBox error={resultQuery.error} onRetry={() => void resultQuery.refetch()} />
        )}
      </>
    );
  }

  const { attempt: summary, performance, question_review: review } = resultQuery.data;
  const visibility = readVisibility(attemptId);
  const reviewAllowed = visibility !== 'score_only';

  return (
    <>
      <div className="back-row">
        <Link href="/results" className="text-link" data-testid="link-back-results">
          <ChevronLeft size={16} /> Results
        </Link>
        <Status tone={performance.passed ? 'green' : 'red'} testId="result-status">
          {performance.passed ? 'Passed' : 'Not passed'}
        </Status>
      </div>

      <PageTitle
        eyebrow={examDetail?.course?.name ?? examDetail?.category?.name ?? undefined}
        title={summary.exam_title}
        detail="Official result recorded by the examination server."
      />

      <section className="result-detail-layout">
        <div className="panel score-card">
          <div className="eyebrow">FINAL SCORE</div>
          <div className="score-display">
            <strong data-testid="result-score">{Math.round(performance.percentage)}</strong>
            <span>
              {' '}/ %<small> overall</small>
            </span>
          </div>
          <div className="score-track">
            <i style={{ width: `${Math.min(100, Math.max(0, performance.percentage))}%` }} />
          </div>
          <div className="score-foot">
            <span>Pass mark {performance.passing_percentage}%</span>
            <span>{performance.passed ? 'Passing outcome' : 'Below pass threshold'}</span>
          </div>
        </div>

        <div className="panel result-meta">
          <div className="eyebrow">RESULT RECORD</div>
          <Metric label="ATTEMPT" value={`#${summary.id}`} />
          <Metric label="CORRECT" value={String(performance.correct_count)} />
          <Metric label="INCORRECT" value={String(performance.incorrect_count)} />
          <Metric label="SKIPPED" value={String(performance.skipped_count)} />
          <Metric label="STARTED" value={dateLabel(summary.start_time)} />
          <Metric label="SUBMITTED" value={dateLabel(summary.completed_at ?? summary.end_time)} />
        </div>
      </section>

      {reviewAllowed && Array.isArray(review) && review.length > 0 && (
        <section className="panel authorized-review">
          <div className="eyebrow">AUTHORIZED REVIEW</div>
          <h2>Question-by-question review</h2>
          <p>Released for this examination by your institution.</p>
          {review.map((item, index) => {
            const isCorrect = item.student_answer.answer_status === 'correct';
            const isMissed = item.student_answer.answer_status === 'unanswered';
            const points = item.points ?? 1;
            return (
              <div className={`review-answer ${isCorrect ? 'correct' : 'incorrect'} ${isMissed ? 'missed' : ''}`} key={`${item.question_id}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.question_text}</strong>
                  <small>
                    Points: {points} {points === 1 ? 'point' : 'points'} · Status: <span className={isCorrect ? 'status-correct' : 'status-incorrect'}>{isCorrect ? 'Correct' : isMissed ? 'Missed' : 'Incorrect'}</span>
                  </small>
                  <small>
                    Your response:{' '}
                    {item.student_answer.selected_option_text ||
                      item.student_answer.answer_text ||
                      'No response recorded'}
                  </small>
                  {!isCorrect && (
                    <small>
                      Correct answer: {item.correct_answer.option_text || '—'}
                    </small>
                  )}
                  {item.explanation && (
                    <small className="explanation">
                      Explanation: {item.explanation}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {!reviewAllowed && (
        <div className="bottom-note">
          <FileCheck2 size={17} />
          <span>
            Your institution releases the score for this exam only — the answer review is not
            published.
          </span>
        </div>
      )}
    </>
  );
}
