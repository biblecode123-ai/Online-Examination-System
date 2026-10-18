import { useEffect, useState } from 'react';
import { GraduationCap, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { ErrorBox, PageTitle, Status } from '../components/shell';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-field">
      <small>{label}</small>
      <strong data-testid={`value-profile-${label.toLowerCase().replaceAll(' ', '-')}`}>
        {value || '—'}
      </strong>
    </div>
  );
}

export function Profile() {
  const { user, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    if (user) return;
    void refreshProfile().catch(() => undefined);
  }, [user, refreshProfile]);

  async function onRefresh() {
    setRefreshing(true);
    setRefreshError('');
    try {
      await refreshProfile();
    } catch (err) {
      setRefreshError(
        err instanceof ApiError ? err.message : 'Your profile could not be refreshed.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (!user) {
    return (
      <>
        <PageTitle eyebrow="STUDENT ACCOUNT" title="My profile" detail="Loading your record…" />
        <ErrorBox error={refreshError || 'Loading your student profile from the server…'} onRetry={() => void onRefresh()} />
      </>
    );
  }

  const universityName = user.university?.name_en ?? user.university?.name_am ?? null;
  const departmentName =
    user.department_detail?.name ?? user.department ?? null;

  return (
    <>
      <PageTitle
        eyebrow="STUDENT ACCOUNT"
        title="My profile"
        detail="Identity details as recorded by the Ofijan student information system."
        action={
          <button
            type="button"
            className="button button-secondary"
            data-testid="button-refresh-profile"
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            {refreshing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Refresh
          </button>
        }
      />

      {refreshError && <ErrorBox error={refreshError} />}

      <section className="profile-layout">
        <div className="panel profile-card">
          <div className="profile-banner">
            <div className="profile-avatar">
              <GraduationCap size={26} />
            </div>
            <div>
              <div className="eyebrow">{(user.role ?? 'Student').toUpperCase()}</div>
              <h2>{user.name}</h2>
              <span>Account #{user.id}</span>
            </div>
            <Status tone={user.is_active === false ? 'red' : 'green'}>
              {user.is_active === false ? 'Inactive account' : 'Active account'}
            </Status>
          </div>

          <div className="profile-fields">
            <ProfileField label="Full name" value={user.name} />
            <ProfileField label="Email address" value={user.email} />
            <ProfileField label="Institution" value={universityName ?? 'Madda Walabu University'} />
            <ProfileField label="Department" value={departmentName ?? 'Not set'} />
            <ProfileField label="Plan" value={(user.plan_label ?? 'free').toUpperCase()} />
            <ProfileField label="Phone number" value={user.phone_number ?? ''} />
            <ProfileField label="Gender" value={user.gender ? user.gender.toUpperCase() : ''} />
            <ProfileField
              label="Profile completion"
              value={`${user.profile_completion_percentage ?? 0}%`}
            />
          </div>
        </div>

        <aside className="panel profile-notice">
          <div className="notice-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="eyebrow">SERVER-VERIFIED IDENTITY</div>
          <h3>Read-only record</h3>
          <p>
            These fields come from the student information system. Examination eligibility,
            department restrictions and attempt limits are checked against this record on the
            server.
          </p>
          <div className="notice-icon">
            <Mail size={20} />
          </div>
          <p>
            Need to change something? Contact your institution’s support team — this portal does
            not edit identity records.
          </p>
        </aside>
      </section>
    </>
  );
}
