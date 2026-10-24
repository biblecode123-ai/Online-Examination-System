import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileCheck2, FileText, Search } from 'lucide-react';
import { Link } from 'wouter';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../components/shell';
import { useAuth } from '../lib/auth';
import { dateLabel } from '../lib/format';
import {
  getStudentExamState,
  latestAttemptFor,
  stateAction,
  stateTone,
} from '../lib/examState';
import { useExams, useMyAttempts } from '../lib/queries';
import type { Attempt, Exam } from '../lib/types';
import { isRealExam } from '../lib/endpoints';

function ExamCard({ exam, attempts, departmentId }: { exam: Exam; attempts: Attempt[]; departmentId?: number | null }) {
  const state = getStudentExamState(exam, attempts, departmentId ?? null);
  const attempt = latestAttemptFor(exam.id, attempts);
  const label = stateAction(state);
  const resultAttemptId =
    state === 'Completed' && attempt ? String(attempt.id) : null;

  return (
    <article className="exam-card" data-testid={`exam-card-${exam.id}`}>
      <div className="exam-card-head">
        <div className="course-icon">
          <BookOpen size={19} />
        </div>
        <Status tone={stateTone(state)}>{state}</Status>
      </div>
      <div className="eyebrow">{exam.course?.code ?? exam.category?.name ?? 'Examination'}</div>
      <h2>{exam.exam_title}</h2>
      <p>
        {exam.course?.name ?? exam.department?.name ?? 'Open to your institution'}
        {exam.has_password ? ' · Password protected' : ''}
      </p>
      <div className="exam-card-meta">
        <span>
          <Clock3 size={15} />
          {exam.total_time} min
        </span>
        <span>
          <FileCheck2 size={15} />
          {exam.questions_count ?? 0} questions
        </span>
        <span>
          <CalendarDays size={15} />
          {exam.active_from ? dateLabel(exam.active_from, { month: 'short', day: 'numeric' }) : 'Always open'}
        </span>
      </div>
      <div className="exam-card-foot">
        <span>
          {state === 'Available' && exam.active_until
            ? `Ends ${dateLabel(exam.active_until)}`
            : state === 'Upcoming' && exam.active_from
              ? `Starts ${dateLabel(exam.active_from)}`
              : state === 'Missed'
                ? 'Assessment window has ended'
                : state}
        </span>
        <Link
          href={
            resultAttemptId
              ? `/results/${resultAttemptId}`
              : `/exams/${exam.id}`
          }
          className="text-link"
          data-testid={`link-open-exam-${exam.id}`}
        >
          {label} <ChevronRight size={16} />
        </Link>
      </div>
    </article>
  );
}

const PER_PAGE = 12;

export function ExamList() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);

  const attemptsQuery = useMyAttempts();
  const examsQuery = useExams(page, appliedSearch, user?.department_id ?? null);
  const attempts = attemptsQuery.data ?? [];

  // Debounce typing into the query so we don't hammer the API.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [search]);

  const meta = examsQuery.data?.meta;
  const lastPage = meta?.last_page ?? 1;
  const total = meta?.total;

  const visibleExams = useMemo(() => {
    const rows = examsQuery.data?.data ?? [];
return rows.filter((exam) => isRealExam(exam));
  }, [examsQuery.data, user?.department_id]);

  return (
    <>
      <PageTitle
        eyebrow="ASSESSMENTS"
        title="My examinations"
        detail="Examinations assigned to your account and department by the university."
      />

      <div className="filter-bar">
        <span>
          <FileText size={17} /> {visibleExams.length} real examinations match your account
        </span>
        <label className="search-box">
          <span className="sr-only">Search examinations</span>
          <input
            data-testid="input-exam-search"
            type="search"
            placeholder="Search by title…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Search size={15} />
        </label>
      </div>

      {examsQuery.isPending && <LoadingBlock label="Loading examinations…" />}
      {examsQuery.isError && (
        <ErrorBox
          error={examsQuery.error}
          onRetry={() => void examsQuery.refetch()}
          retryLabel="Reload"
        />
      )}

      {!examsQuery.isPending && !examsQuery.isError && (
        <>
          <div className="exam-cards">
            {visibleExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                attempts={attempts}
                departmentId={user?.department_id ?? null}
              />
            ))}
          </div>

          {visibleExams.length === 0 && (
            <EmptyState
              icon={<FileText size={22} />}
              title="No examinations found"
              description={
                appliedSearch
                  ? 'No examination matches your search. Clear the search to see everything assigned to you.'
                  : 'No examinations are currently assigned to your account.'
              }
            />
          )}

          {lastPage > 1 && (
            <div className="pagination-row">
              <button
                type="button"
                className="button button-secondary"
                data-testid="button-prev-page"
                disabled={page <= 1 || examsQuery.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <span data-testid="page-indicator">
                Page {page} of {lastPage}
              </span>
              <button
                type="button"
                className="button button-secondary"
                data-testid="button-next-page"
                disabled={page >= lastPage || examsQuery.isFetching}
                onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
