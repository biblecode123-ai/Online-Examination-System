import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'wouter';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  Hourglass,
  ListChecks,
  MinusCircle,
  Percent,
  Printer,
  RotateCcw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { adminApi, adminExamApi } from '../../lib/endpoints';
import { useAdminExamResults, useAdminResult, useAdminResultOptions, useAdminResults } from '../../lib/queries';
import { dateLabel } from '../../lib/format';
import { Button, EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../../components/shell';
import type {
  AdminResultRow,
  AdminResultsFilters,
  AdminResultSort,
  AdminScoreBucket,
  AdminRealExam,
} from '../../lib/types';

const PER_PAGE_OPTIONS = [25, 50, 100];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted — awaiting grading' },
  { value: 'graded', label: 'Graded' },
  { value: 'expired', label: 'Expired' },
  { value: 'abandoned', label: 'Abandoned' },
  { value: 'locked', label: 'Locked' },
];

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending evaluation' },
];

const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  started: 'In progress',
  expired: 'Expired',
  abandoned: 'Abandoned',
};

/** A column header that orders the list on the server. */
function SortableHeader({
  label,
  column,
  filters,
  onSort,
}: {
  label: string;
  column: AdminResultSort;
  filters: AdminResultsFilters;
  onSort: (column: AdminResultSort) => void;
}) {
  const active = filters.sort === column;
  return (
    <th>
      <button
        type="button"
        className="sortable-head"
        data-active={active}
        aria-label={`Sort by ${label}`}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          filters.direction === 'asc' ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} />
        )}
      </button>
    </th>
  );
}

function toInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function outcomeTone(row: AdminResultRow): 'green' | 'red' | 'amber' | 'neutral' {
  if (row.outcome === 'passed') return 'green';
  if (row.outcome === 'failed') return 'red';
  if (row.outcome === 'pending') return 'amber';
  return 'neutral';
}

function outcomeLabel(row: AdminResultRow): string {
  if (row.outcome === 'passed') return 'Passed';
  if (row.outcome === 'failed') return 'Failed';
  if (row.outcome === 'pending') return 'Pending evaluation';
  return 'Not finalised';
}

function gradingLabel(row: AdminResultRow): string {
  if (row.grading_status === 'pending_review') return 'Pending evaluation';
  if (row.grading_status === 'reviewed') return 'Reviewed';
  return 'Automatic';
}

