import { useState, type FormEvent } from 'react';
import { CircleAlert, Eye, EyeOff, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/endpoints';

export function Login() {
  const { login, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
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
            <strong>OFIJANA</strong>
            <small>Online examination system</small>
          </span>
        </div>
        <div className="login-copy">
          <h1>
            Your exam
            <br />
            starts here.
          </h1>
          <p>
            Sign in to open your assigned exams, work under the official timer, and view results
            when they are released.
          </p>
          <div className="login-assurance">
            <ShieldCheck size={18} />
            <span>Every sign-in is verified by the OFIJANA examination server.</span>
          </div>
        </div>
        {/* An exam booklet's answer sheet — the one decorative moment. */}
        <svg className="exam-sheet-motif" viewBox="0 0 340 170" fill="none" aria-hidden="true">
          <text x="0" y="24" className="motif-num">
            01
          </text>
          <line x1="42" y1="18" x2="340" y2="18" className="motif-rule" />
          <line x1="0" y1="56" x2="340" y2="56" className="motif-rule" />
          <line x1="0" y1="94" x2="292" y2="94" className="motif-rule" />
          <g className="motif-bubbles">
            <circle cx="9" cy="140" r="8" />
            <circle cx="41" cy="140" r="8" className="motif-bubble-filled" />
            <circle cx="73" cy="140" r="8" />
            <circle cx="105" cy="140" r="8" />
          </g>
        </svg>
      </div>

      <div className="login-form-area">
        <form className="login-form" onSubmit={onSubmit}>
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
              onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
              onKeyDown={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
              onBlur={() => setCapsLockOn(false)}
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
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {capsLockOn && (
            <div className="capslock-hint" role="status">
              Caps Lock is on
            </div>
          )}

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
              'Sign in'
            )}
          </button>
          <div className="login-legal">
            Sign-ins are rate-limited to protect your account.
          </div>
        </form>
      </div>
    </div>
  );
}
