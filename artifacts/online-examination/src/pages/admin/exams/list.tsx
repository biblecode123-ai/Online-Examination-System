import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Eye,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../../../components/shell';
import {
  PHASE_LABEL,
  PHASE_TONE,
  examPhase,
  fmtDay,
  fmtMinutes,
} from './logic';
import type { AdminRealExam } from '../../../lib/types';

const PER_PAGE = 10;

type SortKey = 'created' | 'updated' | 'title' | 'questions' | 'status' | 'students';

const SORT_LABEL: Record<SortKey, string> = {
  created: 'Created date',
  updated: 'Last updated',
  title: 'Exam title',
  questions: 'Questions',
  status: 'Status',
  students: 'Assigned students',
};

/** Lazily sums the question points of one exam (marks are not in the list payload). */
function MarksCell({ examId, questionsCount }: { examId: number; questionsCount: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-exam-marks', examId],
    queryFn: ({ signal }) => adminExamApi.examQuestions(examId, signal),
    staleTime: 30_000,
    retry: 1,
    enabled: questionsCount > 0,
  });
  if (!questionsCount) return <span>—</span>;
  if (isLoading) return <span className="text-muted">…</span>;
  if (isError || !data) return <span className="text-muted" title="Marks unavailable">—</span>;
  const total = data.items.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
  return <span>{total}</span>;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function AdminExams() {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const examsQuery = useQuery({
    queryKey: ['admin-exams', 'list'],
    queryFn: ({ signal }) => adminExamApi.listExams(signal),
  });
  const metaQuery = useQuery({
    queryKey: ['admin-exams', 'content-meta'],
    queryFn: ({ signal }) => adminExamApi.listContentMeta(signal),
    retry: false,
  });
  const deptQuery = useQuery({
    queryKey: ['admin-exams', 'departments'],
    queryFn: ({ signal }) => adminExamApi.departments(signal),
    staleTime: 5 * 60_000,
  });
  const catQuery = useQuery({
    queryKey: ['admin-exams', 'categories'],
    queryFn: ({ signal }) => adminExamApi.categories(signal),
    staleTime: 5 * 60_000,
  });

  const meta = metaQuery.data ?? {};
  const deptName = (id?: number | null) =>
    deptQuery.data?.find((d) => d.id === id)?.name ?? (id ? `Department #${id}` : '—');

  /** Merged list: governed decorate + created/updated dates from /content/exams. */
  const merged: AdminRealExam[] = useMemo(
    () =>
      (examsQuery.data?.items ?? []).map((exam) => ({
        ...exam,
        created_at: meta[exam.id]?.created_at ?? exam.created_at ?? null,
        updated_at: meta[exam.id]?.updated_at ?? exam.updated_at ?? null,
      })),
    [examsQuery.data, meta],
  );

  const stats = useMemo(() => {
    const counts = { draft: 0, published: 0, scheduled: 0, running: 0, completed: 0, unknown: 0 };
    let questions = 0;
    let students = 0;
    for (const exam of merged) {
      counts[examPhase(exam)] += 1;
      questions += exam.questions_count ?? 0;
      students += exam.assigned_count ?? 0;
    }
    return { total: merged.length, ...counts, questions, students };
  }, [merged]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = merged.filter((exam) => {
      if (needle && !exam.exam_title.toLowerCase().includes(needle)) return false;
      if (deptFilter && String(exam.department_id ?? '') !== deptFilter) return false;
      if (catFilter && String(exam.category?.id ?? '') !== catFilter) return false;
      if (statusFilter && examPhase(exam) !== statusFilter) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.exam_title.localeCompare(b.exam_title) * dir;
        case 'questions':
          return ((a.questions_count ?? 0) - (b.questions_count ?? 0)) * dir;
        case 'students':
          return ((a.assigned_count ?? 0) - (b.assigned_count ?? 0)) * dir;
        case 'status':
          return examPhase(a).localeCompare(examPhase(b)) * dir;
        case 'updated':
          return (
            (Date.parse(a.updated_at ?? '') || 0) - (Date.parse(b.updated_at ?? '') || 0)
          ) * dir;
        case 'created':
        default:
          return (Date.parse(a.created_at ?? '') || 0) - (Date.parse(b.created_at ?? '') || 0) * dir;
      }
    });
    return rows;
  }, [merged, search, deptFilter, catFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  if (examsQuery.isLoading) {
    return (
      <div className="page">
        <PageTitle eyebrow="ADMIN PORTAL" title="Exam management" detail="Loading examinations…" />
        <div className="card">
          <div className="card-body">
            <LoadingBlock label="Loading examinations…" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle
        eyebrow="ADMIN PORTAL"
        title="Exam management"
        detail="Create, publish and oversee every official examination"
        action={
          <div className="button-group">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void examsQuery.refetch()}
              disabled={examsQuery.isFetching}
              data-testid="button-refresh-exams"
            >
              <RefreshCw size={15} className={examsQuery.isFetching ? 'spin-once' : ''} /> Refresh
            </button>
            <Link href="/admin/exams/new" className="button button-primary" data-testid="button-new-exam">
              <Plus size={16} /> Create exam
            </Link>
          </div>
        }
      />

      <ErrorBox
        error={examsQuery.error}
        onRetry={() => void examsQuery.refetch()}
        testId="exams-error"
      />

      <div className="exam-stats-grid">
        <StatCard label="Total exams" value={stats.total} />
        <StatCard label="Drafts" value={stats.draft} />
        <StatCard label="Published" value={stats.published} />
        <StatCard label="Scheduled" value={stats.scheduled} />
        <StatCard label="Running" value={stats.running} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Total questions" value={stats.questions} />
        <StatCard label="Assigned students" value={stats.students} />
      </div>

      <div className="card">
        <div className="card-header exam-filter-bar">
          <div className="search-bar">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search by exam title…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search exams by title"
              data-testid="input-search-exams"
            />
          </div>
          <select
            className="select"
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by department"
            data-testid="select-filter-department"
          >
            <option value="">All departments</option>
            {(deptQuery.data ?? []).map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={catFilter}
            onChange={(e) => {
              setCatFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by category"
            data-testid="select-filter-category"
          >
            <option value="">All categories</option>
            {(catQuery.data ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            data-testid="select-filter-status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
          </select>
          <select
            className="select"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':');
              setSortKey(key as SortKey);
              setSortDir(dir as 'asc' | 'desc');
              setPage(1);
            }}
            aria-label="Sort exams"
            data-testid="select-sort-exams"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <optgroup key={key} label={SORT_LABEL[key]}>
                <option value={`${key}:desc`}>{SORT_LABEL[key]} — newest first</option>
                <option value={`${key}:asc`}>{SORT_LABEL[key]} — oldest first</option>
              </optgroup>
            ))}
          </select>
        </div>

        <div className="card-body">
          {visible.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={26} />}
              title={merged.length === 0 ? 'No examinations yet' : 'No exams match your filters'}
              description={
                merged.length === 0
                  ? 'Create the first official Real Exam for your departments.'
                  : 'Adjust the search or filters to find the exam you are looking for.'
              }
            />
          ) : (
            <>
              <div className="table-wrapper">
                <table className="table" data-testid="table-admin-exams">
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Category</th>
                      <th>Department</th>
                      <th className="num">Questions</th>
                      <th className="num">Marks</th>
                      <th>Duration</th>
                      <th className="num">Students</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((exam) => {
                      const phase = examPhase(exam);
                      return (
                        <tr key={exam.id} data-testid={`row-exam-${exam.id}`}>
                          <td>
                            <Link href={`/admin/exams/${exam.id}`} className="text-link" data-testid={`link-exam-${exam.id}`}>
                              {exam.exam_title}
                            </Link>
                            {exam.has_password && (
                              <small className="row-subtext">
                                <Users size={11} /> password set
                              </small>
                            )}
                          </td>
                          <td>{exam.category?.name ?? '—'}</td>
                          <td>{deptName(exam.department_id)}</td>
                          <td className="num">{exam.questions_count ?? 0}</td>
                          <td className="num">
                            <MarksCell examId={exam.id} questionsCount={exam.questions_count ?? 0} />
                          </td>
                          <td>{fmtMinutes(exam.total_time)}</td>
                          <td className="num">{exam.assigned_count ?? 0}</td>
                          <td>
                            <Status tone={PHASE_TONE[phase]} testId={`status-exam-${exam.id}`}>
                              {PHASE_LABEL[phase]}
                            </Status>
                          </td>
                          <td>{fmtDay(exam.created_at)}</td>
                          <td>{fmtDay(exam.updated_at)}</td>
                          <td>
                            <div className="button-group">
                              <Link
                                href={`/admin/exams/${exam.id}`}
                                className="icon-button"
                                title="View / manage exam"
                                data-testid={`button-manage-${exam.id}`}
                              >
                                <Eye size={15} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="table-pagination">
                <small>
                  {filtered.length} exam{filtered.length === 1 ? '' : 's'}
                  {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
                </small>
                {totalPages > 1 && (
                  <div className="button-group">
                    <button
                      type="button"
                      className="button button-quiet button-sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                      data-testid="button-next-page"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
