import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
} from 'lucide-react';
import { Link } from 'wouter';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../components/shell';
import { useAuth } from '../lib/auth';
import { dateLabel } from '../lib/format';
import {
  getStudentExamState,
  stateAction,
  stateTone,
  type ExamStudentState,
} from '../lib/examState';
import { useExams, useMyAttempts, useNotifications } from '../lib/queries';
import type { Attempt, Exam } from '../lib/types';

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function ExamRow({ exam, attempts }: { exam: Exam; attempts: Attempt[] }) {
  const state = getStudentExamState(exam, attempts);
  return (
    <div className="exam-row">
      <div className="exam-date">
        <CalendarDays size={17} />
        <span>
          {exam.active_from
            ? dateLabel(exam.active_from, { month: 'short', day: '2-digit' })
            : '—'}
        </span>
      </div>
      <div className="exam-row-main">
        <strong>{exam.exam_title}</strong>
        <span>
          {exam.course?.name ?? exam.category?.name ?? 'Examination'}
          <i /> {exam.total_time} minutes
        </span>
      </div>
      <Status tone={stateTone(state)}>{state}</Status>
      <Link
        href={`/exams/${exam.id}`}
        className="row-arrow"
        aria-label={`View ${exam.exam_title}`}
        data-testid={`link-exam-${exam.id}`}
      >
        <ChevronRight size={18} />
      </Link>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const examsQuery = useExams(1, '', user?.department_id ?? null);
  const attemptsQuery = useMyAttempts();
  const notificationsQuery = useNotifications();

  const attempts = attemptsQuery.data ?? [];
  const allExams = examsQuery.data?.data ?? [];

  // The backend only lets a student OPEN an exam from their own department
  // (department content) or a department-less national exam — mirror that
  // rule for what the dashboard highlights.
  const exams = allExams.filter(
    (exam) =>
      !exam.department_id ||
      !user?.department_id ||
      Number(exam.department_id) === Number(user.department_id),
  );

  const states = exams.map((exam) => ({
    exam,
    state: getStudentExamState(exam, attempts, user?.department_id ?? null),
  }));

  const count = (state: ExamStudentState) =>
    states.filter((item) => item.state === state).length;
  const completedCount = count('Completed');
  const inProgressCount = count('In Progress');

  const nextExam = states
    .filter((item) => ['Available', 'In Progress', 'Upcoming'].includes(item.state))
    .sort((a, b) => {
      const order: Record<string, number> = { 'In Progress': 0, Available: 1, Upcoming: 2 };
      const rank = order[a.state] - order[b.state];
      if (rank !== 0) return rank;
      return (
        Date.parse(a.exam.active_from ?? '2999-01-01') -
        Date.parse(b.exam.active_from ?? '2999-01-01')
      );
    })[0];

  const schedule = states
    .filter((item) => ['Upcoming', 'Available', 'In Progress'].includes(item.state))
    .sort(
      (a, b) =>
        Date.parse(a.exam.active_from ?? '2999-01-01') -
        Date.parse(b.exam.active_from ?? '2999-01-01'),
    )
    .slice(0, 4);

  const firstName = (user?.name ?? 'Student').split(' ')[0];
  const notifications = notificationsQuery.data ?? [];
  const loading = examsQuery.isPending || attemptsQuery.isPending;

  return (
    <>
      <PageTitle
        eyebrow="STUDENT OVERVIEW"
        title={`Good day, ${firstName}`}
        detail="Your examination activity, fetched live from the university server."
      />

      {loading && <LoadingBlock label="Loading your examinations…" />}

      {!loading && (examsQuery.isError || attemptsQuery.isError) && (
        <ErrorBox
          error={examsQuery.error ?? attemptsQuery.error}
          onRetry={() => {
            void examsQuery.refetch();
            void attemptsQuery.refetch();
          }}
          retryLabel="Reload"
        />
      )}

      {!loading && !examsQuery.isError && !attemptsQuery.isError && (
        <>
          {!user?.department_id && (
            <div className="bottom-note" role="status">
              <Clock3 size={17} />
              <span>
                Your profile has no department selected yet. Complete your student profile before
                opening department-specific examinations.
              </span>
            </div>
          )}

          {nextExam ? (
            <section className="welcome-strip">
              <div className="welcome-icon">
                <CalendarDays size={22} />
              </div>
              <div>
                <span className="strip-kicker">YOUR NEXT ASSESSMENT</span>
                <strong>{nextExam.exam.exam_title}</strong>
                <span>
                  {nextExam.state === 'In Progress'
                    ? 'Attempt in progress · Resume when ready'
                    : nextExam.state === 'Available'
                      ? `Open now${nextExam.exam.active_until ? ` · Closes ${dateLabel(nextExam.exam.active_until)}` : ''}`
                      : nextExam.exam.active_from
                        ? `Scheduled for ${dateLabel(nextExam.exam.active_from)}`
                        : 'Scheduled'}
                </span>
              </div>
              <Link
                href={`/exams/${nextExam.exam.id}`}
                data-testid="link-next-exam"
                className="button button-light"
              >
                {stateAction(nextExam.state)} <ChevronRight size={16} />
              </Link>
            </section>
          ) : (
            <section className="dashboard-empty">
              <CalendarDays size={22} />
              <div>
                <strong>No upcoming assessments</strong>
                <span>Your assigned examination schedule is clear for now.</span>
              </div>
              <Link href="/exams" className="text-link" data-testid="link-empty-exams">
                View all assessments <ChevronRight size={15} />
              </Link>
            </section>
          )}

          <div className="stat-grid">
            <Stat
              icon={<CalendarDays size={18} />}
              label="Upcoming"
              value={String(count('Upcoming')).padStart(2, '0')}
              note="Scheduled to open later"
            />
            <Stat
              icon={<FileText size={18} />}
              label="Available"
              value={String(count('Available')).padStart(2, '0')}
              note="Ready to begin"
            />
            <Stat
              icon={<Clock3 size={18} />}
              label="In progress"
              value={String(inProgressCount).padStart(2, '0')}
              note="Attempts currently underway"
            />
            <Stat
              icon={<Check size={18} />}
              label="Completed"
              value={String(completedCount).padStart(2, '0')}
              note="Submitted attempts"
            />
          </div>

          <div className="dashboard-columns">
            <section className="panel upcoming-panel">
              <div className="section-head">
                <div>
                  <div className="eyebrow">ASSESSMENT SCHEDULE</div>
                  <h2>Coming up</h2>
                </div>
                <Link href="/exams" className="text-link" data-testid="link-all-exams">
                  All assessments <ChevronRight size={15} />
                </Link>
              </div>
              {schedule.length ? (
                schedule.map(({ exam }) => <ExamRow exam={exam} attempts={attempts} key={exam.id} />)
              ) : (
                <EmptyState
                  icon={<CalendarDays size={22} />}
                  title="Nothing scheduled"
                  description="There are no upcoming or active assessments right now."
                />
              )}
            </section>

            <section className="panel notifications-panel">
              <div className="section-head">
                <div>
                  <div className="eyebrow">PORTAL UPDATES</div>
                  <h2>Notifications</h2>
                </div>
                <Bell size={18} className="subtle-icon" />
              </div>
              {notificationsQuery.isPending ? (
                <LoadingBlock label="Loading notifications…" />
              ) : notificationsQuery.isError ? (
                <ErrorBox
                  error={notificationsQuery.error}
                  onRetry={() => void notificationsQuery.refetch()}
                />
              ) : notifications.length ? (
                <div className="notification-list">
                  {notifications.map((note) => (
                    <div className="notification-row" key={note.id} data-testid={`notification-${note.id}`}>
                      <span className="notification-dot" />
                      <span>
                        <strong>{note.title ?? 'Notification'}</strong>
                        <small>{note.message ?? ''}</small>
                      </span>
                      <ChevronRight size={15} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Bell size={20} />}
                  title="No notifications"
                  description="Updates about your examinations will appear here."
                />
              )}
            </section>
          </div>

          <div className="bottom-note">
            <FileCheck2 size={17} />
            <span>
              <strong>Assessment integrity</strong> — Attempts, timers and grades are enforced by
              the examination server. Closing this window does not stop an official countdown.
            </span>
          </div>
        </>
      )}
    </>
  );
}
