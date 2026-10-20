import {
  Activity,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  Users,
} from 'lucide-react';
import { Link } from 'wouter';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../components/shell';
import { useAuth } from '../lib/auth';
import { useExams } from '../lib/queries';

const statusTone = (status?: string | null) => {
  switch ((status ?? '').toLowerCase()) {
    case 'ready':
    case 'running':
      return 'green' as const;
    case 'completed':
      return 'purple' as const;
    case 'cancelled':
      return 'red' as const;
    default:
      return 'amber' as const;
  }
};

export function RoleDashboard() {
  const { user } = useAuth();
  const role = user?.role_slug === 'admin' ? 'Administrator' : 'Teacher';
  const examsQuery = useExams(1, '');
  const exams = examsQuery.data?.data ?? [];
  const pending = examsQuery.isPending;
  const counts = exams.reduce<Record<string, number>>((result, exam) => {
    const key = (exam.lifecycle_status ?? 'draft').toLowerCase();
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});

  return (
    <>
      <PageTitle
        eyebrow={`${role.toUpperCase()} WORKSPACE`}
        title={`Welcome back, ${(user?.name ?? role).split(' ')[0]}`}
        detail="Operational data is loaded from the examination server. Permissions remain enforced by the backend."
        action={<Link href="/exams" className="button button-primary"><FilePlus2 size={16} /> Manage examinations</Link>}
      />

      {pending && <LoadingBlock label="Loading examination activity…" />}
      {!pending && examsQuery.isError && <ErrorBox error={examsQuery.error} onRetry={() => void examsQuery.refetch()} />}
      {!pending && !examsQuery.isError && (
        <>
          <div className="stat-grid role-stat-grid">
            <div className="stat-card"><div className="stat-top"><span className="stat-icon"><ClipboardList size={18} /></span><span>Examinations</span></div><strong>{exams.length}</strong><small>Visible in your authorized scope</small></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-icon"><Activity size={18} /></span><span>Running</span></div><strong>{counts.running ?? 0}</strong><small>Currently accepting attempts</small></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-icon"><CheckCircle2 size={18} /></span><span>Completed</span></div><strong>{counts.completed ?? 0}</strong><small>Closed examinations</small></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-icon"><Users size={18} /></span><span>Account</span></div><strong>{user?.is_active === false ? 'Off' : 'On'}</strong><small>{user?.department ?? 'Institution-wide access'}</small></div>
          </div>

          <div className="dashboard-columns">
            <section className="panel upcoming-panel">
              <div className="section-head"><div><div className="eyebrow">AUTHORIZED ACTIVITY</div><h2>Examinations</h2></div><BookOpenCheck size={18} className="subtle-icon" /></div>
              {exams.length ? exams.slice(0, 8).map((exam) => (
                <div className="exam-row" key={exam.id}>
                  <div className="exam-row-main"><strong>{exam.exam_title}</strong><span>{exam.department?.name ?? 'Institution examination'} <i /> {exam.total_time} minutes</span></div>
                  <Status tone={statusTone(exam.lifecycle_status)}>{exam.lifecycle_status ?? 'Draft'}</Status>
                </div>
              )) : <EmptyState icon={<ClipboardList size={22} />} title="No examinations available" description="Create or request access to an examination through the authorized backend workflow." />}
            </section>
            <section className="panel notifications-panel">
              <div className="section-head"><div><div className="eyebrow">ROLE SCOPE</div><h2>Access boundaries</h2></div><GraduationCap size={18} className="subtle-icon" /></div>
              <div className="bottom-note role-note"><strong>{role} account</strong><span>{user?.department ? `Home department: ${user.department}.` : 'No home department is recorded.'} Target departments and student records are returned only when the backend authorizes them.</span></div>
              <div className="bottom-note role-note"><strong>Missing capabilities are not simulated</strong><span>Department management, assignment, grading, and exports will appear here once the corresponding protected API contracts are available.</span></div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
