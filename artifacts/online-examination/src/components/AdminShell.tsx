import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { useNotifications } from '../lib/queries';
import {
  Bell,
  ChevronRight,
  Users,
  Building2,
  FileText,
  BarChart3,
  LogOut,
  Menu,
  ShieldCheck,
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
    href === '/admin'
      ? location === '/admin' || location === '/admin/'
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
  const name = user?.name ?? 'Admin';

  return (
    <div className="header-menu-wrap">
      <button
        type="button"
        className={`profile-menu-trigger ${open ? 'header-action-active' : ''}`}
        aria-label="Open admin profile menu"
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
            href="/admin/profile"
            className="popover-link"
            data-testid="link-header-profile"
            onClick={() => setOpen(false)}
          >
            <UserRound size={16} /> Admin profile
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => setMobileMenu(false), [location]);

  const name = user?.name ?? 'Admin';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <Link href="/admin" className="brand" data-testid="link-brand">
          <span className="brand-mark">
            <ShieldCheck size={21} />
          </span>
          <span>
            <strong>OFIJANA</strong>
            <small>Administrator Portal</small>
          </span>
        </Link>
        <div className="nav-caption">ADMINISTRATION</div>
        <nav className="main-nav" aria-label="Admin navigation">
          <NavLink href="/admin" icon={<BarChart3 size={18} />} label="Overview" />
          <NavLink href="/admin/users" icon={<Users size={18} />} label="Accounts" />
          <NavLink href="/admin/departments" icon={<Building2 size={18} />} label="Departments" />
          <NavLink href="/admin/exams" icon={<FileText size={18} />} label="Exams" />
          <NavLink href="/admin/results" icon={<BarChart3 size={18} />} label="Results" />
          <NavLink href="/admin/settings" icon={<Settings size={18} />} label="Settings" />
        </nav>
        <div className="sidebar-spacer" />
        <div className="prototype-note">
          <ShieldCheck size={16} />
            <strong>Admin Dashboard</strong>
            <br />
            <small>System management & oversight</small>
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
            Admin portal <span>/</span>{' '}
            <b>{location.split('/')[2]?.replace('-', ' ') || 'overview'}</b>
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
