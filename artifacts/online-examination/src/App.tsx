import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  FileText,
  FileCheck2,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from './lib/auth';
import { initials } from './lib/format';
import { useNotifications } from './lib/queries';
import { Login } from './pages/login';
import { Dashboard } from './pages/dashboard';
import { ExamList } from './pages/exams';
import { ExamDetails } from './pages/exam-details';
import { ExamAttempt } from './pages/attempt';
import { Submission } from './pages/submission';
import { ResultsPage, ResultDetails } from './pages/results';
import { HistoryPage } from './pages/history';
import { Profile } from './pages/profile';
import { AdminShell } from './components/AdminShell';
import { TeacherShell } from './components/TeacherShell';
import { AdminDashboard } from './pages/admin/dashboard';
import { AdminUsers } from './pages/admin/users';
import { AdminDepartments } from './pages/admin/departments';
import { AdminExams } from './pages/admin/exams';
import { AdminResults } from './pages/admin/results';
import { AdminResultDetail } from './pages/admin/result-detail';
import { TeacherDashboard } from './pages/teacher/dashboard';
import { TeacherCreateExam } from './pages/teacher/create-exam';
import { TeacherAssignments } from './pages/teacher/assignments';
import { TeacherGrading } from './pages/teacher/grading';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

function NavLink({
  href,
  icon,
  label,
  testId,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  testId?: string;
}) {
  const [location] = useLocation();
  const active =
    href === '/dashboard'
      ? location === '/' || location === href
      : location === href || location.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      data-testid={testId ?? `link-nav-${href.slice(1)}`}
      className={`nav-link ${active ? 'nav-active' : ''}`}
    >
      {icon}
      <span>{label}</span>
      {active && <i />}
    </Link>
  );
}