function gradingTone(row: AdminResultRow): 'green' | 'amber' | 'neutral' {
  if (row.grading_status === 'pending_review') return 'amber';
  if (row.grading_status === 'reviewed') return 'green';
  return 'neutral';
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

function ScoreDistribution({ buckets }: { buckets: AdminScoreBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="distribution">
      {buckets.map((bucket) => (
        <div className="distribution-row" key={bucket.label}>
          <span>{bucket.label}</span>
          <span className="distribution-track">
            <i style={{ width: `${Math.round((bucket.count / max) * 100)}%` }} />
          </span>
          <span>{bucket.count}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Compact per-student question breakdown: what the student got right, got
 * wrong and left unanswered, straight from the attempt's question review.
 */
function AttemptQuestions({ attemptId }: { attemptId: number }) {
  const query = useAdminResult(String(attemptId));

  if (query.isPending) {
    return <LoadingBlock label="Loading question breakdown…" />;
  }

  if (query.isError || !query.data) {
    return (
      <ErrorBox
        error={query.error}
        onRetry={() => void query.refetch()}
        retryLabel="Reload"
      />
    );
  }

  const review = query.data.question_review ?? [];
  if (review.length === 0) {
    return (
      <EmptyState
        icon={<FileCheck2 size={23} />}
        title="No answer record"
        description="The examination server holds no answer record for this attempt."
      />
    );
  }

  const correct = review.filter(
    (item) => item.student_answer.answer_status === 'correct',
  ).length;
  const wrong = review.filter(
    (item) => item.student_answer.answer_status === 'incorrect',
  ).length;
  const missed = review.length - correct - wrong;

  return (
    <div className="attempt-questions" data-testid={`attempt-questions-${attemptId}`}>
      <div className="attempt-questions-head">
        <strong>Questions got &amp; missed</strong>
        <span className="attempt-questions-legend">
          <em className="status-correct">
            <CheckCircle2 size={13} /> {correct} correct
          </em>
          <em className="status-incorrect">
            <XCircle size={13} /> {wrong} incorrect
          </em>
          <em className="muted">
            <MinusCircle size={13} /> {missed} unanswered
          </em>
        </span>
      </div>
      {review.map((item) => {
        const status = item.student_answer.answer_status;
        const tone =
          status === 'correct' ? 'correct' : status === 'unanswered' ? 'missed' : 'incorrect';
        return (
          <div className={`review-answer ${tone}`} key={item.question_id}>
            <span>{String(item.question_number).padStart(2, '0')}</span>
            <div>
              <div className="review-answer-head">
                <strong>{item.question_text}</strong>
                <span className="review-answer-points">
                  {item.awarded_points} / {item.max_points} pt
                </span>
              </div>
              <small>
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
                {' · '}Student response:{' '}
                {item.student_answer.selected_option_text ||
                  item.student_answer.answer_text ||
                  'none'}
              </small>
              {item.correct_answer.option_text && status !== 'correct' && (
                <small>Correct answer: {item.correct_answer.option_text}</small>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface DepartmentCluster {
  id: number;
  name: string;
  exams: AdminRealExam[];
  totalAttempts: number;
  assignedStudents: number;
}

export function AdminResults() {
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [examSearch, setExamSearch] = useState('');

  const urlSearch = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Keep the search box aligned with the URL when the browser's back button is used
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // The search term for student attempts is debounced before it reaches the server
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const timer = window.setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set('search', searchInput);
          else next.delete('search');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, urlSearch, setParams]);

  const selectedExamId = toInt(params.get('exam_id'));

  const filters = useMemo<AdminResultsFilters>(
    () => ({
      search: urlSearch || undefined,
      exam_id: selectedExamId,
      department_id: toInt(params.get('department_id')),
      category_id: toInt(params.get('category_id')),
      status: params.get('status') || undefined,
      outcome: (params.get('outcome') || undefined) as AdminResultsFilters['outcome'],
      from_date: params.get('from_date') || undefined,
      to_date: params.get('to_date') || undefined,
      min_score: toNumber(params.get('min_score')),
      max_score: toNumber(params.get('max_score')),
      sort: (params.get('sort') as AdminResultSort) || 'started_at',
      direction: (params.get('direction') as 'asc' | 'desc') || 'desc',
      page: toInt(params.get('page')) ?? 1,
      per_page: toInt(params.get('per_page')) ?? 25,
    }),
    [params, urlSearch, selectedExamId],
  );

  // Queries
  const resultsQuery = useAdminResults(filters);
  const optionsQuery = useAdminResultOptions();
  const examSummaryQuery = useAdminExamResults(selectedExamId ?? null);

  // Fetch only REAL EXAMS (authoritative governed real-exams endpoint)
  const realExamsQuery = useQuery({
    queryKey: ['admin-real-exams-list'],
    queryFn: ({ signal }) => adminExamApi.listExams(signal),
    staleTime: 60_000,
  });

  // Fetch departments list
  const departmentsQuery = useQuery({
    queryKey: ['admin-departments-all'],
    queryFn: () => adminApi.listDepartments({ per_page: 100 }),
    staleTime: 5 * 60_000,
  });

  const options = optionsQuery.data;
  const page = resultsQuery.data;
  const rows = page?.results ?? [];
  const summary = page?.summary;
  const realExams = realExamsQuery.data?.items ?? [];

  const updateParam = (name: string, value: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const toggleSort = (key: AdminResultSort) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('sort') === key) {
          next.set('direction', next.get('direction') === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sort', key);
          next.set('direction', key === 'student' || key === 'exam' ? 'asc' : 'desc');
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const clearAttemptFilters = () => {
    setSearchInput('');
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        if (selectedExamId) next.set('exam_id', String(selectedExamId));
        return next;
      },
      { replace: true },
    );
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await adminApi.exportResults({
        ...filters,
        page: undefined,
        per_page: undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `results_${selectedExamId ? `exam_${selectedExamId}_` : ''}${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  };

  // Clicking an exam card drills down into its student attempts
  const handleExamClick = (exam: AdminRealExam) => {
    updateParam('exam_id', String(exam.id));
    if (exam.department_id) {
      updateParam('department_id', String(exam.department_id));
    }
  };

  // Returning to the department clusters view
  const handleBackToExams = () => {
    updateParam('exam_id', undefined);
  };

  // Cluster real exams by department
  const departmentClusters = useMemo(() => {
    const deptMap = new Map<
      number,
      { name: string; exams: AdminRealExam[]; totalAttempts: number; assignedStudents: number }
    >();

    // Seed known departments
    for (const d of optionsQuery.data?.departments ?? []) {
      deptMap.set(d.id, {
        name: d.name,
        exams: [],
        totalAttempts: 0,
        assignedStudents: 0,
      });
    }
    for (const d of departmentsQuery.data?.items ?? []) {
      if (!deptMap.has(d.id)) {
        deptMap.set(d.id, {
          name: d.name,
          exams: [],
          totalAttempts: 0,
          assignedStudents: 0,
        });
      }
    }

    const generalDeptId = 0;
    if (!deptMap.has(generalDeptId)) {
      deptMap.set(generalDeptId, {
        name: 'General / University-wide',
        exams: [],
        totalAttempts: 0,
        assignedStudents: 0,
      });
    }

    // Place each real exam into its department cluster
    for (const exam of realExams) {
      // Filter by exam search text if entered
      if (examSearch.trim()) {
        const q = examSearch.toLowerCase();
        const matchesTitle = (exam.exam_title ?? '').toLowerCase().includes(q);
        const matchesCat = (exam.category?.name ?? '').toLowerCase().includes(q);
        const matchesDesc = (exam.description ?? '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesCat && !matchesDesc) {
          continue;
        }
      }

      const dId = exam.department_id ?? generalDeptId;
      if (!deptMap.has(dId)) {
        deptMap.set(dId, {
          name: `Department #${dId}`,
          exams: [],
          totalAttempts: 0,
          assignedStudents: 0,
        });
      }

      const cluster = deptMap.get(dId)!;
      cluster.exams.push(exam);
      cluster.totalAttempts += (exam.completed_attempts ?? 0) + (exam.ongoing_attempts ?? 0);
      cluster.assignedStudents += exam.assigned_count ?? exam.assigned_students?.length ?? 0;
    }

    const clusters: DepartmentCluster[] = [];
    deptMap.forEach((val, id) => {
      if (val.exams.length > 0) {
        clusters.push({
          id,
          name: val.name,
          exams: val.exams,
          totalAttempts: val.totalAttempts,
          assignedStudents: val.assignedStudents,
        });
      }
    });

    // Sort alphabetically with general cluster at the end
    clusters.sort((a, b) => {
      if (a.id === 0) return 1;
      if (b.id === 0) return -1;
      return a.name.localeCompare(b.name);
    });

    return clusters;
  }, [realExams, optionsQuery.data?.departments, departmentsQuery.data?.items, examSearch]);

  const visibleClusters = useMemo(() => {
    if (selectedDepartmentId === null) return departmentClusters;
    return departmentClusters.filter((c) => c.id === selectedDepartmentId);
  }, [departmentClusters, selectedDepartmentId]);

  // Active exam info when viewing attempts
  const activeRealExam = useMemo(
    () => realExams.find((e) => e.id === selectedExamId),
    [realExams, selectedExamId],
  );

  const activeDeptName = useMemo(() => {
    if (!activeRealExam?.department_id) return 'General / University-wide';
    const found = departmentClusters.find((c) => c.id === activeRealExam.department_id);
    return found?.name || `Department #${activeRealExam.department_id}`;
  }, [activeRealExam, departmentClusters]);

  const examSummary = examSummaryQuery.data;
  const currentPage = page?.current_page ?? 1;
  const lastPage = page?.last_page ?? 1;
  const totalRecords = page?.total ?? 0;

  const activeFilterCount = [
    filters.search,
    filters.status,
    filters.outcome,
    filters.from_date,
    filters.to_date,
    filters.min_score,
    filters.max_score,
  ].filter((v) => v !== undefined && v !== '').length;

  return (
    <>
      <div className="print-only report-header">
        <h1>Examination results report</h1>
        <p>Madda Walabu University · Ofijan ExamFlow · generated {dateLabel(new Date())}</p>
        <p>
          {totalRecords} attempt(s) · {summary ? `${summary.passed_attempts} passed` : '—'} ·{' '}
          {summary ? `${summary.failed_attempts} failed` : '—'}
        </p>
      </div>

      <PageTitle
        eyebrow="EXAMINATION OUTCOMES"
        title="Results management"
        detail="Department-clustered real examination results and verified student attempts."
        action={
          <div className="hero-actions no-print">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              <Download size={15} /> {exporting ? 'Preparing…' : 'Export Excel'}
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer size={15} /> Print report
            </Button>
          </div>
        }
      />

      {exportError !== null && (
        <ErrorBox error={exportError} onRetry={handleExport} retryLabel="Retry export" />
      )}

      {/* =========================================================================
          LEVEL 2: EXAM SELECTED -> STUDENT ATTEMPTS & DETAILED RESULT ACCESS
          ========================================================================= */}
      {selectedExamId ? (
        <>
          {/* Breadcrumb Navigation */}
          <div className="results-breadcrumb-bar no-print">
            <div className="results-breadcrumb-trail">
              <Button
                variant="secondary"
                onClick={handleBackToExams}
                data-testid="button-back-to-exams"
              >
                <ChevronLeft size={15} /> Back to Examinations
              </Button>
              <span className="results-breadcrumb-separator">/</span>
              <span>{activeDeptName}</span>
              <span className="results-breadcrumb-separator">/</span>
              <strong>
                {activeRealExam?.exam_title ?? examSummary?.exam.title ?? `Exam #${selectedExamId}`}
              </strong>
              <span className="real-exam-pill">
                <span className="real-exam-pulse-dot" /> Real Exam
              </span>
            </div>
          </div>

          {/* Exam Summary / KPIs */}
          {examSummary && (
            <section className="admin-panel" style={{ marginBottom: 20 }}>
              <div className="admin-panel-header">
                <h2>{examSummary.exam.title ?? `Examination #${examSummary.exam.id}`}</h2>
                <span className="admin-panel-badge">{examSummary.attempts} attempt(s) recorded</span>
              </div>
              <div className="admin-panel-body">
                <div className="exam-summary-metrics">
                  <div>
                    <small>Assigned students</small>
                    <strong>{examSummary.assigned_students}</strong>
                  </div>
                  <div>
                    <small>Started</small>
                    <strong>{examSummary.students_started}</strong>
                  </div>
                  <div>
                    <small>Not attempted</small>
                    <strong>{examSummary.students_not_attempted}</strong>
                  </div>
                  <div>
                    <small>Pass rate</small>
                    <strong>{percent(examSummary.pass_rate)}</strong>
                  </div>
                  <div>
                    <small>Average score</small>
                    <strong>{percent(examSummary.average_score)}</strong>
                  </div>
                  <div>
                    <small>Pass mark</small>
                    <strong>
                      {examSummary.exam.passing_percentage !== null
                        ? `${examSummary.exam.passing_percentage}%`
                        : '—'}
                    </strong>
                  </div>
                </div>
                {examSummary.score_distribution && examSummary.score_distribution.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="eyebrow">SCORE DISTRIBUTION</div>
                    <ScoreDistribution buckets={examSummary.score_distribution} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Filters for this Exam's Student Attempts */}
          <section className="admin-panel no-print" style={{ marginBottom: 20 }}>
            <div className="admin-panel-header">
              <h2>Student Attempts Filters</h2>
              {activeFilterCount > 0 && (
                <button type="button" className="text-link" onClick={clearAttemptFilters}>
                  <RotateCcw size={13} /> Clear filters ({activeFilterCount})
                </button>
              )}
            </div>
            <div className="admin-panel-body">
              <div className="results-filters">
                <div className="filter-field filter-field-wide">
                  <label htmlFor="filter-search-student">Search student</label>
                  <div className="search-box">
                    <input
                      id="filter-search-student"
                      type="search"
                      placeholder="Student name, email or attempt #"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                    />
                    <span>
                      <Search size={15} />
                    </span>
                  </div>
                </div>

                <div className="filter-field">
                  <label htmlFor="filter-status">Attempt status</label>
                  <select
                    id="filter-status"
                    value={filters.status ?? ''}
                    onChange={(event) => updateParam('status', event.target.value || undefined)}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label htmlFor="filter-outcome">Outcome</label>
                  <select
                    id="filter-outcome"
                    value={filters.outcome ?? ''}
                    onChange={(event) => updateParam('outcome', event.target.value || undefined)}
                  >
                    {OUTCOME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label htmlFor="filter-min-score">Min score (%)</label>
                  <input
                    id="filter-min-score"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={filters.min_score ?? ''}
                    onChange={(event) => updateParam('min_score', event.target.value || undefined)}
                  />
                </div>

                <div className="filter-field">
                  <label htmlFor="filter-max-score">Max score (%)</label>
                  <input
                    id="filter-max-score"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="100"
                    value={filters.max_score ?? ''}
                    onChange={(event) => updateParam('max_score', event.target.value || undefined)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Student Attempts Table */}
          <section className="admin-panel" style={{ marginTop: 16 }}>
            <div className="admin-panel-header">
              <h2>Student Attempts</h2>
              <span className="admin-panel-badge">
                {totalRecords.toLocaleString()} student attempt(s)
              </span>
            </div>

            {resultsQuery.isPending ? (
              <LoadingBlock label="Loading student attempts…" />
            ) : resultsQuery.isError ? (
              <ErrorBox
                error={resultsQuery.error}
                onRetry={() => void resultsQuery.refetch()}
                retryLabel="Reload"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Users size={28} />}
                title="No student attempts recorded"
                description={`No students have attempted this examination yet${
                  activeFilterCount > 0 ? ' matching your filters' : ''
                }.`}
              />
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <SortableHeader
                        label="Student"
                        column="student"
                        filters={filters}
                        onSort={toggleSort}
                      />
                      <th>Status</th>
                      <SortableHeader
                        label="Total Marks"
                        column="score"
                        filters={filters}
                        onSort={toggleSort}
                      />
                      <th>Score</th>
                      <th>Correct</th>
                      <th>Outcome</th>
                      <th>Grading</th>
                      <SortableHeader
                        label="Started"
                        column="started_at"
                        filters={filters}
                        onSort={toggleSort}
                      />
                      <SortableHeader
                        label="Submitted"
                        column="completed_at"
                        filters={filters}
                        onSort={toggleSort}
                      />
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          data-testid={`row-result-${row.id}`}
                          className="student-table-row"
                        >
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar">
                                {(row.student.name ?? '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="user-info">
                                <Link
                                  href={`/admin/results/${row.id}`}
                                  className="student-clickable-name"
                                  data-testid={`link-student-name-${row.id}`}
                                  title="Click to view full detail result"
                                >
                                  {row.student.name ?? `Student #${row.student.id}`}
                                </Link>
                                <small>
                                  {row.student.email ?? `ID ${row.student.id}`}
                                  {row.student.department_name
                                    ? ` · ${row.student.department_name}`
                                    : ''}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>
                              {ATTEMPT_STATUS_LABEL[row.status ?? ''] ?? (row.status ?? '—')}
                            </strong>
                            <small>
                              Attempt #{row.id}
                              {row.auto_submitted ? ' · auto-submitted' : ''}
                            </small>
                          </td>
                          <td className="num" data-testid={`marks-${row.id}`}>
                            <strong>{row.max_marks !== null ? row.max_marks : '—'}</strong>
                          </td>
                          <td className="num" data-testid={`score-${row.id}`}>
                            <strong>
                              {row.marks_obtained != null && row.max_marks != null
                                ? `${row.marks_obtained} / ${row.max_marks}`
                                : '—'}
                            </strong>
                          </td>
                          <td className="num" data-testid={`correct-${row.id}`}>
                            <strong>
                              {row.correct_answers != null && row.total_questions != null
                                ? `${row.correct_answers} / ${row.total_questions}`
                                : '—'}
                            </strong>
                          </td>
                          <td>
                            <Status tone={outcomeTone(row)} testId={`outcome-${row.id}`}>
                              {outcomeLabel(row)}
                            </Status>
                            <small className="muted">Pass mark {row.pass_mark}%</small>
                          </td>
                          <td>
                            <Status tone={gradingTone(row)}>{gradingLabel(row)}</Status>
                          </td>
                          <td>{dateLabel(row.start_time)}</td>
                          <td>{dateLabel(row.completed_at ?? row.end_time)}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="text-link"
                                aria-expanded={expandedAttemptId === row.id}
                                onClick={() =>
                                  setExpandedAttemptId((prev) => (prev === row.id ? null : row.id))
                                }
                                data-testid={`button-questions-${row.id}`}
                              >
                                <ListChecks size={14} />
                                {expandedAttemptId === row.id ? 'Hide' : 'Questions'}
                              </button>
                              <Link
                                href={`/admin/results/${row.id}`}
                                className="button button-secondary"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                data-testid={`link-result-${row.id}`}
                              >
                                Detail Result <ChevronRight size={13} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                        {expandedAttemptId === row.id && (
                          <tr
                            className="attempt-questions-row"
                            data-testid={`questions-row-${row.id}`}
                          >
                            <td colSpan={10}>
                              <AttemptQuestions attemptId={row.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!resultsQuery.isPending && rows.length > 0 && (
              <div className="admin-panel-body">
                <div className="pagination-row">
                  <span>
                    Page {currentPage} of {lastPage} · {totalRecords.toLocaleString()} record(s)
                  </span>
                  <div className="pagination-controls">
                    <select
                      aria-label="Records per page"
                      className="per-page-select"
                      value={filters.per_page}
                      onChange={(event) => updateParam('per_page', event.target.value)}
                    >
                      {PER_PAGE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} per page
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      disabled={currentPage <= 1}
                      onClick={() => updateParam('page', String(currentPage - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={currentPage >= lastPage}
                      onClick={() => updateParam('page', String(currentPage + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        /* =========================================================================
           LEVEL 1: CLUSTERED BY DEPARTMENT -> REAL EXAM CARDS
           ========================================================================= */
        <>
          {/* Top Overview KPI Cards */}
          <div className="dashboard-stats" style={{ marginBottom: 24 }}>
            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <FileText size={18} />
                </div>
                <span className="admin-stat-trend positive">Governed</span>
              </div>
              <div className="admin-stat-value" data-testid="stat-real-exams">
                {realExams.length.toLocaleString()}
              </div>
              <div className="admin-stat-label">Real Examinations</div>
              <div className="admin-stat-meta">Authoritative official exams</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <Building2 size={18} />
                </div>
                <span className="admin-stat-trend neutral">Clustered</span>
              </div>
              <div className="admin-stat-value" data-testid="stat-dept-clusters">
                {departmentClusters.length.toLocaleString()}
              </div>
              <div className="admin-stat-label">Academic Departments</div>
              <div className="admin-stat-meta">Grouped curriculum units</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <ClipboardList size={18} />
                </div>
                <span className="admin-stat-trend neutral">Recorded</span>
              </div>
              <div className="admin-stat-value" data-testid="stat-total-attempts">
                {(summary?.total_attempts ?? 0).toLocaleString()}
              </div>
              <div className="admin-stat-label">Total Student Attempts</div>
              <div className="admin-stat-meta">
                {(summary?.completed_attempts ?? 0).toLocaleString()} completed
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <div className="admin-stat-icon">
                  <Percent size={18} />
                </div>
                <span className="admin-stat-trend positive">Outcome</span>
              </div>
              <div className="admin-stat-value" data-testid="stat-pass-rate">
                {percent(summary?.pass_rate)}
              </div>
              <div className="admin-stat-label">System Pass Rate</div>
              <div className="admin-stat-meta">
                {(summary?.passed_attempts ?? 0).toLocaleString()} passed
              </div>
            </div>
          </div>

          {/* Department Filter & Search Bar */}
          <div className="dept-filter-bar no-print">
            <div className="dept-pills-nav" role="tablist" aria-label="Department Clusters">
              <button
                type="button"
                className={`dept-pill-btn ${selectedDepartmentId === null ? 'active' : ''}`}
                onClick={() => setSelectedDepartmentId(null)}
                data-testid="tab-all-departments"
              >
                <Building2 size={14} />
                <span>All Departments</span>
                <span className="dept-pill-badge">{realExams.length}</span>
              </button>
              {departmentClusters.map((cluster) => (
                <button
                  key={cluster.id}
                  type="button"
                  className={`dept-pill-btn ${selectedDepartmentId === cluster.id ? 'active' : ''}`}
                  onClick={() => setSelectedDepartmentId(cluster.id)}
                  data-testid={`tab-dept-${cluster.id}`}
                >
                  <GraduationCap size={14} />
                  <span>{cluster.name}</span>
                  <span className="dept-pill-badge">{cluster.exams.length}</span>
                </button>
              ))}
            </div>

            <div className="search-box" style={{ minWidth: 260 }}>
              <input
                type="search"
                placeholder="Search real exams by title or category…"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                data-testid="input-search-real-exams"
              />
              <span>
                <Search size={15} />
              </span>
            </div>
          </div>

          {/* Department Clusters with Real Exam Cards */}
          {realExamsQuery.isPending || departmentsQuery.isPending ? (
            <LoadingBlock label="Loading real examinations clustered by department…" />
          ) : realExamsQuery.isError ? (
            <ErrorBox
              error={realExamsQuery.error}
              onRetry={() => void realExamsQuery.refetch()}
              retryLabel="Reload examinations"
            />
          ) : visibleClusters.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={30} />}
              title="No real examinations found"
              description={
                examSearch
                  ? `No real examinations match "${examSearch}". Try clearing the search filter.`
                  : 'No real examinations are registered in the system yet.'
              }
            />
          ) : (
            visibleClusters.map((cluster) => (
              <section
                key={cluster.id}
                className="dept-cluster-section"
                data-testid={`dept-cluster-${cluster.id}`}
              >
                <div className="dept-cluster-header">
                  <div className="dept-cluster-title-wrap">
                    <div className="dept-cluster-icon">
                      <GraduationCap size={22} />
                    </div>
                    <div>
                      <h3>{cluster.name}</h3>
                      <p>Official examinations administered under this academic department</p>
                    </div>
                  </div>
                  <div className="dept-cluster-badges">
                    <span className="dept-badge-pill">
                      <FileText size={13} /> {cluster.exams.length} Real Exam
                      {cluster.exams.length === 1 ? '' : 's'}
                    </span>
                    <span className="dept-badge-pill">
                      <Users size={13} /> {cluster.totalAttempts} Attempt
                      {cluster.totalAttempts === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="real-exams-grid">
                  {cluster.exams.map((exam) => (
                    <div
                      key={exam.id}
                      className="real-exam-card"
                      onClick={() => handleExamClick(exam)}
                      data-testid={`card-real-exam-${exam.id}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleExamClick(exam);
                        }
                      }}
                    >
                      <div className="real-exam-card-head">
                        <span className="real-exam-pill">
                          <span className="real-exam-pulse-dot" /> Real Exam
                        </span>
                        <Status
                          tone={
                            exam.lifecycle_status === 'completed'
                              ? 'green'
                              : exam.lifecycle_status === 'started' ||
                                  exam.lifecycle_status === 'running'
                                ? 'amber'
                                : exam.lifecycle_status === 'ready' ||
                                    exam.lifecycle_status === 'published'
                                  ? 'blue'
                                  : 'neutral'
                          }
                        >
                          {exam.lifecycle_status?.toUpperCase() || 'DRAFT'}
                        </Status>
                      </div>

                      <div className="eyebrow" style={{ marginBottom: 4 }}>
                        {exam.category?.name || 'Academic Assessment'}
                      </div>

                      <h4>{exam.exam_title ?? `Examination #${exam.id}`}</h4>

                      <p className="real-exam-card-desc">
                        {exam.description || 'No detailed instructions or syllabus note provided.'}
                      </p>

                      <div className="real-exam-meta-grid">
                        <div className="real-exam-meta-item">
                          <span className="real-exam-meta-label">
                            <Clock size={11} /> Duration
                          </span>
                          <span className="real-exam-meta-val">
                            {exam.total_time ? `${exam.total_time} min` : '—'}
                          </span>
                        </div>
                        <div className="real-exam-meta-item">
                          <span className="real-exam-meta-label">
                            <CheckCircle2 size={11} /> Pass Mark
                          </span>
                          <span className="real-exam-meta-val">
                            {exam.passing_percentage != null ? `${exam.passing_percentage}%` : '50%'}
                          </span>
                        </div>
                        <div className="real-exam-meta-item">
                          <span className="real-exam-meta-label">
                            <FileText size={11} /> Questions
                          </span>
                          <span className="real-exam-meta-val">
                            {exam.questions_count ?? '—'} Qs
                          </span>
                        </div>
                      </div>

                      <div className="real-exam-card-foot">
                        <span>
                          <strong>{exam.completed_attempts ?? 0}</strong> completed ·{' '}
                          <strong>{exam.assigned_count ?? exam.assigned_students?.length ?? 0}</strong>{' '}
                          assigned
                        </span>
                        <span className="real-exam-cta-btn">
                          View Attempts <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      <div className="bottom-note no-print" style={{ marginTop: 24 }}>
        <BarChart3 size={17} />
        <span>
          Marks, percentages, pass marks and outcomes are calculated by the examination server.
          The pass rate counts only attempts that reached a final outcome — attempts still in
          progress or awaiting manual evaluation are excluded.
        </span>
      </div>
    </>
  );
}
