import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'wouter';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ClipboardList,
  Download,
  FileCheck2,
  Hourglass,
  Percent,
  Printer,
  RotateCcw,
  Search,
  Users,
  ChevronRight,
} from 'lucide-react';
import { adminApi } from '../../lib/endpoints';
import { useAdminExamResults, useAdminResultOptions, useAdminResults } from '../../lib/queries';
import { dateLabel } from '../../lib/format';
import { Button, EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../../components/shell';
import type {
  AdminResultRow,
  AdminResultsFilters,
  AdminResultSort,
  AdminScoreBucket,
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

export function AdminResults() {
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  const urlSearch = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Keep the search box aligned with the URL when the URL changes elsewhere
  // (for example when the browser's back button is used).
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // The search term is debounced before it reaches the server.
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

  const filters = useMemo<AdminResultsFilters>(
    () => ({
      search: urlSearch || undefined,
      exam_id: toInt(params.get('exam_id')),
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
    [params, urlSearch],
  );

  const resultsQuery = useAdminResults(filters);
  const optionsQuery = useAdminResultOptions();
  const examSummaryQuery = useAdminExamResults(filters.exam_id ?? null);

  const options = optionsQuery.data;
  const page = resultsQuery.data;
  const rows = page?.results ?? [];
  const summary = page?.summary;

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

  const clearFilters = () => {
    setSearchInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const activeFilterCount = [
    filters.search,
    filters.exam_id,
    filters.department_id,
    filters.category_id,
    filters.status,
    filters.outcome,
    filters.from_date,
    filters.to_date,
    filters.min_score,
    filters.max_score,
  ].filter((value) => value !== undefined && value !== '').length;

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
      link.download = `results_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.search) parts.push(`Search “${filters.search}”`);
    if (filters.exam_id) {
      const exam = options?.exams.find((item) => item.id === filters.exam_id);
      parts.push(`Exam ${exam ? `“${exam.title}”` : `#${filters.exam_id}`}`);
    }
    if (filters.department_id) {
      const department = options?.departments.find((item) => item.id === filters.department_id);
      parts.push(`Department ${department ? `“${department.name}”` : `#${filters.department_id}`}`);
    }
    if (filters.category_id) {
      const category = options?.categories.find((item) => item.id === filters.category_id);
      parts.push(`Category ${category ? `“${category.name}”` : `#${filters.category_id}`}`);
    }
    if (filters.status) {
      parts.push(`Status ${STATUS_OPTIONS.find((item) => item.value === filters.status)?.label ?? filters.status}`);
    }
    if (filters.outcome) {
      parts.push(`Outcome ${OUTCOME_OPTIONS.find((item) => item.value === filters.outcome)?.label ?? filters.outcome}`);
    }
    if (filters.from_date) parts.push(`From ${filters.from_date}`);
    if (filters.to_date) parts.push(`To ${filters.to_date}`);
    if (filters.min_score !== undefined) parts.push(`Score ≥ ${filters.min_score}%`);
    if (filters.max_score !== undefined) parts.push(`Score ≤ ${filters.max_score}%`);
    return parts.length ? parts.join(' · ') : 'No filters applied — all examination results';
  }, [filters, options]);

  const examSummary = examSummaryQuery.data;
  const currentPage = page?.current_page ?? 1;
  const lastPage = page?.last_page ?? 1;
  const totalRecords = page?.total ?? 0;

  return (
    <>
      <div className="print-only report-header">
        <h1>Examination results report</h1>
        <p>
          Madda Walabu University · Ofijan ExamFlow · generated {dateLabel(new Date())}
        </p>
        <p>{filterSummary}</p>
        <p>
          {totalRecords} attempt(s) · {summary ? `${summary.passed_attempts} passed` : '—'} ·{' '}
          {summary ? `${summary.failed_attempts} failed` : '—'} ·{' '}
          {summary ? `${summary.pending_evaluation_attempts} pending evaluation` : '—'}
        </p>
      </div>

      <PageTitle
        eyebrow="EXAMINATION OUTCOMES"
        title="Results management"
        detail="System-wide examination results, computed and verified by the examination server."
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

      {resultsQuery.isPending && <LoadingBlock label="Loading examination results…" />}

      {resultsQuery.isError && (
        <ErrorBox
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
          retryLabel="Reload"
        />
      )}

      {summary && (
        <div className="dashboard-stats">
          <div className="admin-stat-card">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <ClipboardList size={18} />
              </div>
              <span className="admin-stat-trend neutral">Filtered</span>
            </div>
            <div className="admin-stat-value" data-testid="stat-total-attempts">
              {summary.total_attempts.toLocaleString()}
            </div>
            <div className="admin-stat-label">Total attempts</div>
            <div className="admin-stat-meta">
              {summary.unique_students.toLocaleString()} student(s) took part
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <FileCheck2 size={18} />
              </div>
              <span className="admin-stat-trend neutral">Finalised</span>
            </div>
            <div className="admin-stat-value" data-testid="stat-completed">
              {summary.completed_attempts.toLocaleString()}
            </div>
            <div className="admin-stat-label">Completed attempts</div>
            <div className="admin-stat-meta">
              {summary.in_progress_attempts.toLocaleString()} still in progress
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <Percent size={18} />
              </div>
              <span
                className={`admin-stat-trend ${
                  summary.pass_rate !== null && summary.pass_rate >= 50 ? 'positive' : 'neutral'
                }`}
              >
                {summary.graded_outcomes} graded
              </span>
            </div>
            <div className="admin-stat-value" data-testid="stat-pass-rate">
              {percent(summary.pass_rate)}
            </div>
            <div className="admin-stat-label">Pass rate</div>
            <div className="admin-stat-meta">
              {summary.passed_attempts.toLocaleString()} passed ·{' '}
              {summary.failed_attempts.toLocaleString()} failed
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-header">
              <div className="admin-stat-icon">
                <Hourglass size={18} />
              </div>
              <span className="admin-stat-trend neutral">Review</span>
            </div>
            <div className="admin-stat-value" data-testid="stat-pending">
              {summary.pending_evaluation_attempts.toLocaleString()}
            </div>
            <div className="admin-stat-label">Pending evaluation</div>
            <div className="admin-stat-meta">
              Average score {percent(summary.average_score)}
            </div>
          </div>
        </div>
      )}

      <section className="admin-panel no-print" style={{ marginTop: 16 }}>
        <div className="admin-panel-header">
          <h2>Filters</h2>
          {activeFilterCount > 0 && (
            <button type="button" className="text-link" onClick={clearFilters}>
              <RotateCcw size={13} /> Clear all ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="admin-panel-body">
          <div className="results-filters">
            <div className="filter-field filter-field-wide">
              <label htmlFor="filter-search">Search</label>
              <div className="search-box">
                <input
                  id="filter-search"
                  type="search"
                  placeholder="Student, email, exam or attempt #"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <span>
                  <Search size={15} />
                </span>
              </div>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-exam">Examination</label>
              <select
                id="filter-exam"
                value={filters.exam_id ?? ''}
                onChange={(event) =>
                  updateParam('exam_id', event.target.value || undefined)
                }
              >
                <option value="">All examinations</option>
                {(options?.exams ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-department">Department</label>
              <select
                id="filter-department"
                value={filters.department_id ?? ''}
                onChange={(event) =>
                  updateParam('department_id', event.target.value || undefined)
                }
              >
                <option value="">All departments</option>
                {(options?.departments ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-category">Category</label>
              <select
                id="filter-category"
                value={filters.category_id ?? ''}
                onChange={(event) =>
                  updateParam('category_id', event.target.value || undefined)
                }
              >
                <option value="">All categories</option>
                {(options?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
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
              <label htmlFor="filter-from">Started from</label>
              <input
                id="filter-from"
                type="date"
                value={filters.from_date ?? ''}
                onChange={(event) => updateParam('from_date', event.target.value || undefined)}
              />
            </div>

            <div className="filter-field">
              <label htmlFor="filter-to">Started until</label>
              <input
                id="filter-to"
                type="date"
                value={filters.to_date ?? ''}
                onChange={(event) => updateParam('to_date', event.target.value || undefined)}
              />
            </div>

            <div className="filter-field">
              <label htmlFor="filter-min-score">Minimum score (%)</label>
              <input
                id="filter-min-score"
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="0"
                value={filters.min_score ?? ''}
                onChange={(event) => updateParam('min_score', event.target.value || undefined)}
              />
            </div>

            <div className="filter-field">
              <label htmlFor="filter-max-score">Maximum score (%)</label>
              <input
                id="filter-max-score"
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="100"
                value={filters.max_score ?? ''}
                onChange={(event) => updateParam('max_score', event.target.value || undefined)}
              />
            </div>
          </div>
        </div>
      </section>

      {filters.exam_id !== undefined && examSummary && (
        <section className="admin-panel" style={{ marginTop: 16 }}>
          <div className="admin-panel-header">
            <h2>{examSummary.exam.title ?? `Examination #${examSummary.exam.id}`}</h2>
            <span className="admin-panel-badge">{examSummary.attempts} attempt(s)</span>
          </div>
          <div className="admin-panel-body exam-summary-body">
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
            <div>
              <div className="eyebrow">SCORE DISTRIBUTION</div>
              <ScoreDistribution buckets={examSummary.score_distribution} />
            </div>
          </div>
        </section>
      )}

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <div className="admin-panel-header">
          <h2>Results</h2>
          <span className="admin-panel-badge">
            {totalRecords.toLocaleString()} record(s)
          </span>
        </div>

        {resultsQuery.isPending ? null : rows.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 size={23} />}
            title="No results match these filters"
            description="Adjust or clear the filters to see the examination attempts recorded by the server."
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
                  <SortableHeader
                    label="Examination"
                    column="exam"
                    filters={filters}
                    onSort={toggleSort}
                  />
                  <th>Status</th>
                  <SortableHeader label="Score" column="score" filters={filters} onSort={toggleSort} />
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-testid={`row-result-${row.id}`}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {(row.student.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="user-info">
                          <strong>{row.student.name ?? `Student #${row.student.id}`}</strong>
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
                      <strong>{row.exam.title ?? `Examination #${row.exam.id}`}</strong>
                      <small>
                        {row.exam.category_name ?? '—'}
                        {row.exam.department_name ? ` · ${row.exam.department_name}` : ''}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {ATTEMPT_STATUS_LABEL[row.status ?? ''] ?? (row.status ?? '—')}
                      </strong>
                      <small>
                        Attempt #{row.id}
                        {row.auto_submitted ? ' · auto-submitted' : ''}
                        {row.attempt_state ? ` · ${row.attempt_state}` : ''}
                      </small>
                    </td>
                    <td>
                      <div className="result-score-cell">
                        <strong data-testid={`score-${row.id}`}>
                          {row.percentage !== null ? `${row.percentage}%` : '—'}
                        </strong>
                        <small>
                          {row.marks_obtained}
                          {row.max_marks !== null ? ` / ${row.max_marks}` : ''} marks
                        </small>
                        {row.percentage !== null && (
                          <span
                            className={`result-score-bar ${
                              row.outcome === 'passed'
                                ? 'pass'
                                : row.outcome === 'failed'
                                  ? 'fail'
                                  : ''
                            }`}
                          >
                            <i
                              style={{
                                width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                              }}
                            />
                          </span>
                        )}
                      </div>
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
                      <Link
                        href={`/admin/results/${row.id}`}
                        className="text-link"
                        data-testid={`link-result-${row.id}`}
                      >
                        Review <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
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

      <div className="bottom-note no-print">
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