function HeaderNotifications() {
  const [open, setOpen] = useState(false);
  const query = useNotifications();
  const notifications = query.data ?? [];

  return (
    <div className="header-menu-wrap">
      <button
        type="button"
        className={`header-action ${open ? 'header-action-active' : ''}`}
        aria-label="Notifications"
        aria-expanded={open}
        data-testid="button-notifications"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {notifications.length > 0 && (
          <span className="notification-count">{notifications.length}</span>
        )}
      </button>
      {open && (
        <div className="header-popover notification-popover">
          <div className="popover-head">
            <strong>Notifications</strong>
            <small>From Ofijan ExamFlow</small>
          </div>
          {notifications.length === 0 ? (
            <div className="popover-notification">
              <span>
                <strong>No notifications</strong>
                <small>Updates about your exams will appear here.</small>
              </span>
            </div>
          ) : (
            notifications.map((note) => (
              <div className="popover-notification" key={note.id} data-testid={`header-notification-${note.id}`}>
                <span className="notification-dot" />
                <span>
                  <strong>{note.title ?? 'Notification'}</strong>
                  <small>{note.time_ago ?? ''} · {note.message ?? ''}</small>
                </span>
                <ChevronRight size={15} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function HeaderProfileMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const name = user?.name ?? 'Student';

  return (
    <div className="header-menu-wrap">
      <button
        type="button"
        className={`profile-menu-trigger ${open ? 'header-action-active' : ''}`}
        aria-label="Open student profile menu"
        aria-expanded={open}
        data-testid="button-profile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="topbar-avatar">{initials(name)}</span>
        <span className="profile-trigger-name">{name.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="header-popover profile-popover">
          <div className="popover-profile">
            <span className="topbar-avatar">{initials(name)}</span>
            <span>
              <strong>{name}</strong>
              <small>{user?.email ?? ''}</small>
            </span>
          </div>
          <Link
            href="/profile"
            className="popover-link"
            data-testid="link-header-profile"
            onClick={() => setOpen(false)}
          >
            <UserRound size={16} /> Student profile
          </Link>
          <button
            type="button"
            className="popover-link"
            data-testid="button-header-sign-out"
            onClick={onLogout}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="not-found">
      <div className="empty-symbol">404</div>
      <h1>Page not found</h1>
      <p>The page you are looking for is not available in this student portal.</p>
      <Link href="/dashboard" className="button button-primary" data-testid="link-not-found-home">
        Back to overview
      </Link>
    </div>
  );
}

function LoadingSplash() {
  return (
    <div className="login-page">
      <div className="login-form-area">
        <div className="login-form" role="status" aria-live="polite">
          <div className="eyebrow">STUDENT EXAMINATION PORTAL</div>
          <h2>Restoring your session…</h2>
          <div className="loading-block">
            <span className="spinner" aria-hidden="true" />
            Contacting the examination server
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => setMobileMenu(false), [location]);

  const name = user?.name ?? 'Student';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <Link href="/dashboard" className="brand" data-testid="link-brand">
          <span className="brand-mark">
            <GraduationCap size={21} />
          </span>
          <span>
            <strong>Ofijan ExamFlow</strong>
            <small>Madda Walabu University</small>
          </span>
        </Link>
        <div className="nav-caption">STUDENT SPACE</div>
        <nav className="main-nav" aria-label="Student navigation">
          <NavLink href="/dashboard" icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavLink href="/exams" icon={<FileText size={18} />} label="My examinations" />
          <NavLink href="/results" icon={<FileCheck2 size={18} />} label="Results" />
          <NavLink href="/history" icon={<History size={18} />} label="Attempt history" />
          <NavLink href="/profile" icon={<UserRound size={18} />} label="My profile" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="prototype-note">
          <ShieldCheck size={16} />
            <strong>Secure ExamFlow portal</strong>
            <br />
            <small>Server-enforced timers &amp; grading</small>
        </div>
        <div className="sidebar-student">
          <div className="avatar">{initials(name)}</div>
          <div className="student-identity">
            <strong>{name}</strong>
            <small>{user?.email ?? ''}</small>
          </div>
          <button
            type="button"
            className="icon-button logout"
            aria-label="Sign out"
            data-testid="button-sign-out"
            onClick={() => void logout()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileMenu && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            data-testid="button-open-menu"
            onClick={() => setMobileMenu((value) => !value)}
          >
            <Menu size={20} />
          </button>
          <div className="crumb">
            Student portal <span>/</span>{' '}
            <b>{location.split('/')[1]?.replace('-', ' ') || 'overview'}</b>
          </div>
          <div className="topbar-right">
            <span className="prototype-pill">
              <i /> LIVE API
            </span>
            <HeaderNotifications />
            <HeaderProfileMenu onLogout={() => void logout()} />
          </div>
        </header>

        <div className="content-area">{children}</div>

        <footer className="footer">
          <span>Madda Walabu University · Ofijan ExamFlow</span>
          <span>Powered by the Ofijan examination server</span>
        </footer>
      </main>
    </div>
  );
}

function RouterRoot() {
  const { status, user } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (status === 'anonymous' && location !== '/login') setLocation('/login');
    if (status === 'authenticated' && location === '/login') {
      // Redirect based on role
      const role = user?.role_slug;
      if (role === 'admin') setLocation('/admin');
      else if (role === 'teacher') setLocation('/teacher');
      else setLocation('/dashboard');
    }
  }, [status, location, setLocation, user]);

  if (status === 'loading') return <LoadingSplash />;

  if (status === 'anonymous') {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <Login />
        </Route>
      </Switch>
    );
  }

  const role = user?.role_slug;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  // Admin routes
  if (isAdmin && location.startsWith('/admin')) {
    return (
      <AdminShell>
        <Switch>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/departments" component={AdminDepartments} />
          <Route path="/admin/exams" component={AdminExams} />
          <Route path="/admin/results" component={AdminResults} />
          <Route path="/admin/results/:attemptId" component={AdminResultDetail} />
          <Route path="/admin/profile" component={Profile} />
          <Route path="/admin/:rest*" component={AdminDashboard} />
          <Route component={NotFound} />
        </Switch>
      </AdminShell>
    );
  }

  // Teacher routes
  if (isTeacher && location.startsWith('/teacher')) {
    return (
      <TeacherShell>
        <Switch>
          <Route path="/teacher" component={TeacherDashboard} />
          <Route path="/teacher/create" component={TeacherCreateExam} />
          <Route path="/teacher/assignments" component={TeacherAssignments} />
          <Route path="/teacher/grading" component={TeacherGrading} />
          <Route path="/teacher/profile" component={Profile} />
          <Route path="/teacher/:rest*" component={TeacherDashboard} />
          <Route component={NotFound} />
        </Switch>
      </TeacherShell>
    );
  }

  // Student routes
  if (isStudent) {
    const isAttemptRoute = /^\/exams\/[^/]+\/attempt\/[^/]+$/.test(location);
    if (isAttemptRoute) {
      return (
        <Switch>
          <Route path="/exams/:examId/attempt/:attemptId" component={ExamAttempt} />
          <Route component={NotFound} />
        </Switch>
      );
    }

    return (
      <PortalShell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/login" component={Login} />
          <Route path="/exams" component={ExamList} />
          <Route path="/exams/:examId/attempt/:attemptId" component={ExamAttempt} />
          <Route path="/exams/:examId/submission/:attemptId" component={Submission} />
          <Route path="/exams/:examId" component={ExamDetails} />
          <Route path="/results" component={ResultsPage} />
          <Route path="/results/:attemptId" component={ResultDetails} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/profile" component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </PortalShell>
    );
  }

  // Fallback for unknown roles
  return <NotFound />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterRoot />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
