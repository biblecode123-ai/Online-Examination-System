import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  Loader2,
  Lock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { ErrorBox, LoadingBlock } from '../components/shell';
import { ApiError, noteServerTime, serverNow } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCountdown } from '../lib/format';
import { isActiveAttempt } from '../lib/examState';
import { attemptApi, examApi, isRealExam, realExamApi } from '../lib/endpoints';
import type {
  Exam,
  QuestionPayload,
  RealExamPublicSettings,
  SectionContent,
} from '../lib/types';

// ─── TYPES ──────────────────────────────────────────────────────────────
interface SavedAnswer {
  option_id?: number | null;
  text?: string;
}

// ─── SECTION TYPES (for structural rendering) ─────────────────────
// These types are imported from types.ts and represent the structure we receive from the backend.

// ─── HELPERS ────────────────────────────────────────────────────────────
const textDraftKey = (attemptId: string) => `ofijan.exam.text-draft.${attemptId}`;
const resultVisibilityKey = (attemptId: string) =>
  `ofijan.exam.result-visibility.${attemptId}`;

function readTextDraft(attemptId: string): Record<number, string> {
  try {
    const raw = window.sessionStorage.getItem(textDraftKey(attemptId));
    return raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    return {};
  }
}

function writeTextDraft(attemptId: string, draft: Record<number, string>): void {
  try {
    window.sessionStorage.setItem(textDraftKey(attemptId), JSON.stringify(draft));
  } catch {
    /* best effort — the server copy remains authoritative */
  }
}

function hasValue(answer: SavedAnswer | undefined): boolean {
  if (!answer) return false;
  if (answer.option_id !== null && answer.option_id !== undefined) return true;
  return Boolean(answer.text && answer.text.trim());
}

