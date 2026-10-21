import { Link, useParams } from 'wouter';
import {
  ChevronLeft,
  ClipboardCheck,
  Clock,
  FileCheck2,
  Flag,
  Printer,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { useAdminResult } from '../../lib/queries';
import { dateLabel, formatDuration } from '../../lib/format';
import { Button, EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../../components/shell';
import type { AdminQuestionReview } from '../../lib/types';

const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  mcq: 'Multiple choice',
  true_false: 'True / false',
  single_choice: 'Single choice',
  multiple: 'Multiple select',
  essay: 'Essay',
  matching: 'Matching',
  text: 'Written answer',
};

function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_LABEL[type] ?? type;
}

function answerTone(status: AdminQuestionReview['student_answer']['answer_status']): string {
  if (status === 'correct') return 'correct';
  if (status === 'unanswered') return 'missed';
  return 'incorrect';
}

export function AdminResultDetail() {
  const params = useParams();
  const attemptId = params.attemptId ?? '';
  const query = useAdminResult(attemptId);

  if (query.isPending) {
    return <LoadingBlock label="Loading the result…" />;
  }

  if (query.isError || !query.data) {
    return (
      <>
        <div className="back-row">
          <Link href="/admin/results" className="text-link" data-testid="link-back-results">
            <ChevronLeft size={16} /> Results
          </Link>
        </div>
        <PageTitle
          eyebrow="RESULT DETAIL"
          title="Result unavailable"
          detail="This attempt could not be loaded from the examination server."
        />
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} retryLabel="Reload" />
        <Link href="/admin/results" className="button button-secondary">
          Back to results
        </Link>
      </>
    );
  }

  const { result, question_review } = query.data;
  const review = question_review ?? [];

  const outcomeTone =
    result.outcome === 'passed' ? 'green' : result.outcome === 'failed' ? 'red' : 'amber';
  const outcomeText =
    result.outcome === 'passed'
      ? 'Passed'
      : result.outcome === 'failed'
        ? 'Not passed'
        : result.outcome === 'pending'
          ? 'Pending evaluation'
          : 'Not finalised';

  return (
    <>
      <div className="print-only report-header">
        <h1>
          {result.student.name ?? `Student #${result.student.id}`} —{' '}
          {result.exam.title ?? `Examination #${result.exam.id}`}
        </h1>
        <p>
          Madda Walabu University · Ofijan ExamFlow · attempt #{result.id} · generated{' '}
          {dateLabel(new Date())}
        </p>
      </div>

      <div className="back-row">
        <Link href="/admin/results" className="text-link" data-testid="link-back-results">
          <ChevronLeft size={16} /> Results
        </Link>
        <div className="hero-actions no-print">
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={15} /> Print result sheet
          </Button>
        </div>
      </div>

      <PageTitle
        eyebrow={`ATTEMPT #${result.id}`}
        title={result.exam.title ?? `Examination #${result.exam.id}`}
        detail={`${result.student.name ?? `Student #${result.student.id}`} · ${
          result.exam.category_name ?? 'Examination'
        }${result.exam.department_name ? ` · ${result.exam.department_name}` : ''}`}
        action={
          <Status tone={outcomeTone} testId="result-outcome">
            {outcomeText}
          </Status>
        }
      />

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Official result</h2>
          <span className="admin-panel-badge">
            {result.percentage !== null ? `${result.percentage}%` : 'Not graded'}
          </span>
        </div>
        <div className="admin-panel-body">
          <div className="result-detail-layout">
            <div className="panel score-card">
              <div className="eyebrow">FINAL SCORE</div>
              <div className="score-display">
                <strong data-testid="result-percentage">
                  {result.percentage !== null ? result.percentage : '—'}
                </strong>
                <span>
                  {' '}
                  / %<small> overall</small>
                </span>
              </div>
              <div className="score-track">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(0, result.percentage ?? 0))}%`,
                  }}
                />
              </div>
              <div className="score-foot">
                <span>Pass mark {result.pass_mark}%</span>
                <span>{outcomeText}</span>
              </div>
            </div>

            <div className="panel result-meta">
              <div className="eyebrow">ATTEMPT RECORD</div>
              <div className="result-meta-grid">
                <div className="metric">
                  <small>MARKS OBTAINED</small>
                  <strong data-testid="result-marks">
                    {result.marks_obtained}
                    {result.max_marks !== null ? ` / ${result.max_marks}` : ''}
                  </strong>
                </div>
                <div className="metric">
                  <small>CORRECT</small>
                  <strong>{result.correct_answers ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>INCORRECT</small>
                  <strong>{result.wrong_answers ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>SKIPPED</small>
                  <strong>{result.skipped_answers ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>QUESTIONS</small>
                  <strong>{result.total_questions ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>MODE</small>
                  <strong>{result.mode ?? '—'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <div className="admin-panel-header">
          <h2>Attempt timeline</h2>
        </div>
        <div className="admin-panel-body">
          <div className="timeline-grid">
            <div className="timeline-item">
              <Clock size={15} />
              <span>
                <small>STARTED</small>
                <strong>{dateLabel(result.start_time)}</strong>
              </span>
            </div>
            <div className="timeline-item">
              <ClipboardCheck size={15} />
              <span>
                <small>SUBMITTED</small>
                <strong>{dateLabel(result.completed_at ?? result.end_time)}</strong>
              </span>
            </div>
            <div className="timeline-item">
              <Target size={15} />
              <span>
                <small>TIME TAKEN</small>
                <strong>
                  {result.time_taken_seconds !== null
                    ? formatDuration(Math.round(result.time_taken_seconds / 60))
                    : '—'}
                </strong>
              </span>
            </div>
            <div className="timeline-item">
              <FileCheck2 size={15} />
              <span>
                <small>ATTEMPT STATUS</small>
                <strong>
                  {result.status ?? '—'}
                  {result.attempt_state ? ` · ${result.attempt_state}` : ''}
                </strong>
              </span>
            </div>
            <div className="timeline-item">
              <Flag size={15} />
              <span>
                <small>AUTO-SUBMITTED</small>
                <strong>{result.auto_submitted ? 'Yes' : 'No'}</strong>
              </span>
            </div>
            <div className="timeline-item">
              <ShieldAlert size={15} />
              <span>
                <small>VIOLATIONS</small>
                <strong>{result.violation_count}</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <div className="admin-panel-header">
          <h2>Question-by-question review</h2>
          <span className="admin-panel-badge">
            {review.length} question(s)
          </span>
        </div>
        {review.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 size={23} />}
            title="No answer record"
            description="The examination server holds no answer record for this attempt."
          />
        ) : (
          <div className="admin-panel-body">
            {review.map((item) => {
              const status = item.student_answer.answer_status;
              return (
                <div className={`review-answer ${answerTone(status)}`} key={item.question_id}>
                  <span>{String(item.question_number).padStart(2, '0')}</span>
                  <div>
                    <div className="review-answer-head">
                      <strong>{item.question_text}</strong>
                      <span className="review-answer-points">
                        {item.awarded_points} / {item.max_points} pt
                      </span>
                    </div>
                    <small>
                      {questionTypeLabel(item.question_type)} ·{' '}
                      <span
                        className={
                          status === 'correct'
                            ? 'status-correct'
                            : status === 'unanswered'
                              ? 'muted'
                              : 'status-incorrect'
                        }
                      >
                        {status === 'correct'
                          ? 'Correct'
                          : status === 'unanswered'
                            ? 'Not answered'
                            : 'Incorrect'}
                      </span>
                      {item.requires_manual_grading && (
                        <>
                          {' '}
                          ·{' '}
                          {item.graded_at
                            ? `Reviewed ${dateLabel(item.graded_at)}`
                            : 'Awaiting manual grading'}
                        </>
                      )}
                    </small>

                    <small>
                      Student response:{' '}
                      {item.student_answer.selected_option_text ||
                        item.student_answer.answer_text ||
                        'No response recorded'}
                    </small>

                    {item.correct_answer.option_text && (
                      <small>
                        Correct answer: {item.correct_answer.option_text}
                      </small>
                    )}

                    {item.options.length > 0 && (
                      <ul className="review-options">
                        {item.options.map((option) => (
                          <li key={option.id} data-correct={option.is_correct}>
                            <span>{option.text}</span>
                            {option.is_correct && <em>Correct option</em>}
                            {item.student_answer.selected_option_id === option.id && (
                              <em className="selected">Student selection</em>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {item.grading_notes && (
                      <small className="explanation">Grader note: {item.grading_notes}</small>
                    )}

                    {item.explanation && (
                      <small className="explanation">Explanation: {item.explanation}</small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="bottom-note no-print">
        <FileCheck2 size={17} />
        <span>
          This sheet shows the official record kept by the examination server. The answer key is
          visible to administrators only.
        </span>
      </div>
    </>
  );
}
