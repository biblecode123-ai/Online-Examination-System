import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { ErrorBox, LoadingBlock, Metric, PageTitle, Status } from '../components/shell';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateLabel, formatDuration } from '../lib/format';
import {
  getStudentExamState,
  isActiveAttempt,
  latestAttemptFor,
  stateTone,
} from '../lib/examState';
import { attemptApi, isRealExam, pickMode, realExamApi } from '../lib/endpoints';
import { useExam, useMyAttempts } from '../lib/queries';

interface StandardStartBody {
  attempt?: { id: number; status?: string; attempt_status?: string };
  resumed?: boolean;
}

export function ExamDetails() {
  const { examId = '' } = useParams();
  const [, navigate] = useLocation();
  const { user, mustChangePassword } = useAuth();

  const examQuery = useExam(examId);
  const attemptsQuery = useMyAttempts();
  const exam = examQuery.data;
  const attempts = useMemo(() => attemptsQuery.data ?? [], [attemptsQuery.data]);

  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const state = exam
    ? getStudentExamState(exam, attempts, user?.department_id ?? null)
    : 'Upcoming';
  const existingAttempt = exam ? latestAttemptFor(exam.id, attempts) : undefined;
  const resumable = Boolean(existingAttempt && isActiveAttempt(existingAttempt));

  const realExam = exam ? isRealExam(exam) : false;
  const needsPassword = Boolean(exam?.has_password);
  const passwordBlocked = needsPassword && !realExam;

  // Teacher-created accounts must set their own password before opening any
  // exam — the temporary throwaway value is not a real credential.
  const mustChangeBeforeExam = mustChangePassword;

  const instructions = useMemo(() => {
    if (!exam?.instructions?.length) return [];
    return [...exam.instructions]
      .filter((item) => item.is_active !== false)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((item) => item.content);
  }, [exam?.instructions]);

  const canStart =
    state === 'Available' &&
    !passwordBlocked &&
    !mustChangeBeforeExam &&
    (!needsPassword || password.length > 0) &&
    !starting;

  async function onStartConfirmed() {
    if (!exam || starting) return;
    setStarting(true);
    setError('');
    try {
      if (realExam) {
        const data = await realExamApi.start(exam.id, password);
        setConfirmOpen(false);
        setPassword('');
        navigate(`/exams/${exam.id}/attempt/${data.attempt_id}`);
        return;
      }
      const response = await attemptApi.start(exam.id, pickMode(exam));
      setConfirmOpen(false);
      navigate(`/exams/${exam.id}/attempt/${response.attempt.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // A repeated start on the standard flow returns 422 with the ongoing
        // attempt — that is a resume, not a failure.
        const body = err.body as StandardStartBody | undefined;
        const ongoing = body?.attempt;
        if (
          ongoing?.id &&
          (ongoing.status === 'started' ||
            ongoing.status === 'in_progress' ||
            ongoing.attempt_status === 'active')
        ) {
          setConfirmOpen(false);
          navigate(`/exams/${exam.id}/attempt/${ongoing.id}`);
          return;
        }
        setError(err.message);
      } else {
        setError('The examination could not be started. Please try again.');
      }
    } finally {
      setStarting(false);
    }
  }

  function onPrimaryAction() {
    if (!exam) return;
    if (resumable && existingAttempt) {
      navigate(`/exams/${exam.id}/attempt/${existingAttempt.id}`);
      return;
    }
    setError('');
    setConfirmOpen(true);
  }

  if (examQuery.isPending) {
    return <LoadingBlock label="Loading examination…" />;
  }

  if (examQuery.isError || !exam) {
    const err = examQuery.error;
    const blockedByDepartment =
      err instanceof ApiError && (err.code === 'DEPARTMENT_REQUIRED' || err.code === 'DEPARTMENT_MISMATCH');
    return (
      <>
        <div className="back-row">
          <Link href="/exams" className="text-link" data-testid="link-back-exams">
            <ChevronLeft size={16} /> My examinations
          </Link>
        </div>
        <ErrorBox
          error={
            blockedByDepartment && err
              ? `${err.message} Open your student profile to check your department.`
              : (err ?? 'This examination could not be loaded.')
          }
        />
        <div className="back-row">
          <Link href="/profile" className="text-link">
            My profile
          </Link>
        </div>
      </>
    );
  }

  if (exam && !isRealExam(exam)) {
    return (
      <>
        <div className="back-row">
          <Link href="/exams" className="text-link" data-testid="link-back-exams">
            <ChevronLeft size={16} /> My examinations
          </Link>
        </div>
        <ErrorBox error="This examination is not a real (proctored) exam and cannot be opened here." />
        <div className="back-row">
          <Link href="/exams" className="text-link">My examinations</Link>
        </div>
      </>
    );
  }

  const startLabel = resumable
    ? 'Resume assessment'
    : state === 'Upcoming'
      ? 'Not yet available'
      : state === 'Ready'
        ? 'Awaiting teacher activation'
        : state === 'Missed'
          ? 'Assessment window closed'
          : state === 'Closed' || state === 'Cancelled' || state === 'Archived'
            ? 'Assessment closed'
            : state === 'Completed' || (existingAttempt && !isActiveAttempt(existingAttempt))
              ? 'Attempt already submitted'
              : state === 'Other department'
                ? 'Not available to your department'
                : 'Start assessment';

  return (
    <>
      <div className="back-row">
        <Link href="/exams" className="text-link" data-testid="link-back-exams">
          <ChevronLeft size={16} /> My examinations
        </Link>
        <Status tone={stateTone(state)} testId="exam-status">
          {state}
        </Status>
      </div>

      <div className="detail-layout">
        <section className="detail-main">
          <div className="eyebrow">
            {exam.course?.code ?? exam.category?.name ?? 'Examination'}
          </div>
          <h1 className="detail-title">{exam.exam_title}</h1>
          <p className="detail-course">
            {[exam.course?.name, exam.department?.name, exam.academic_year]
              .filter(Boolean)
              .join(' · ') || 'Madda Walabu University'}
          </p>

          <div className="detail-metrics">
            <Metric label="DURATION" value={formatDuration(exam.total_time)} />
            <Metric label="QUESTIONS" value={String(exam.questions_count ?? '—')} />
            <Metric label="PASS MARK" value={`${exam.passing_percentage}%`} />
            <Metric label="MODE" value={realExam ? 'Proctored' : 'Standard'} />
          </div>

          <div className="panel instruction-panel">
            <div className="panel-title">
              <div className="eyebrow">BEFORE YOU BEGIN</div>
              <h2>Instructions</h2>
            </div>
            {instructions.length ? (
              <ol>
                {instructions.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 24)}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {item}
                  </li>
                ))}
              </ol>
            ) : (
              <ol>
                <li>
                  <span>01</span>
                  This examination contains {exam.questions_count ?? 'the assigned'} questions and
                  runs for {formatDuration(exam.total_time)}.
                </li>
                <li>
                  <span>02</span>
                  Your answers are saved to the examination server while you work; the countdown is
                  enforced by the server, not by this browser.
                </li>
                <li>
                  <span>03</span>
                  Submit before the deadline. An expired attempt is finalized automatically on the
                  server even if you close this window.
                </li>
              </ol>
            )}
            <div className="activity-policy">
              <strong>Attempt rules</strong>
              <span>
                Attempt limits, availability windows and any exam password are validated by the
                server when you start.
              </span>
              <strong>Integrity</strong>
              <span>
                Proctored exams record full-screen exits, tab switches and copy/paste attempts
                against your attempt as configured by your institution.
              </span>
            </div>
          </div>

          {error && <ErrorBox error={error} testId="start-error" />}

          {state === 'Completed' && existingAttempt ? (
            <div className="inline-success">
              <Check size={18} />
              This attempt has been submitted.{' '}
              <Link href={`/results/${existingAttempt.id}`}>View submission</Link>
            </div>
          ) : (
            <label className="ack-check">
              <input
                type="checkbox"
                data-testid="checkbox-acknowledge"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={state !== 'Available' && !resumable}
              />
              <span>I have read and understood the instructions above.</span>
            </label>
          )}
        </section>

        <aside className="panel details-aside">
          <div className="eyebrow">ASSESSMENT WINDOW</div>
          <h2>Plan your time</h2>

          <div className="window-item">
            <CalendarDays size={17} />
            <span>
              <small>Opens</small>
              <strong>{exam.active_from ? dateLabel(exam.active_from) : 'Immediately'}</strong>
            </span>
          </div>
          <div className="window-item">
            <Clock3 size={17} />
            <span>
              <small>Closes</small>
              <strong>{exam.active_until ? dateLabel(exam.active_until) : 'No fixed close'}</strong>
            </span>
          </div>
          {needsPassword && (
            <div className="window-item">
              <KeyRound size={17} />
              <span>
                <small>Password</small>
                <strong>Required to start</strong>
              </span>
            </div>
          )}

          <div className="aside-rule" />
          <p className="aside-warning">
            <AlertTriangle size={17} />
            The timer starts when the server starts your attempt and keeps running if you leave
            this page.
          </p>

          {passwordBlocked && (
            <div className="error-box" role="alert" data-testid="password-gap">
              <Lock size={15} />
              <span>
                This exam is password protected, but the server only verifies exam passwords for
                proctored (Real Exam) examinations. Starting is blocked so the password cannot be
                bypassed. Contact your institution.
              </span>
            </div>
          )}

          {mustChangeBeforeExam && (
            <div className="error-box" role="alert" data-testid="must-change-password">
              <ShieldCheck size={15} />
              <span>
                Your account was created by a teacher and must set its own password before
                opening any examination. Visit your profile to choose a password.
              </span>
            </div>
          )}

          <Button
            onClick={onPrimaryAction}
            disabled={
              !resumable &&
              (state !== 'Available' || !acknowledged || passwordBlocked || mustChangeBeforeExam)
            }
            testId="button-start-exam"
            label={startLabel}
          />

          {!resumable && !acknowledged && state === 'Available' && !mustChangeBeforeExam && (
            <small className="button-hint">Acknowledge the instructions to continue.</small>
          )}
          {state === 'Upcoming' && exam.active_from && (
            <small className="button-hint">
              Opens {dateLabel(exam.active_from)}.
            </small>
          )}
          {state === 'Missed' && (
            <small className="button-hint">The assessment window has ended.</small>
          )}
          {mustChangeBeforeExam && (
            <small className="button-hint">
              Complete password setup on your profile page to unlock examinations.
            </small>
          )}
        </aside>
      </div>

      {confirmOpen && (
        <div className="modal-backdrop">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="start-title">
            <div className="modal-icon">
              <Clock3 size={20} />
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label="Cancel starting"
              data-testid="button-cancel-start"
              onClick={() => {
                setConfirmOpen(false);
                setError('');
              }}
            >
              ✕
            </button>
            <div className="eyebrow">READY TO BEGIN?</div>
            <h2 id="start-title">Start this assessment?</h2>
            <p>
              Your {formatDuration(exam.total_time)} countdown begins once the server creates your
              attempt, and it continues if you leave this page.
            </p>

            {realExam && needsPassword && (
              <div className="password-field modal-password">
                <label htmlFor="exam-password" className="sr-only">
                  Examination password
                </label>
                <input
                  id="exam-password"
                  data-testid="input-exam-password"
                  type="password"
                  value={password}
                  placeholder="Examination password"
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                />
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                data-testid="button-cancel-start-action"
                onClick={() => setConfirmOpen(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="button button-primary"
                data-testid="button-confirm-start"
                disabled={!canStart && !resumable}
                onClick={() => void onStartConfirmed()}
              >
                {starting ? (
                  <>
                    <Loader2 size={16} className="spin" /> Starting…
                  </>
                ) : (
                  'Confirm and begin'
                )}
              </button>
            </div>
            {realExam && needsPassword && !password && (
              <small className="modal-caveat">Enter the examination password to continue.</small>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** Local button wrapper so the aside can pass a `label` prop. */
function Button({
  onClick,
  disabled,
  testId,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="button button-primary"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {label} <ChevronRight size={17} />
    </button>
  );
}
