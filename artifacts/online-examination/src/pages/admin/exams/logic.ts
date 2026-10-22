/**
 * Shared logic for the admin exam-management pages.
 *
 * Status derivation mirrors the backend's decorate() precedence
 * (TeacherRealExamController) and the transition guards of ExamLifecycle —
 * the server remains authoritative; these helpers only shape the UI and
 * pre-flight the exact rules so the admin sees blockers before a 422.
 */
import { serverNow } from '../../../lib/api';
import type { AdminRealExam, AdminQuestionRow } from '../../../lib/types';

export type ExamPhase = 'draft' | 'published' | 'scheduled' | 'running' | 'completed' | 'unknown';

/** Human status derived exactly like the backend's decorate(). */
export function examPhase(exam: AdminRealExam, nowMs: number = serverNow()): ExamPhase {
  if (exam.lifecycle_status === 'completed' || (exam.completed_at && exam.completed_at !== 'null')) {
    return 'completed';
  }
  if (exam.started_at && exam.started_at !== 'null') return 'running';
  if (exam.lifecycle_status === 'ready' || exam.lifecycle_status === 'published') {
    if (exam.active_from && Date.parse(exam.active_from) > nowMs) return 'scheduled';
    return 'published';
  }
  if (exam.lifecycle_status === 'draft') return 'draft';
  return 'unknown';
}

export const PHASE_LABEL: Record<ExamPhase, string> = {
  draft: 'Draft',
  published: 'Published',
  scheduled: 'Scheduled',
  running: 'Running',
  completed: 'Completed',
  unknown: 'Unknown',
};

export const PHASE_TONE: Record<ExamPhase, 'neutral' | 'green' | 'amber' | 'purple' | 'red' | 'blue'> = {
  draft: 'neutral',
  published: 'green',
  scheduled: 'purple',
  running: 'amber',
  completed: 'blue',
  unknown: 'red',
};

/**
 * Client mirror of TeacherRealExamController::readyBlockers — the exact list
 * the server enforces before an exam may be published.
 */
export function readyBlockers(exam: AdminRealExam): string[] {
  const blockers: string[] = [];
  if (!exam.department_id) blockers.push('A target department is required.');
  if (!exam.total_time || exam.total_time <= 0) blockers.push('Allocated time must be greater than zero.');
  if (!exam.has_password) blockers.push('An exam password must be set.');
  if (!exam.questions_count || exam.questions_count <= 0) blockers.push('At least one question must be attached.');
  if (!exam.assigned_count || exam.assigned_count <= 0) blockers.push('At least one student must be assigned.');
  return blockers;
}

/** TeacherRealExamController::canStart — plus the lifecycle draft guard. */
export function canStart(exam: AdminRealExam): boolean {
  const status = exam.lifecycle_status;
  const notStarted = !exam.started_at || exam.started_at === 'null';
  const notCompleted = !exam.completed_at || exam.completed_at === 'null';
  return (status === 'ready' || status === 'published') && notStarted && notCompleted;
}

/** TeacherRealExamController::canRevertToDraft. */
export function canRevert(exam: AdminRealExam): boolean {
  return exam.lifecycle_status === 'ready' || exam.lifecycle_status === 'published';
}

/** TeacherRealExamController::canComplete — finalize a running session. */
export function canComplete(exam: AdminRealExam): boolean {
  const started = Boolean(exam.started_at) && exam.started_at !== 'null';
  const notCompleted = !exam.completed_at || exam.completed_at === 'null';
  return started && notCompleted;
}

/** Once attempts exist, questions and assignments are locked by the server. */
export function attemptsExist(exam: AdminRealExam): boolean {
  return (exam.ongoing_attempts ?? 0) > 0 || (exam.completed_attempts ?? 0) > 0;
}

export function questionTotalMarks(questions: AdminQuestionRow[]): number {
  return questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
}

/** Backend question types that the student exam UI can actually render. */
export const SUPPORTED_QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'matching', label: 'Matching' },
  { value: 'blank', label: 'Fill in the blank' },
  { value: 'essay', label: 'Essay (written answer)' },
] as const;

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  mcq: 'Multiple choice',
  true_false: 'True / False',
  single_choice: 'Single choice',
  matching: 'Matching',
  essay: 'Essay',
  blank: 'Fill in the blank',
  programming: 'Programming',
};

export const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const;

export function fmtDate(iso?: string | null): string {
  if (!iso || iso === 'null') return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDay(iso?: string | null): string {
  if (!iso || iso === 'null') return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function fmtMinutes(minutes?: number | null): string {
  if (!minutes && minutes !== 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** todatetime-local value (local time, minutes precision) from ISO / null. */
export function toDatetimeLocal(iso?: string | null): string {
  if (!iso || iso === 'null') return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const d = new Date(parsed);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
