import { useEffect, useState } from 'react';
import { Check, GraduationCap, Loader2, Mail, RefreshCw, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { ErrorBox, PageTitle, Status } from '../components/shell';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/endpoints';
import { Button } from '../components/ui/button';

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
  const { user, refreshProfile, mustChangePassword, setMustChangePassword } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState(false);

  useEffect(() => {
    if (user) return;
    void refreshProfile().catch(() => undefined);
  }, [user, refreshProfile]);

  useEffect(() => {
    if (mustChangePassword) {
      setShowPasswordForm(true);
    }
  }, [mustChangePassword]);

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

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (changing) return;
    if (newPassword !== confirmPassword) {
      setChangeError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setChangeError('Password must be at least 12 characters.');
      return;
    }
    setChanging(true);
    setChangeError('');
    setChangeSuccess(false);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMustChangePassword(false);
      await refreshProfile();
    } catch (err) {
      setChangeError(
        err instanceof ApiError
          ? err.message
          : 'Your password could not be changed. Please try again.',
      );
    } finally {
      setChanging(false);
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
            {mustChangePassword && (
              <div className="profile-field">
                <small>Password status</small>
                <strong>
                  <Status tone="amber">Must be set</Status>
                </strong>
              </div>
            )}
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

      {showPasswordForm && (
        <section className="panel password-panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">ACCOUNT SECURITY</div>
              <h2>{mustChangePassword ? 'Set your password' : 'Change password'}</h2>
            </div>
          </div>
          {changeSuccess && (
            <div className="inline-success" role="status">
              <Check size={18} /> Password updated successfully.
            </div>
          )}
          {changeError && <ErrorBox error={changeError} />}
          <form className="password-form" onSubmit={onChangePassword}>
            <label htmlFor="current-password">Current password</label>
            <div className="password-field">
              <input
                id="current-password"
                type={showNew ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>

            <label htmlFor="new-password">New password</label>
            <div className="password-field">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>

            <label htmlFor="confirm-password">Confirm new password</label>
            <div className="password-field">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>

            <small className="password-hint">
              Use at least 12 characters with a mix of uppercase, lowercase, numbers and symbols.
            </small>

            <div className="password-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setChangeError('');
                }}
                disabled={changing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={changing}
              >
                {changing ? <Loader2 size={15} className="spin" /> : null}
                {changing ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
