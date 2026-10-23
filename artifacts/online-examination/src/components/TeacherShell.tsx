import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { useNotifications } from '../lib/queries';
import {
  Bell,
  ChevronRight,
  FilePlus,
  FileText,
  Users,
  CheckCircle,
  LogOut,
  Menu,
  GraduationCap,
  UserRound,
  Settings,
} from 'lucide-react';

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
    href === '/teacher'
      ? location === '/teacher' || location === '/teacher/'
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
                <small>Updates will appear here.</small>
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
  const name = user?.name ?? 'Teacher';

  return (
    <div className="header-menu-wrap">
      <button
        type="button"
        className={`profile-menu-trigger ${open ? 'header-action-active' : ''}`}
        aria-label="Open teacher profile menu"
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
            href="/teacher/profile"
            className="popover-link"
            data-testid="link-header-profile"
            onClick={() => setOpen(false)}
          >
            <UserRound size={16} /> Teacher profile
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

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => setMobileMenu(false), [location]);

  const name = user?.name ?? 'Teacher';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <Link href="/teacher" className="brand" data-testid="link-brand">
          <span className="brand-mark">
            <GraduationCap size={21} />
          </span>
          <span>
            <strong>OFIJANA</strong>
            <small>Teacher Portal</small>
          </span>
        </Link>
        <div className="nav-caption">TEACHER SPACE</div>
        <nav className="main-nav" aria-label="Teacher navigation">
          <NavLink href="/teacher" icon={<FileText size={18} />} label="My Exams" />
          <NavLink href="/teacher/create" icon={<FilePlus size={18} />} label="Create Exam" />
          <NavLink href="/teacher/assignments" icon={<Users size={18} />} label="Assignments" />
          <NavLink href="/teacher/grading" icon={<CheckCircle size={18} />} label="Grading" />
          <NavLink href="/teacher/profile" icon={<UserRound size={18} />} label="Profile" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="prototype-note">
          <GraduationCap size={16} />
            <strong>Teacher Dashboard</strong>
            <br />
            <small>Exam creation & management</small>
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
            Teacher portal <span>/</span>{' '}
            <b>{location.split('/')[2]?.replace('-', ' ') || 'exams'}</b>
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
          <span>OFIJANA · Online Examination System</span>
          <span>Powered by OFIJANA Examination Server</span>
        </footer>
      </main>
    </div>
  );
}
