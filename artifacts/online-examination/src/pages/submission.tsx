import { Check, ChevronRight, Clock3, FileCheck2, History } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { ErrorBox, LoadingBlock, Metric, PageTitle, Status } from '../components/shell';
import { dateLabel } from '../lib/format';
import { useAttempt } from '../lib/queries';

function readVisibility(attemptId: string): string | null {
  try {
    return window.sessionStorage.getItem(`ofijan.exam.result-visibility.${attemptId}`);
  } catch {
    return null;
  }
}

export function Submission() {
  const params = useParams();
  const examId = params.examId ?? '';
  const attemptId = params.attemptId ?? '';
  const query = useAttempt(attemptId);

  if (query.isPending) {
    return <LoadingBlock label="Confirming your submission with the server…" />;
  }

  if (query.isError || !query.data) {
    return (
      <>
        <PageTitle
          eyebrow="SUBMISSION"
          title="Submission status unavailable"
          detail="The server could not confirm this attempt."
        />
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} retryLabel="Recheck" />
        <Link href="/history" className="text-link">
          Attempt history
        </Link>
      </>
    );
  }

  const attempt = query.data;
  const finished =
    attempt.status === 'completed' ||
    attempt.status === 'graded' ||
    attempt.attempt_status === 'submitted';

  const answered = (attempt.student_answers ?? []).filter(
    (answer) =>
      answer.selected_option_id !== null && answer.selected_option_id !== undefined,
  ).length;
  const visibility = readVisibility(attemptId);

  if (!finished) {
    return (
      <div className="submission-wrap">
        <div className="submission-card">
          <div className="success-mark pending">
            <Clock3 size={26} />
          </div>
          <div className="eyebrow">NOT YET SUBMITTED</div>
          <h1>This attempt is still open</h1>
          <p>
            The server has not finalized this attempt yet. If you reached this screen after the
            deadline, the attempt will be finalized automatically on the server.
          </p>
          <div className="submission-actions">
            <Link
              href={`/exams/${examId}/attempt/${attemptId}`}
              className="button button-primary"
              data-testid="link-return-attempt"
            >
              Return to the examination <ChevronRight size={16} />
            </Link>
            <button
              type="button"
              className="button button-secondary"
              data-testid="button-recheck-status"
              onClick={() => void query.refetch()}
            >
              Recheck status
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="submission-wrap">
      <div className="submission-card">
        <div className="success-mark">
          <Check size={26} />
        </div>
        <div className="eyebrow">ASSESSMENT RECEIVED</div>
        <h1 data-testid="submission-title">Submission confirmed</h1>
        <p>
          Your attempt was finalized by the examination server. The details below come from the
          server record of this attempt.
        </p>

        <div className="submission-details">
          <span>
            Assessment <strong>{attempt.exam?.exam_title ?? 'Examination'}</strong>
          </span>
          <span>
            Submitted{' '}
            <strong data-testid="value-submission-time">
              {dateLabel(attempt.completed_at ?? attempt.end_time ?? attempt.start_time)}
            </strong>
          </span>
          <span>
            Attempt <strong data-testid="value-attempt-id">#{attempt.id}</strong>
          </span>
          {typeof attempt.score === 'number' && (
            <span>
              Score{' '}
              <strong data-testid="value-submission-score">
                {attempt.score}
                {attempt.exam?.pass_mark !== undefined && attempt.exam?.pass_mark !== null
                  ? ` / pass mark ${attempt.exam.pass_mark}`
                  : ''}
              </strong>
            </span>
          )}
        </div>

        {typeof attempt.score === 'number' ? (
          <Status tone={attempt.passed ? 'green' : 'red'} testId="submission-status">
            {attempt.passed ? 'Passed' : 'Not passed'}
          </Status>
        ) : (
          <Status tone="amber" testId="submission-status">
            Result pending release
          </Status>
        )}

        <div className="prototype-disclaimer">
          <FileCheck2 size={16} />
          {visibility === 'score_only'
            ? 'Your institution releases scores for this exam without an answer review.'
            : 'Results and any answer review are released according to your institution’s policy.'}
        </div>

        <div className="submission-actions">
          <Link
            href="/dashboard"
            className="button button-primary"
            data-testid="link-submission-dashboard"
          >
            Return to dashboard <ChevronRight size={16} />
          </Link>
          <Link href={`/results/${attemptId}`} className="button button-secondary" data-testid="link-submission-result">
            View result
          </Link>
          <Link href="/history" className="button button-quiet" data-testid="link-submission-history">
            <History size={16} /> Attempt history
          </Link>
        </div>

        <div className="detail-metrics">
          <Metric label="ATTEMPT" value={`#${attempt.id}`} />
          <Metric label="QUESTIONS" value={String(attempt.total_questions ?? '—')} />
          <Metric label="RESPONSES SAVED" value={String(answered)} />
          <Metric
            label="FINAL STATUS"
            value={finished ? 'Submitted' : 'Open'}
          />
        </div>
      </div>
    </div>
  );
}
