import { useState, type FormEvent } from 'react';
import { ChevronRight, CircleAlert, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/endpoints';

export function Login() {
  const { login, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [forgotState, setForgotState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [forgotMessage, setForgotMessage] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    clearNotice();
    try {
      // Try student login first
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        // If student login fails with 403 (wrong role), try staff login
        if (err.status === 403 && err.message.includes('student')) {
          try {
            const result = await authApi.staffLogin(email.trim(), password);
            // Persist the staff token BEFORE fetching the profile: /v1/profile
            // is auth:sanctum, so reading it with the old (or absent) token
            // 401s and signs the member straight back out.
            localStorage.setItem('ofijan.student.token.v1', result.token);
            const profile = await authApi.profile();
            localStorage.setItem('ofijan.student.user.v1', JSON.stringify(profile));
            window.location.reload();
            return;
          } catch (staffErr) {
            if (staffErr instanceof ApiError) {
              if (staffErr.status === 401) setError('Incorrect email or password.');
              else if (staffErr.status === 403) setError(staffErr.message);
              else if (staffErr.isRateLimited)
                setError('Too many sign-in attempts. Please wait a minute and try again.');
              else if (staffErr.kind === 'network' || staffErr.kind === 'timeout')
                setError('Could not reach the examination server. Check your connection and retry.');
              else setError(staffErr.message);
            } else {
              setError('Sign-in failed. Please try again.');
            }
          }
        } else if (err.status === 401) {
          setError('Incorrect email or password.');
        } else if (err.status === 403) {
          setError(err.message);
        } else if (err.isRateLimited) {
          setError('Too many sign-in attempts. Please wait a minute and try again.');
        } else if (err.kind === 'network' || err.kind === 'timeout') {
          setError('Could not reach the examination server. Check your connection and retry.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot() {
    if (forgotState === 'sending' || !email.trim()) {
      if (!email.trim()) {
        setForgotState('error');
        setForgotMessage('Enter your account email address first.');
      }
      return;
    }
    setForgotState('sending');
    try {
      await apiRequest('/v1/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
        skipAuth: true,
      });
      setForgotState('sent');
      setForgotMessage(
        'If an account exists for this address, a password reset link has been sent.',
      );
    } catch (err) {
      setForgotState('error');
      setForgotMessage(
        err instanceof ApiError && err.isRateLimited
          ? 'Too many reset requests. Please try again later.'
          : 'Password reset could not be requested right now. Contact your institution if you need help.',
      );
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <div className="login-brand">
          <span className="brand-mark">
            <GraduationCap size={22} />
          </span>
          <span>
            <strong>Madda Walabu</strong>
            <small>UNIVERSITY EXAMINATIONS</small>
          </span>
        </div>
        <div className="login-copy">
          <div className="eyebrow">STUDENT EXAMINATION PORTAL</div>
          <h1>
            Exams, with
            <br />
            <em>clarity.</em>
          </h1>
          <p>Your schedule, assessments and outcomes in one secure student space.</p>
          <div className="login-assurance">
            <ShieldCheck size={18} />
            <span>
              Student access only
              <br />
              <small>Sign-in is verified by the university examination server.</small>
            </span>
          </div>
        </div>
        <div className="login-footer">
          MADDA WALABU UNIVERSITY <span>·</span> ONLINE EXAMINATIONS
        </div>
      </div>

      <div className="login-form-area">
        <form className="login-form" onSubmit={onSubmit}>
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to continue</h2>
          <p>Use the email address registered with your institution.</p>

          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            data-testid="input-student-id"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              data-testid="input-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              data-testid="button-toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="login-links login-links-end">
            <button
              type="button"
              className="forgot-button"
              data-testid="button-forgot-password"
              onClick={() => void onForgot()}
            >
              Forgot password?
            </button>
          </div>
          {forgotMessage && (
            <div className="forgot-notice" role="status" data-testid="forgot-notice">
              {forgotMessage}
            </div>
          )}

          {notice && (
            <div className="demo-hint" role="status">
              <CircleAlert size={16} />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert" data-testid="login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="button button-primary button-block"
            data-testid="button-login"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="spin" /> Verifying…
              </>
            ) : (
              <>
                Continue to portal <ChevronRight size={17} />
              </>
            )}
          </button>
          <div className="login-legal">
            Credentials are checked by the Ofijan examination server. Attempts are rate-limited.
          </div>
        </form>
      </div>
    </div>
  );
}