export function ExamAttempt() {
  const params = useParams();
  const examId = params.examId ?? '';
  const attemptId = params.attemptId ?? '';
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState<unknown>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<QuestionPayload[]>([]);
  const [answers, setAnswers] = useState<Record<number, SavedAnswer>>({});
  const [settings, setSettings] = useState<RealExamPublicSettings | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<'active' | 'locked' | 'ended'>('active');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [review, setReview] = useState<number[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [violationScore, setViolationScore] = useState<number | null>(null);

  // ─── ADDED: Section State for structural rendering ────────────────────
  const [sections, setSections] = useState<SectionContent[]>([]);

  // --- refs used by timers/listeners so callbacks never go stale ----------
  const realRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const answersRef = useRef<Record<number, SavedAnswer>>({});
  const statusRef = useRef<'active' | 'locked' | 'ended'>('active');
  const settingsRef = useRef<RealExamPublicSettings | null>(null);
  const pendingRef = useRef(new Map<number, SavedAnswer>());
  const inFlightRef = useRef(new Set<number>());
  const retryRef = useRef(new Map<number, number>());
  const debounceRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const editLockRef = useRef(false);
  const mountedRef = useRef(true);
  const submitBusyRef = useRef(false);
  const violationRef = useRef<number | null>(null);
  const warnAtRef = useRef<number | null>(null);

  const answeredCount = useMemo(
    () => questions.filter((question) => hasValue(answers[question.id])).length,
    [questions, answers],
  );

  const saveQuestion = useCallback(
    async (questionId: number, payload: SavedAnswer) => {
      if (realRef.current) {
        await realExamApi.saveAnswer(Number(attemptId), {
          question_id: questionId,
          option_id: payload.option_id ?? null,
          answer_text: payload.text ?? null,
        });
        return;
      }
      await attemptApi.saveAnswer(Number(attemptId), {
        question_id: questionId,
        selected_option_id: payload.option_id ?? null,
        answer_text: payload.text ?? null,
      });
    },
    [attemptId],
  );

  const flushQuestion = useCallback(
    async (questionId: number) => {
      const payload = pendingRef.current.get(questionId);
      if (!payload || inFlightRef.current.has(questionId)) return;
      if (statusRef.current !== 'active') return;
      pendingRef.current.delete(questionId);
      inFlightRef.current.add(questionId);
      setSaveState('saving');
      try {
        await saveQuestion(questionId, payload);
        retryRef.current.delete(questionId);
      } catch (err) {
        // Keep the newest payload queued for a later retry (never drop it).
        if (!pendingRef.current.has(questionId)) pendingRef.current.set(questionId, payload);
        const attempts = (retryRef.current.get(questionId) ?? 0) + 1;
        retryRef.current.set(questionId, attempts);
        if (attempts >= 3 || (err instanceof ApiError && (err.status === 423 || err.status === 404))) {
          setSaveState('error');
        } else if (mountedRef.current) {
          window.setTimeout(() => {
            if (mountedRef.current) void flushQuestion(questionId);
          }, 1500);
        }
      } finally {
        inFlightRef.current.delete(questionId);
        if (pendingRef.current.size === 0 && retryRef.current.size === 0) {
          setSaveState((state) => (state === 'error' ? state : 'saved'));
        }
      }
    },
    [saveQuestion],
  );

  const flushAll = useCallback(async (timeoutMs = 2500) => {
    const ids = [...pendingRef.current.keys()];
    if (ids.length === 0) return;
    const started = Date.now();
    for (const id of ids) {
      if (Date.now() - started > timeoutMs) break;
      await flushQuestion(id);
    }
  }, [flushQuestion]);

  const queueAnswer = useCallback(
    (questionId: number, payload: SavedAnswer) => {
      pendingRef.current.set(questionId, payload);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void (async () => {
          for (const id of [...pendingRef.current.keys()]) {
            await flushQuestion(id);
          }
        })();
      }, 800);
    },
    [flushQuestion],
  );

  const updateAnswer = useCallback(
    (questionId: number, payload: SavedAnswer) => {
      if (editLockRef.current || statusRef.current !== 'active') return;
      setAnswers((previous) => {
        const next = { ...previous, [questionId]: payload };
        answersRef.current = next;
        return next;
      });
      if (realRef.current) {
        const draft = readTextDraft(attemptId);
        if (payload.text !== undefined) draft[questionId] = payload.text;
        writeTextDraft(attemptId, draft);
      }
      queueAnswer(questionId, payload);
    },
    [attemptId, queueAnswer],
  );

  // --- anti-cheat reporting (Real Exam flow only) -------------------------
  const reportEvent = useCallback(
    async (eventType: string, metadata?: Record<string, string | number | boolean>) => {
      if (!realRef.current || statusRef.current !== 'active') return null;
      const result = await realExamApi.reportEvent(Number(attemptId), eventType, metadata);
      if (result) {
        if (typeof result.violation_score === 'number') {
          violationRef.current = result.violation_score;
          setViolationScore(result.violation_score);
        }
        if (result.auto_submitted) {
          endedRef.current = true;
          setAttemptStatus('ended');
          setSaveState('saved');
          window.sessionStorage.setItem(
            resultVisibilityKey(attemptId),
            settingsRef.current?.result_visibility ?? 'score_only',
          );
          navigate(`/exams/${examId}/submission/${attemptId}`);
        }
      }
      return result;
    },
    [attemptId, examId, navigate],
  );

  const requestFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      setBanner(
        'Full screen could not be enabled by this browser. Your attempt continues in this window.',
      );
    }
  }, []);

  const submitNow = useCallback(
    async (auto: boolean) => {
      if (submitBusyRef.current || endedRef.current) return;
      submitBusyRef.current = true;
      setSubmitting(true);
      setError('');
      try {
        await flushAll(auto ? 1200 : 2500);
        if (realRef.current) {
          const result = await realExamApi.submit(Number(attemptId));
          endedRef.current = true;
          window.sessionStorage.setItem(
            resultVisibilityKey(attemptId),
            result.result_visibility ?? settingsRef.current?.result_visibility ?? 'score_only',
          );
          setAttemptStatus('ended');
          setSaveState('saved');
          navigate(`/exams/${examId}/submission/${attemptId}`);
          return;
        }
        const started = startedAtRef.current;
        const payload = questions.map((question) => {
          const answer = answersRef.current[question.id];
          if (answer && answer.option_id !== null && answer.option_id !== undefined) {
            return { question_id: question.id, selected_option_id: answer.option_id };
          }
          if (answer && answer.text && answer.text.trim()) {
            return { question_id: question.id, answer_text: answer.text };
          }
          // No value: omit both keys so the backend counts it as skipped.
          return { question_id: question.id };
        });
        const timeTaken =
          started !== null ? Math.max(0, Math.round((serverNow() - started) / 1000)) : undefined;
        await attemptApi.submit(Number(attemptId), payload, timeTaken);
        endedRef.current = true;
        setAttemptStatus('ended');
        setSaveState('saved');
        navigate(`/exams/${examId}/submission/${attemptId}`);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Submission failed.';
        if (err instanceof ApiError && err.status === 422 && !err.errors) {
          // "Already completed" upstream — the server state is authoritative.
          endedRef.current = true;
          setAttemptStatus('ended');
          navigate(`/exams/${examId}/submission/${attemptId}`);
          return;
        }
        setError(message);
        setConfirmSubmit(true);
        if (!auto) setSaveState('error');
      } finally {
        submitBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, examId, flushAll, navigate, questions],
  );

  // --- bootstrap ----------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    mountedRef.current = true;

    void (async () => {
      try {
        const [attemptRecord, examRecord] = await Promise.all([
          attemptApi.get(Number(attemptId), controller.signal),
          examApi.get(examId, controller.signal),
        ]);
        if (cancelled) return;

        if (Number(attemptRecord.exam_id) !== Number(examRecord.id)) {
          throw new ApiError('This attempt does not belong to the displayed examination.', 404, 'http');
        }

        const real = isRealExam(examRecord);
        realRef.current = real;
        setExam(examRecord);
        startedAtRef.current = attemptRecord.start_time
          ? Date.parse(attemptRecord.start_time)
          : null;

        const finished =
          !isActiveAttempt(attemptRecord) ||
          ['completed', 'submitted', 'graded'].includes(attemptRecord.status);
        if (finished) {
          navigate(`/exams/${examId}/submission/${attemptId}`, { replace: true });
          return;
        }

        let questionRows: QuestionPayload[] = [];
        let sectionData: SectionContent[] = []; // ─── REAL DATA ───
        
        let expiresAt: string | null = attemptRecord.expires_at ?? null;
        let status: 'active' | 'locked' | 'ended' = 'active';
        let publicSettings: RealExamPublicSettings | null = null;

        if (real) {
          const snapshot = await realExamApi.snapshot(Number(attemptId), controller.signal);
          if (cancelled) return;
          noteServerTime(snapshot.server_time);
          expiresAt = snapshot.expires_at ?? expiresAt;
          status =
            snapshot.status === 'locked'
              ? 'locked'
              : snapshot.status === 'active'
                ? 'active'
                : 'ended';
          publicSettings = snapshot.settings ?? null;
          if (typeof snapshot.violation_score === 'number') {
            violationRef.current = snapshot.violation_score;
            setViolationScore(snapshot.violation_score);
          }
          
          // ─── FETCH QUESTIONS AND SECTIONS ────────────────────────────────
          const res = await realExamApi.questions(Number(attemptId), controller.signal);
          if (cancelled) return;
          
          questionRows = res.questions ?? [];
          sectionData = res.sections ?? [];
        } else {
          const payload = await examApi.questions(examId, controller.signal);
          questionRows = payload.questions ?? [];
          sectionData = payload.sections ?? [];
        }

        // Restore server-saved answers (option choices); text answers fall
        // back to the local recovery draft because no endpoint returns them.
        const draft = real ? readTextDraft(attemptId) : {};
        const restored: Record<number, SavedAnswer> = {};
        for (const saved of attemptRecord.student_answers ?? []) {
          if (!saved || saved.question_id === null || saved.question_id === undefined) continue;
          restored[saved.question_id] = {
            option_id: saved.selected_option_id ?? null,
            text: draft[saved.question_id] ?? undefined,
          };
        }
        for (const [questionId, text] of Object.entries(draft)) {
          const id = Number(questionId);
          if (!restored[id]) restored[id] = { option_id: null, text };
          else restored[id] = { ...restored[id], text };
        }

        answersRef.current = restored;
        setAnswers(restored);
        setQuestions(questionRows);
        setSections(sectionData); // ─── SET SECTION DATA ──────────────────
        setSettings(publicSettings);
        settingsRef.current = publicSettings;
        warnAtRef.current = publicSettings?.escalation_warn_at ?? null;
        expiresAtRef.current = expiresAt ? Date.parse(expiresAt) : null;
        setAttemptStatus(status);
        statusRef.current = status;
        setLocked(status === 'locked');
        setSaveState('saved');
        setPhase('ready');

        if (real) {
          if (publicSettings?.fullscreen_required) void requestFullscreen();
          void reportEvent('PAGE_REFRESH', { resumed: true });
        }
      } catch (err) {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        setBootError(err);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, examId]);

  // --- countdown ----------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return;
    const tick = () => {
      const expiry = expiresAtRef.current;
      if (expiry === null) return;
      const left = Math.max(0, Math.floor((expiry - serverNow()) / 1000));
      setRemaining(left);
      if (left <= 0 && !endedRef.current && statusRef.current === 'active') {
        // Stop accepting edits immediately; the queued saves are flushed by
        // submitNow before the final call.
        editLockRef.current = true;
        setAttemptStatus('ended');
        setBanner('Time is up — submitting your saved answers…');
        void submitNow(true);
      }
    };
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [phase, submitNow]);

  // --- server resync (authoritative clock + status) -----------------------
  useEffect(() => {
    if (phase !== 'ready') return;
    const interval = realRef.current ? 30_000 : 45_000;
    const resync = async () => {
      if (endedRef.current) return;
      try {
        if (realRef.current) {
          const beat = await realExamApi.heartbeat(Number(attemptId));
          noteServerTime(beat.server_time);
          if (beat.expires_at) expiresAtRef.current = Date.parse(beat.expires_at);
          if (beat.status === 'locked' && statusRef.current !== 'locked') {
            statusRef.current = 'locked';
            setAttemptStatus('locked');
            setLocked(true);
          }
        } else {
          const record = await attemptApi.get(Number(attemptId));
          if (record.expires_at) expiresAtRef.current = Date.parse(record.expires_at);
          if (!isActiveAttempt(record) || record.status === 'completed') {
            endedRef.current = true;
            navigate(`/exams/${examId}/submission/${attemptId}`, { replace: true });
          }
        }
      } catch {
        /* transient failures are retried on the next tick */
      }
    };
    const handle = window.setInterval(() => void resync(), interval);
    return () => window.clearInterval(handle);
  }, [attemptId, examId, navigate, phase]);

  // --- anti-cheat listeners (Real Exam flow) ------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !realRef.current) return;

    const onVisibility = () => {
      if (document.hidden) {
        if (settingsRef.current?.tab_switch_detection ?? true) void reportEvent('TAB_SWITCH');
      }
    };
    const onFullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active && settingsRef.current?.fullscreen_required) {
        void reportEvent('FULLSCREEN_EXITED');
        setBanner('You left full screen. Return to full screen to continue in exam mode.');
      }
    };
    const onCopy = (event: Event) => {
      if (!(settingsRef.current?.copy_paste_detection ?? true)) return;
      const type = event.type === 'copy' ? 'COPY_ATTEMPT' : event.type === 'cut' ? 'CUT_ATTEMPT' : 'PASTE_ATTEMPT';
      void reportEvent(type);
      setBanner(`Copying is monitored during this examination (${type.replace('_ATTEMPT', '').toLowerCase()}).`);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!(settingsRef.current?.right_click_detection ?? true)) return;
      event.preventDefault();
      void reportEvent('RIGHT_CLICK_ATTEMPT');
    };
    const onOffline = () => {
      setOnline(false);
      void reportEvent('NETWORK_DISCONNECTED');
      setBanner(
        settingsRef.current?.network_disconnect_policy === 'submit'
          ? 'Connection lost. This exam is configured to submit when the connection drops.'
          : 'Connection lost. Your saved answers stay on the server — reconnect to continue.',
      );
      if (settingsRef.current?.network_disconnect_policy === 'submit') {
        window.setTimeout(() => {
          if (!navigator.onLine && !endedRef.current) void submitNow(true);
        }, 15_000);
      }
    };
    const onOnline = () => {
      setOnline(true);
      void reportEvent('NETWORK_RECONNECTED');
      setBanner('Back online. Your countdown was maintained by the server.');
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    setIsFullscreen(Boolean(document.fullscreenElement));

    // Multiple-tab guard: another tab claiming this attempt is a duplicate.
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`ofijan-exam-${attemptId}`);
      channel.onmessage = (event) => {
        if (event.data?.type === 'claim' && event.data?.from !== attemptId) {
          void reportEvent('MULTIPLE_TAB_DETECTED', { where: 'client' });
          setBanner('This examination appears to be open in another tab. Close the other tab.');
        }
      };
      channel.postMessage({ type: 'claim', from: attemptId });
    } catch {
      channel = null;
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      channel?.close();
    };
  }, [attemptId, phase, reportEvent, submitNow]);

  // --- unsaved answers guard ---------------------------------------------
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current.size > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Flush queued saves when leaving the page.
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void (async () => {
        for (const id of [...pendingRef.current.keys()]) {
          await flushQuestion(id);
        }
      })();
    },
    [flushQuestion],
  );

  const onReauthorize = async () => {
    if (reauthBusy) return;
    setReauthBusy(true);
    setReauthError('');
    try {
      const snapshot = await realExamApi.reauthorize(Number(attemptId), reauthPassword);
      noteServerTime(snapshot.server_time ?? null);
      if (snapshot.expires_at) expiresAtRef.current = Date.parse(snapshot.expires_at);
      statusRef.current = 'active';
      setAttemptStatus('active');
      setLocked(false);
      setReauthPassword('');
      setBanner('Attempt unlocked. The countdown kept running while it was locked.');
      void requestFullscreen();
    } catch (err) {
      setReauthError(
        err instanceof ApiError ? err.message : 'Your password could not be verified.',
      );
    } finally {
      setReauthBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="attempt-page">
        <LoadingBlock label="Preparing your examination…" />
      </div>
    );
  }

  if (phase === 'error' || !exam || questions.length === 0) {
    const err = bootError;
    const expired = err instanceof ApiError && err.status === 423;
    return (
      <div className="attempt-page">
        <header className="attempt-top">
          <Link href={`/exams/${examId}`} className="attempt-brand" data-testid="link-attempt-back">
            <span className="brand-mark">
              <GraduationCap size={19} />
            </span>
            <span>
              <strong>Madda Walabu</strong>
              <small>Examination</small>
            </span>
          </Link>
        </header>
        {expired ? (
          <>
            <div className="exam-alert" role="status">
              <Clock3 size={17} />
              <span>This attempt has ended on the server.</span>
            </div>
            <Link
              href={`/exams/${examId}/submission/${attemptId}`}
              className="button button-primary"
              data-testid="link-expired-submission"
            >
              View submission status
            </Link>
          </>
        ) : (
          <>
            <ErrorBox error={err ?? 'This examination could not be loaded.'} />
            <Link href={`/exams/${examId}`} className="text-link">
              <ChevronLeft size={15} /> Back to examination details
            </Link>
          </>
        )}
      </div>
    );
  }

  if (attemptStatus === 'ended' && endedRef.current && confirmSubmit === false && submitting === false) {
    return (
      <div className="attempt-page">
        <div className="exam-alert" role="status">
          <Clock3 size={17} />
          <span>Finalising your attempt…</span>
        </div>
        <Link href={`/exams/${examId}/submission/${attemptId}`} className="button button-primary">
          View submission status
        </Link>
      </div>
    );
  }

  // ─── ADDED: Helper to find section for question ────────────────────────
  const getSectionForQuestion = (qId: number) => 
    sections.find(s => s.question_ids.includes(qId));

  const question = questions[current];
  const total = questions.length;
  const unanswered = total - answeredCount;
  const urgent = remaining !== null && remaining <= 60;
  const warning = remaining !== null && remaining > 60 && remaining <= 300;
  const lockedNow = locked || attemptStatus === 'locked';
  const readOnly = attemptStatus !== 'active';

  const warnThreshold = settingsRef.current?.escalation_warn_at ?? null;
  const thresholdReached =
    violationScore !== null &&
    ((settingsRef.current ? (settingsRef.current.escalation_lock_at ?? null) : null) ?? 999) <=
      violationScore;
  const warned =
    violationScore !== null && warnThreshold !== null && violationScore >= warnThreshold;

  const currentSection = getSectionForQuestion(question.id);

  return (
    <div className="attempt-page">
      <header className="attempt-top">
        <Link href={`/exams/${examId}`} className="attempt-brand" data-testid="link-attempt-back">
          <span className="brand-mark">
            <GraduationCap size={19} />
          </span>
          <span>
            <strong>{exam.exam_title}</strong>
            <small>{exam.course?.code ?? exam.category?.name ?? 'Examination'}</small>
          </span>
        </Link>

        <div
          className={`timer${urgent ? ' timer-urgent' : warning ? ' timer-warning' : ''}`}
          data-testid="value-countdown"
          aria-live="off"
        >
          <Clock3 size={18} />
          <span>
            <small>TIME REMAINING</small>
            <strong>{formatCountdown(remaining ?? 0)}</strong>
          </span>
        </div>

        <div className="save-status" data-testid="status-save">
          {saveState === 'saved' && (
            <>
              <Check size={15} /> Saved on server
            </>
          )}
          {saveState === 'saving' && (
            <>
              <span className="save-dot" /> Saving…
            </>
          )}
          {saveState === 'idle' && (
            <>
              <Check size={15} /> Ready
            </>
          )}
          {saveState === 'error' && (
            <>
              <CircleAlert size={15} /> Not saved — retry
            </>
          )}
        </div>

        {saveState === 'error' && (
          <button
            type="button"
            className="button button-secondary"
            data-testid="button-retry-save"
            onClick={() => {
              setSaveState('saving');
              void (async () => {
                for (const id of [...pendingRef.current.keys()]) await flushQuestion(id);
                setSaveState(pendingRef.current.size ? 'error' : 'saved');
              })();
            }}
          >
            Retry save
          </button>
        )}

        <Button
          variant="secondary"
          testId="button-fullscreen"
          onClick={() => void (isFullscreen ? document.exitFullscreen() : requestFullscreen())}
        >
          {isFullscreen ? 'Exit full screen' : 'Enter full screen'}
        </Button>
      </header>

      {!online && (
        <div className="exam-alert alert-error" role="alert" data-testid="offline-banner">
          <WifiOff size={17} />
          <span>You are offline. The server will keep enforcing the deadline.</span>
        </div>
      )}
      {online && realRef.current && (settingsRef.current?.network_disconnect_policy ?? 'resume') === 'resume' && (
        <div className="save-status online-indicator" aria-hidden="true">
          <Wifi size={14} /> Connected
        </div>
      )}

      {banner && (
        <div className="exam-alert" role="status">
          <CircleAlert size={17} />
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner('')} aria-label="Dismiss notice" data-testid="button-dismiss-notice">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="exam-alert alert-error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {warned && !thresholdReached && (
        <div className="exam-alert" role="status" data-testid="violation-warning">
          <CircleAlert size={17} />
          <span>
            Integrity notice: some activity in this window has been recorded against your attempt
            {typeof violationScore === 'number' ? ` (score ${violationScore})` : ''}. Repeated
            violations can end your attempt automatically.
          </span>
        </div>
      )}

      <div className="attempt-body">
        <aside className="question-nav panel">
          <div className="eyebrow">QUESTION NAVIGATION</div>
          <div className="question-nav-summary">
            <strong data-testid="answered-count">
              {answeredCount} of {total}
            </strong>
            <span>answered</span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
          </div>
          <div className="question-grid">
            {questions.map((item, index) => (
              <button
                key={item.id}
                data-testid={`button-question-${index + 1}`}
                aria-label={`Go to question ${index + 1}${review.includes(item.id) ? ', marked for review' : ''}`}
                onClick={() => setCurrent(index)}
                className={`question-number${index === current ? ' question-current' : ''}${
                  hasValue(answers[item.id]) ? ' question-answered' : ''
                }${review.includes(item.id) ? ' question-review' : ''}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="legend">
            <span>
              <i className="legend-answer" /> Answered
            </span>
            <span>
              <i className="legend-review" /> Review
            </span>
            <span>
              <i className="legend-current" /> Current
            </span>
          </div>
          <div className="nav-help">
            Answers are stored on the examination server as you work. Keep this window open until
            you submit.
          </div>
        </aside>

        <section className="question-stage">
          {/* ─── Section Header Rendering ────────────────────────── */}
          {currentSection && (
            <div className="section-header">
              <h3>{currentSection.formatted_heading}</h3>
              {currentSection.instructions && (
                <div className="section-instructions">
                  <p>{currentSection.instructions}</p>
                </div>
              )}
              {currentSection.shared_material_content && (
                <div 
                  className="shared-material"
                  dangerouslySetInnerHTML={{ __html: currentSection.shared_material_content }}
                />
              )}
            </div>
          )}

          <div className="question-stage-head">
            <span>
              QUESTION {String(current + 1).padStart(2, '0')} <i>OF</i> {String(total).padStart(2, '0')}
            </span>
            <span className="marks-label">{question.points ?? 1} mark{(question.points ?? 1) === 1 ? '' : 's'}</span>
          </div>

          <div className="question-content">
            {settingsRef.current?.watermark_enabled && (
              <div className="exam-watermark" aria-hidden="true">
                {settingsRef.current.watermark_text}
                {user?.name ? ` · ${user.name}` : ''}
              </div>
            )}
            <div className="question-type">
              {question.question_type === 'essay' || question.question_type === 'blank'
                ? 'WRITE YOUR ANSWER'
                : question.question_type === 'true_false'
                  ? 'TRUE OR FALSE'
                  : question.options.length > 4
                    ? 'SELECT ALL THAT APPLY'
                    : 'SELECT ONE'}
            </div>
            <h1>{question.question_text}</h1>

            <AnswerField
              question={question}
              value={answers[question.id]}
              disabled={readOnly}
              onChange={(payload) => updateAnswer(question.id, payload)}
            />

            <button
              type="button"
              className={`review-toggle${review.includes(question.id) ? ' review-on' : ''}`}
              onClick={() =>
                setReview((previous) =>
                  previous.includes(question.id)
                    ? previous.filter((id) => id !== question.id)
                    : [...previous, question.id],
                )
              }
              data-testid="button-mark-review"
            >
              {review.includes(question.id) ? <Check size={16} /> : <span className="review-flag" />}
              {review.includes(question.id) ? 'Marked for review' : 'Mark for review'}
            </button>
          </div>

          <div className="question-controls">
            <Button
              variant="secondary"
              testId="button-previous"
              disabled={current === 0}
              onClick={() => setCurrent((index) => Math.max(0, index - 1))}
            >
              <ChevronLeft size={17} /> Previous
            </Button>
            <button
              type="button"
              className="clear-answer"
              data-testid="button-clear-answer"
              disabled={readOnly || !hasValue(answers[question.id])}
              onClick={() => updateAnswer(question.id, { option_id: null, text: '' })}
            >
              Clear answer
            </button>
            {current < total - 1 ? (
              <Button testId="button-next" onClick={() => setCurrent((index) => Math.min(total - 1, index + 1))}>
                Next question <ChevronRight size={17} />
              </Button>
            ) : (
              <Button testId="button-review-submit" onClick={() => setConfirmSubmit(true)}>
                Review and submit <ChevronRight size={17} />
              </Button>
            )}
          </div>
        </section>
      </div>

      {lockedNow && (
        <div className="modal-backdrop">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="lock-title">
            <div className="modal-icon">
              <Lock size={20} />
            </div>
            <div className="eyebrow">ATTEMPT LOCKED</div>
            <h2 id="lock-title">Verify your identity to continue</h2>
            <p>
              Your attempt was locked by the integrity monitor. Re-enter your account password to
              unlock it — the countdown keeps running.
            </p>
            <div className="password-field modal-password">
              <label htmlFor="reauth-password" className="sr-only">
                Account password
              </label>
              <input
                id="reauth-password"
                data-testid="input-reauth-password"
                type="password"
                value={reauthPassword}
                placeholder="Your account password"
                onChange={(event) => setReauthPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            {reauthError && <div className="error-box">{reauthError}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-primary"
                data-testid="button-reauth-submit"
                disabled={!reauthPassword || reauthBusy}
                onClick={() => void onReauthorize()}
              >
                {reauthBusy ? <Loader2 size={16} className="spin" /> : null} Unlock attempt
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmSubmit && !lockedNow && (
        <div className="modal-backdrop">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <div className="modal-icon">
              <Check size={20} />
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label="Close dialog"
              data-testid="button-close-submit-dialog"
              onClick={() => setConfirmSubmit(false)}
            >
              ✕
            </button>
            <div className="eyebrow">FINAL CHECK</div>
            <h2 id="submit-title">Submit this assessment?</h2>
            <p>
              Your answers will be finalized by the examination server. You cannot change answers
              after submission.
            </p>
            <div className="submit-summary">
              <span>
                Answered <strong data-testid="summary-answered">{answeredCount} of {total}</strong>
              </span>
              <span>
                Unanswered <strong data-testid="summary-unanswered">{unanswered}</strong>
              </span>
              <span>
                Marked for review <strong>{review.length}</strong>
              </span>
              <span>
                Time left <strong>{formatCountdown(remaining ?? 0)}</strong>
              </span>
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                data-testid="button-keep-working"
                onClick={() => setConfirmSubmit(false)}
              >
                Keep working
              </button>
              <button
                type="button"
                className="button button-primary"
                data-testid="button-confirm-submit"
                disabled={submitting}
                onClick={() => void submitNow(false)}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin" /> Submitting…
                  </>
                ) : (
                  'Confirm submission'
                )}
              </button>
            </div>
            <small className="modal-caveat">
              Submission is final. The server records the official time of submission.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`button button-${variant}`}
    >
      {children}
    </button>
  );
}

function AnswerField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: QuestionPayload;
  value: SavedAnswer | undefined;
  disabled?: boolean;
  onChange: (answer: SavedAnswer) => void;
}) {
  const textTypes = ['essay', 'blank', 'short_answer', 'short', 'written'];

  if (textTypes.includes(question.question_type) || question.options.length === 0) {
    return (
      <div className="short-answer">
        <label className="sr-only" htmlFor={`answer-${question.id}`}>
          Your answer
        </label>
        <textarea
          id={`answer-${question.id}`}
          aria-label="Your answer"
          data-testid={`input-answer-${question.id}`}
          value={value?.text ?? ''}
          disabled={disabled}
          maxLength={10000}
          placeholder="Write your answer here…"
          onChange={(event) => onChange({ option_id: null, text: event.target.value })}
        />
        <div>{(value?.text ?? '').length} / 10000 characters · saved to the server as you type</div>
      </div>
    );
  }

  return (
    <div className="answer-options" role="radiogroup" aria-label="Answer options">
      {question.options.map((option, index) => {
        const selected = value?.option_id === option.id;
        return (
          <button
            type="button"
            key={option.id}
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            disabled={disabled}
            className={`answer-option${selected ? ' answer-selected' : ''}`}
            data-testid={`option-${question.id}-${index}`}
            onClick={() => onChange({ option_id: option.id, text: undefined })}
          >
            <span className="option-mark">{selected && <Check size={15} />}</span>
            <span>{option.option_text}</span>
          </button>
        );
      })}
    </div>
  );
}
