import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
import { useAuth } from '../../lib/auth';
import { adminExamApi } from '../../lib/endpoints';
import { dateLabel, formatDuration, formatMatchingAnswer } from '../../lib/format';
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

type OutcomeFilter = 'all' | 'correct' | 'incorrect' | 'unanswered' | 'partial' | 'pending';

const OUTCOME_FILTERS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'partial', label: 'Partially correct' },
  { value: 'pending', label: 'Needs grading' },
];

/**
 * §5.3 — one question lands in exactly one outcome bucket so the filter
 * counts never double-count. Partial credit (0 < awarded < max) outranks the
 * server's `incorrect` status; an ungraded manual question is "needs grading"
 * and is never presented as a finalised grade (§2.4).
 */
function questionOutcome(item: AdminQuestionReview): Exclude<OutcomeFilter, 'all'> {
  if (item.requires_manual_grading && item.graded_at == null) return 'pending';
  if (item.student_answer.answer_status === 'correct') return 'correct';
  if (item.student_answer.answer_status === 'unanswered') return 'unanswered';
  if (item.awarded_points > 0 && item.awarded_points < item.max_points) return 'partial';
  return 'incorrect';
}

export function AdminResultDetail() {
  const params = useParams();
  const attemptId = params.attemptId ?? '';
  const query = useAdminResult(attemptId);
  // The result payload carries no Column B order for matching questions, so
  // letter the pairs from the exam's own question list (same cached query the
  // exam preview uses). Hook runs before any early return; disabled until the
  // attempt tells us which exam it belongs to.
  const examId = query.data?.result.exam.id ?? null;
  const questionsQuery = useQuery({
    queryKey: ['admin-exam-questions', examId],
    queryFn: ({ signal }) => adminExamApi.examQuestions(examId as number, signal),
    enabled: examId !== null,
    staleTime: 60_000,
  });
  // §5.3 — question outcome filter; declared before any early return so the
  // hook order stays stable across loading/error/data renders.
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  // This page serves both roles (/admin/results/:id and /teacher/results/:id);
  // "back" returns to the caller's own results surface, never across roles.
  const { user } = useAuth();
  const isTeacherView = user?.role_slug === 'teacher';

  if (query.isPending) {
    return <LoadingBlock label="Loading the result…" />;
  }

  if (query.isError || !query.data) {
    const errorBackHref = isTeacherView ? '/teacher/grading' : '/admin/results';
    return (
      <>
        <div className="back-row">
          <Link href={errorBackHref} className="text-link" data-testid="link-back-results">
            <ChevronLeft size={16} /> Results
          </Link>
        </div>
        <PageTitle
          eyebrow="RESULT DETAIL"
          title="Result unavailable"
          detail="This attempt could not be loaded from the examination server."
        />
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} retryLabel="Reload" />
        <Link href={errorBackHref} className="button button-secondary">
          Back to results
        </Link>
      </>
    );
  }

  const { result, question_review } = query.data;
  const review = question_review ?? [];

  // Column B order per question — only the rows that are matching questions
  // use it; every other type falls back to its existing plain rendering.
  const rightOrderById = new Map<number, string[]>();
  for (const q of questionsQuery.data?.items ?? []) {
    if (q.matching_data?.right_options?.length) {
      rightOrderById.set(q.id, q.matching_data.right_options.map((o) => o.text));
    } else if (q.matching_pairs?.length) {
      rightOrderById.set(q.id, [...new Set(q.matching_pairs.map((p) => p.right_item))]);
    }
  }
  // Admins return to the system-wide results table; teachers to this exam's
  // results tab (they have no system-wide list).
  const backHref = isTeacherView
    ? `/teacher/exams/${result.exam.id}?tab=results`
    : `/admin/results?exam_id=${result.exam.id}`;

  // §5.1 — summary counts derived from the same per-question records the
  // review list renders, so the summary can never disagree with the detail.
  const outcomeCounts: Record<OutcomeFilter, number> = {
    all: review.length,
    correct: 0,
    incorrect: 0,
    unanswered: 0,
    partial: 0,
    pending: 0,
  };
  for (const item of review) outcomeCounts[questionOutcome(item)] += 1;
  const visibleReview =
    outcomeFilter === 'all'
      ? review
      : review.filter((item) => questionOutcome(item) === outcomeFilter);

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
        <Link href={backHref} className="text-link" data-testid="link-back-results">
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
            {result.marks_obtained != null && result.max_marks != null
              ? `${result.marks_obtained} / ${result.max_marks} marks`
              : 'Not graded'}
          </span>
        </div>
        <div className="admin-panel-body">
          <div className="result-detail-layout">
            <div className="panel score-card">
              <div className="eyebrow">SCORE</div>
              <div className="score-display">
                <strong data-testid="result-percentage">
                  {result.marks_obtained != null && result.max_marks != null
                    ? `${result.marks_obtained} / ${result.max_marks}`
                    : '—'}
                </strong>
                <span>
                  {' '}<small>earned / total marks</small>
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
                  <small>TOTAL MARKS</small>
                  <strong data-testid="result-marks">
                    {result.max_marks !== null ? result.max_marks : '—'}
                  </strong>
                </div>
                <div className="metric">
                  <small>SCORE</small>
                  <strong data-testid="result-marks-earned">
                    {result.marks_obtained != null && result.max_marks != null
                      ? `${result.marks_obtained} / ${result.max_marks}`
                      : '—'}
                  </strong>
                </div>
                <div className="metric">
                  <small>CORRECT</small>
                  <strong>
                    {result.correct_answers != null && result.total_questions != null
                      ? `${result.correct_answers} / ${result.total_questions}`
                      : '—'}
                  </strong>
                </div>
                <div className="metric">
                  <small>INCORRECT</small>
                  <strong>{result.wrong_answers ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>UNANSWERED</small>
                  <strong>{result.skipped_answers ?? '—'}</strong>
                </div>
                <div className="metric">
                  <small>PARTIALLY CORRECT</small>
                  <strong data-testid="result-partial-count">{outcomeCounts.partial}</strong>
                </div>
                <div className="metric">
                  <small>PENDING GRADING</small>
                  <strong data-testid="result-pending-count">{outcomeCounts.pending}</strong>
                </div>
                <div className="metric">
                  <small>QUESTIONS</small>
                  <strong>
                    {result.total_questions ?? '—'}
                    {/* The server's total_questions can exclude questions still
                        awaiting manual grading while max_marks and the review
                        list include them — surface the divergence instead of
                        silently presenting a total that disagrees with the
                        records below (§5.1). */}
                    {result.total_questions != null &&
                      review.length !== result.total_questions && (
                        <em
                          className="marks-flag-mark"
                          title={
                            'The server reports ' +
                            result.total_questions +
                            ' question(s), but this attempt holds ' +
                            review.length +
                            ' question record(s) — server data needing correction.'
                          }
                        >
                          !
                        </em>
                      )}
                  </strong>
                  {result.total_questions != null &&
                    review.length !== result.total_questions && (
                      <small className="muted">
                        {review.length} record(s) in review
                      </small>
                    )}
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
            <div
              className="result-outcome-filters"
              role="tablist"
              aria-label="Filter questions by outcome"
              data-testid="outcome-filters"
            >
              {OUTCOME_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={outcomeFilter === option.value}
                  className={`result-filter-chip${
                    outcomeFilter === option.value ? ' active' : ''
                  }`}
                  onClick={() => setOutcomeFilter(option.value)}
                  data-testid={`filter-${option.value}`}
                >
                  {option.label}
                  <span className="result-filter-count">
                    {outcomeCounts[option.value]}
                  </span>
                </button>
              ))}
            </div>
            {visibleReview.length === 0 ? (
              <EmptyState
                icon={<FileCheck2 size={23} />}
                title="No questions with this outcome"
                description="Choose another filter to review the remaining questions."
              />
            ) : (
            visibleReview.map((item) => {
              const status = item.student_answer.answer_status;
              const rightOrder =
                rightOrderById.get(item.question_id) ??
                (item.options.length > 0
                  ? item.options.map((option) => option.text)
                  : null);
              const studentResponse =
                formatMatchingAnswer(item.student_answer.answer_text, rightOrder) ??
                (item.student_answer.selected_option_text ||
                  item.student_answer.answer_text ||
                  'No response recorded');
              const correctResponse =
                formatMatchingAnswer(item.correct_answer.option_text, rightOrder) ??
                item.correct_answer.option_text;
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
                      {studentResponse}
                    </small>

                    {correctResponse && (
                      <small>
                        Correct answer: {correctResponse}
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
            }))}
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
