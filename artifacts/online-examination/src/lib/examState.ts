import type { Attempt, Exam } from './types';
import { serverNow } from './api';

export type ExamStudentState =
  | 'Upcoming'
  | 'Available'
  | 'In Progress'
  | 'Submitted'
  | 'Completed'
  | 'Missed'
  | 'Other department';

export function latestAttemptFor(examId: number, attempts: Attempt[]): Attempt | undefined {
  let latest: Attempt | undefined;
  for (const attempt of attempts) {
    if (attempt.exam_id !== examId) continue;
    if (!latest) {
      latest = attempt;
      continue;
    }
    const a = Date.parse(attempt.created_at ?? attempt.start_time ?? '') || 0;
    const b = Date.parse(latest.created_at ?? latest.start_time ?? '') || 0;
    if (a >= b) latest = attempt;
  }
  return latest;
}

export function isActiveAttempt(attempt: Attempt | undefined): boolean {
  if (!attempt) return false;
  if (attempt.attempt_status) return attempt.attempt_status === 'active';
  return attempt.status === 'started' || attempt.status === 'in_progress';
}

export function isFinishedAttempt(attempt: Attempt | undefined): boolean {
  if (!attempt) return false;
  if (attempt.attempt_status) {
    return ['submitted', 'completed', 'graded'].includes(attempt.attempt_status);
  }
  return ['completed', 'graded'].includes(attempt.status);
}

/**
 * Derive the student-facing status of an exam from backend-provided fields
 * only (availability window, attempt record, department ownership).
 */
export function getStudentExamState(
  exam: Exam,
  attempts: Attempt[],
  userDepartmentId?: number | null,
): ExamStudentState {
  const attempt = latestAttemptFor(exam.id, attempts);

  if (attempt && isFinishedAttempt(attempt)) return 'Completed';

  if (attempt && isActiveAttempt(attempt)) {
    const expires = attempt.expires_at ? Date.parse(attempt.expires_at) : null;
    if (expires !== null && expires <= serverNow()) return 'Completed';
    return 'In Progress';
  }

  if (
    exam.department_id &&
    userDepartmentId &&
    Number(exam.department_id) !== Number(userDepartmentId)
  ) {
    return 'Other department';
  }

  const now = serverNow();
  if (exam.active_from && now < Date.parse(exam.active_from)) return 'Upcoming';
  if (exam.active_until && now > Date.parse(exam.active_until)) return 'Missed';

  return 'Available';
}

export function stateTone(
  state: ExamStudentState,
): 'green' | 'purple' | 'amber' | 'neutral' | 'red' {
  switch (state) {
    case 'Available':
    case 'Completed':
      return 'green';
    case 'In Progress':
      return 'amber';
    case 'Upcoming':
      return 'purple';
    case 'Missed':
    case 'Other department':
      return 'red';
    default:
      return 'neutral';
  }
}

/** Primary action label for an exam card. */
export function stateAction(state: ExamStudentState): string {
  switch (state) {
    case 'In Progress':
      return 'Resume assessment';
    case 'Available':
      return 'View instructions';
    case 'Completed':
      return 'View outcome';
    case 'Upcoming':
      return 'View schedule';
    case 'Missed':
      return 'View details';
    default:
      return 'View details';
  }
}
