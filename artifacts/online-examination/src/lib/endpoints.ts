/**
 * Verified endpoint map for the Ofijan student examination backend.
 *
 * Every function below targets a route that exists in
 * `ofijan-backend/routes/api/v1/*.php` (see AUDIT.md for the full matrix).
 * No endpoint here is invented, and no function invents response fields.
 */
import { ApiError, apiRequest } from './api';
import type {
  Attempt,
  AttemptResult,
  Envelope,
  EventResponse,
  Exam,
  ExamQuestionsResponse,
  HeartbeatData,
  LoginResponse,
  Paginated,
  QuestionPayload,
  RealAttemptQuestionsResponse,
  RealExamPublicSettings,
  RealStartData,
  RealSubmitData,
  StandardSubmitResponse,
  StartAttemptResponse,
  User,
  VerifyPasswordResponse,
} from './types';

/** Unwrap a BaseController envelope, turning failures into typed errors. */
function unwrap<T>(envelope: Envelope<T> | null | undefined, fallback: string): T {
  if (!envelope) throw new ApiError(fallback, 502, 'parse');
  if (envelope.success === false) {
    throw new ApiError(envelope.message || fallback, 400, 'http', undefined, envelope.errors);
  }
  if (envelope.data === undefined || envelope.data === null) {
    throw new ApiError(envelope.message || fallback, 502, 'parse');
  }
  return envelope.data;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const authApi = {
  /** POST /v1/login — throttled 5/min by the backend. Student-only. */
  async login(email: string, password: string): Promise<LoginResponse> {
    const envelope = await apiRequest<Envelope<LoginResponse>>('/v1/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    return unwrap(envelope, 'Sign-in failed.');
  },

  /** POST /v1/staff-login — throttled 5/min. For admin, teacher, encoder, promoter roles. */
  async staffLogin(email: string, password: string): Promise<LoginResponse> {
    const envelope = await apiRequest<Envelope<LoginResponse>>('/v1/staff-login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    return unwrap(envelope, 'Staff sign-in failed.');
  },

  /** GET /v1/profile — the authoritative identity of the signed-in user. */
  async profile(signal?: AbortSignal): Promise<User> {
    const envelope = await apiRequest<Envelope<{ user: User }>>('/v1/profile', { signal });
    return unwrap(envelope, 'Could not load your profile.').user;
  },

  /** POST /v1/logout — invalidates the current Sanctum token server-side. */
  async logout(): Promise<void> {
    try {
      await apiRequest('/v1/logout', { method: 'POST' });
    } catch {
      /* the local session is cleared regardless */
    }
  },

  /**
   * POST /v1/change-password — requires the current password. After a
   * successful call the backend clears `must_change_password`.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/v1/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, password: newPassword, password_confirmation: newPassword },
    });
  },
};

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export const examApi = {
  /**
   * GET /exams — active exams, audience-filtered server-side for this user
   * (department + premium + explicit student assignments are applied by the
   * backend; opening an exam is gated again by its middlewares).
   */
  async list(params: {
    page?: number;
    perPage?: number;
    deptId?: number | null;
    query?: string;
    category?: string;
    signal?: AbortSignal;
  }): Promise<Paginated<Exam>> {
    const { page = 1, perPage = 24, deptId, query, category, signal } = params;
    return apiRequest<Paginated<Exam>>('/v1/exams', {
      query: { page, per_page: perPage, dept_id: deptId ?? undefined, query, category },
      signal,
    });
  },

  /** GET /exams/{id} — full exam record incl. instructions (department-gated). */
  async get(id: number | string, signal?: AbortSignal): Promise<Exam> {
    const envelope = await apiRequest<Envelope<Exam>>(`/v1/exams/${id}`, { signal });
    return unwrap(envelope, 'Could not load this examination.');
  },

  /** GET /exams/{id}/questions — student-safe questions (no answer keys). */
  async questions(id: number | string, signal?: AbortSignal): Promise<ExamQuestionsResponse> {
    return apiRequest<ExamQuestionsResponse>(`/v1/exams/${id}/questions`, { signal });
  },
};

// ---------------------------------------------------------------------------
// Standard attempt flow (study/test/gaming modes)
// ---------------------------------------------------------------------------

export const attemptApi = {
  /**
   * POST /student/exams/{examId}/start
   * Backend re-validates department access, premium/audience entitlement,
   * allowed modes and ongoing attempts; a repeated call returns the existing
   * attempt instead of creating a second one.
   */
  async start(examId: number, mode: string): Promise<StartAttemptResponse> {
    const body = await apiRequest<StartAttemptResponse & Partial<Envelope<never>>>(
      `/v1/student/exams/${examId}/start`,
      { method: 'POST', body: { exam_id: examId, mode } },
    );
    if (!body || typeof body !== 'object' || !('attempt' in body)) {
      throw new ApiError('The examination could not be started.', 502, 'parse');
    }
    return body as StartAttemptResponse;
  },

  /**
   * POST /student/exams/attempts/{attemptId}/answer
   * Progressive answer save. NOTE: this endpoint is not idempotent upstream
   * (see AUDIT.md defect B-2), so the caller debounces and de-duplicates.
   */
  async saveAnswer(
    attemptId: number,
    payload: { question_id: number; selected_option_id?: number | null; answer_text?: string | null },
  ): Promise<void> {
    await apiRequest(`/v1/student/exams/attempts/${attemptId}/answer`, {
      method: 'POST',
      body: { attempt_id: attemptId, ...payload },
    });
  },

  /**
   * POST /student/exams/attempts/{attemptId}/submit — final grading happens
   * server-side (ExamSubmissionService); the client never sends marks.
   */
  async submit(
    attemptId: number,
    answers: { question_id: number; selected_option_id?: number | null; answer_text?: string | null }[],
    timeTaken?: number,
  ): Promise<StandardSubmitResponse> {
    return apiRequest<StandardSubmitResponse>(
      `/v1/student/exams/attempts/${attemptId}/submit`,
      { method: 'POST', body: { answers, time_taken: timeTaken } },
    );
  },

  /** GET /student/exam-attempts — this student's attempts (10 per page). */
  async listMine(page = 1, signal?: AbortSignal): Promise<{ items: Attempt[]; hasMore: boolean }> {
    const envelope = await apiRequest<Envelope<Attempt[]>>('/v1/student/exam-attempts', {
      query: { page },
      signal,
    });
    const items = envelope.data ?? [];
    return { items, hasMore: items.length >= 10 };
  },

  /**
   * GET /exam-attempts/{attemptId} — ownership-checked attempt snapshot with
   * the saved answers (used to restore an attempt after a refresh).
   */
  async get(attemptId: number, signal?: AbortSignal): Promise<Attempt> {
    const body = await apiRequest<{ data?: Attempt } | Envelope<Attempt>>(
      `/v1/exam-attempts/${attemptId}`,
      { signal },
    );
    const attempt = (body as { data?: Attempt })?.data;
    if (!attempt) throw new ApiError('Could not load this attempt.', 502, 'parse');
    return attempt;
  },

  /** GET /student/exams/attempts/{attemptId}/result — completed attempts only. */
  async result(attemptId: number, signal?: AbortSignal): Promise<AttemptResult> {
    const envelope = await apiRequest<Envelope<AttemptResult>>(
      `/v1/student/exams/attempts/${attemptId}/result`,
      { signal },
    );
    return unwrap(envelope, 'Could not load this result.');
  },
};

// ---------------------------------------------------------------------------
// Real Exam flow (password-gated, server-authoritative)
// ---------------------------------------------------------------------------

export const realExamApi = {
  /** POST /real-exams/{exam}/verify-password — eligibility + password check. */
  async verifyPassword(examId: number, password: string): Promise<VerifyPasswordResponse> {
    const envelope = await apiRequest<Envelope<VerifyPasswordResponse>>(
      `/v1/real-exams/${examId}/verify-password`,
      { method: 'POST', body: { password } },
    );
    return unwrap(envelope, 'The exam password could not be verified.');
  },

  /**
   * POST /real-exams/{exam}/start — transactional; an existing active session
   * is resumed (HTTP 200 "Existing attempt resumed"), so retries and
   * double-clicks can never create a second attempt or reset the timer.
   */
  async start(examId: number, password: string): Promise<RealStartData> {
    const envelope = await apiRequest<Envelope<RealStartData>>(
      `/v1/real-exams/${examId}/start`,
      { method: 'POST', body: { password } },
    );
    return unwrap(envelope, 'The examination could not be started.');
  },

  /** GET /real-exam-attempts/{attempt} — authoritative clock + status. */
  async snapshot(attemptId: number, signal?: AbortSignal): Promise<RealStartData> {
    const envelope = await apiRequest<Envelope<RealStartData>>(
      `/v1/real-exam-attempts/${attemptId}`,
      { signal },
    );
    return unwrap(envelope, 'Could not load this attempt.');
  },

  /** GET /real-exam-attempts/{attempt}/questions — stable per-attempt order. */
  async questions(attemptId: number, signal?: AbortSignal): Promise<RealAttemptQuestionsResponse> {
    const envelope = await apiRequest<Envelope<RealAttemptQuestionsResponse>>(
      `/v1/real-exam-attempts/${attemptId}/questions`,
      { signal },
    );
    return unwrap(envelope, 'Could not load the questions for this attempt.');
  },

  /** POST /real-exam-attempts/{attempt}/answers — idempotent upsert upstream. */
  async saveAnswer(
    attemptId: number,
    payload: { question_id: number; option_id?: number | null; answer_text?: string | null },
  ): Promise<void> {
    await apiRequest(`/v1/real-exam-attempts/${attemptId}/answers`, {
      method: 'POST',
      body: payload,
    });
  },

  /** POST /real-exam-attempts/{attempt}/heartbeat — resyncs the countdown. */
  async heartbeat(attemptId: number): Promise<HeartbeatData> {
    const envelope = await apiRequest<Envelope<HeartbeatData>>(
      `/v1/real-exam-attempts/${attemptId}/heartbeat`,
      { method: 'POST', body: {} },
    );
    return unwrap(envelope, 'Could not reach the examination server.');
  },

  /** POST /real-exam-attempts/{attempt}/events — anti-cheating audit trail. */
  async reportEvent(
    attemptId: number,
    eventType: string,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<EventResponse | null> {
    try {
      const envelope = await apiRequest<Envelope<EventResponse>>(
        `/v1/real-exam-attempts/${attemptId}/events`,
        { method: 'POST', body: { event_type: eventType, metadata } },
      );
      return envelope.success === false ? null : (envelope.data ?? null);
    } catch {
      /* event reporting must never break the exam */
      return null;
    }
  },

  /** POST /real-exam-attempts/{attempt}/reauthorize — unlock a locked attempt. */
  async reauthorize(attemptId: number, password: string): Promise<RealStartData> {
    const envelope = await apiRequest<Envelope<RealStartData>>(
      `/v1/real-exam-attempts/${attemptId}/reauthorize`,
      { method: 'POST', body: { password } },
    );
    return unwrap(envelope, 'Your account password could not be verified.');
  },

  /** POST /real-exam-attempts/{attempt}/submit — idempotent finalization. */
  async submit(attemptId: number): Promise<RealSubmitData> {
    const envelope = await apiRequest<Envelope<RealSubmitData>>(
      `/v1/real-exam-attempts/${attemptId}/submit`,
      { method: 'POST', body: {} },
    );
    return unwrap(envelope, 'The examination could not be submitted.');
  },
};

// ---------------------------------------------------------------------------
// Notifications (dashboard / header)
// ---------------------------------------------------------------------------

export interface PortalNotification {
  id: number;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  is_read?: boolean;
  data?: Record<string, unknown> | null;
  created_at?: string | null;
  time_ago?: string | null;
}

export const notificationApi = {
  /** GET /notifications — the signed-in user's own notifications. */
  async list(signal?: AbortSignal): Promise<PortalNotification[]> {
    const body = await apiRequest<{ data?: PortalNotification[] }>(
      '/v1/notifications',
      { query: { per_page: 8 }, signal },
    );
    return body?.data ?? [];
  },
};

// ---------------------------------------------------------------------------
// Admin Dashboard
// ---------------------------------------------------------------------------

export const adminApi = {
  /** GET /admin/bi/dashboard/summary — system overview metrics. */
  async summary(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const envelope = await apiRequest<Envelope<Record<string, unknown>>>(
      '/v1/admin/bi/dashboard/summary',
      { signal },
    );
    return unwrap(envelope, 'Could not load admin dashboard summary.');
  },

  /** GET /admin/users — list users with filters. */
  async listUsers(params?: {
    role?: string;
    active?: boolean;
    telegram_available?: boolean;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<User>> {
    const body = await apiRequest<Paginated<User>>('/v1/admin/users', {
      query: params,
    });
    return body;
  },

  /** POST /admin/users — create a new user. */
  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    telegram_username?: string;
    department_id?: number;
  }): Promise<User> {
    const envelope = await apiRequest<Envelope<{ user: User }>>('/v1/admin/users', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create user.').user;
  },

  /** PUT /admin/users/{id} — update a user. */
  async updateUser(id: number, data: {
    name?: string;
    email?: string;
    role?: string;
    telegram_username?: string;
    department_id?: number;
  }): Promise<User> {
    const envelope = await apiRequest<Envelope<{ user: User }>>(`/v1/admin/users/${id}`, {
      method: 'PUT',
      body: data,
    });
    return unwrap(envelope, 'Could not update user.').user;
  },

  /** DELETE /admin/users/{id} — delete a user. */
  async deleteUser(id: number): Promise<void> {
    await apiRequest(`/v1/admin/users/${id}`, { method: 'DELETE' });
  },

  /** POST /admin/users/{id}/activate — activate a user. */
  async activateUser(id: number): Promise<User> {
    const envelope = await apiRequest<Envelope<{ user: User }>>(`/v1/admin/users/${id}/activate`, {
      method: 'POST',
    });
    return unwrap(envelope, 'Could not activate user.').user;
  },

  /** POST /admin/users/{id}/deactivate — deactivate a user. */
  async deactivateUser(id: number): Promise<User> {
    const envelope = await apiRequest<Envelope<{ user: User }>>(`/v1/admin/users/${id}/deactivate`, {
      method: 'POST',
    });
    return unwrap(envelope, 'Could not deactivate user.').user;
  },

  /** GET /admin/results/export — export system-wide results as Excel. */
  async exportResults(params?: {
    exam_id?: number;
    department_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<Blob> {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/admin/results/export`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('ofijan.student.token.v1')}`,
      },
    });
    if (!response.ok) throw new ApiError('Failed to export results', response.status, 'http');
    return response.blob();
  },
};

// ---------------------------------------------------------------------------
// Teacher Dashboard
// ---------------------------------------------------------------------------

export const teacherApi = {
  /** GET /teacher/real-exams — list teacher's real exams. */
  async listRealExams(params?: {
    page?: number;
    perPage?: number;
  }): Promise<Paginated<Exam>> {
    const body = await apiRequest<Paginated<Exam>>('/v1/teacher/real-exams', {
      query: params,
    });
    return body;
  },

  /** POST /teacher/real-exams — create a new real exam. */
  async createRealExam(data: {
    exam_title: string;
    category_id: number;
    department_id: number;
    duration_minutes: number;
    passing_percentage: number;
    instructions?: string;
  }): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>('/v1/teacher/real-exams', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create exam.').exam;
  },

  /** GET /teacher/real-exams/{id} — get exam details. */
  async getRealExam(id: number): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}`);
    return unwrap(envelope, 'Could not load exam.').exam;
  },

  /** PATCH /teacher/real-exams/{id} — update exam. */
  async updateRealExam(id: number, data: Partial<Exam>): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}`, {
      method: 'PATCH',
      body: data,
    });
    return unwrap(envelope, 'Could not update exam.').exam;
  },

  /** POST /teacher/real-exams/{id}/ready — set exam to ready state. */
  async setReady(id: number): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}/ready`, {
      method: 'POST',
      body: {},
    });
    return unwrap(envelope, 'Could not set exam to ready.').exam;
  },

  /** POST /teacher/real-exams/{id}/start — start the exam. */
  async startExam(id: number): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}/start`, {
      method: 'POST',
      body: {},
    });
    return unwrap(envelope, 'Could not start exam.').exam;
  },

  /** POST /teacher/real-exams/{id}/complete — complete the exam. */
  async completeExam(id: number): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}/complete`, {
      method: 'POST',
      body: {},
    });
    return unwrap(envelope, 'Could not complete exam.').exam;
  },

  /** POST /teacher/real-exams/{id}/revert-to-draft — revert to draft. */
  async revertToDraft(id: number): Promise<Exam> {
    const envelope = await apiRequest<Envelope<{ exam: Exam }>>(`/v1/teacher/real-exams/${id}/revert-to-draft`, {
      method: 'POST',
      body: {},
    });
    return unwrap(envelope, 'Could not revert exam to draft.').exam;
  },

  /** POST /teacher/real-exams/{id}/password — set exam password. */
  async setPassword(id: number, password: string): Promise<{ has_password: boolean }> {
    const envelope = await apiRequest<Envelope<{ has_password: boolean }>>(`/v1/teacher/real-exams/${id}/password`, {
      method: 'POST',
      body: { exam_password: password },
    });
    return unwrap(envelope, 'Could not set exam password.');
  },

  /** GET /teacher/real-exams/{id}/attempts — get exam attempts. */
  async getAttempts(id: number, params?: {
    filter?: string;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<Attempt>> {
    const body = await apiRequest<Paginated<Attempt>>(`/v1/teacher/real-exams/${id}/attempts`, {
      query: params,
    });
    return body;
  },

  /** GET /teacher/real-exams/{id}/students — get assigned students. */
  async getAssignedStudents(id: number, params?: {
    page?: number;
    perPage?: number;
  }): Promise<Paginated<User>> {
    const body = await apiRequest<Paginated<User>>(`/v1/teacher/real-exams/${id}/students`, {
      query: params,
    });
    return body;
  },

  /** POST /teacher/real-exams/{id}/students — assign students to exam. */
  async assignStudents(id: number, studentIds: number[]): Promise<{
    assigned: number[];
    skipped: Array<{ student_id: number; reason: string }>;
    total_assigned: number;
  }> {
    const envelope = await apiRequest<Envelope<{
      assigned: number[];
      skipped: Array<{ student_id: number; reason: string }>;
      total_assigned: number;
    }>>(`/v1/teacher/real-exams/${id}/students`, {
      method: 'POST',
      body: { student_ids: studentIds },
    });
    return unwrap(envelope, 'Could not assign students.');
  },

  /** DELETE /teacher/real-exams/{id}/students/{studentId} — unassign student. */
  async unassignStudent(id: number, studentId: number): Promise<void> {
    await apiRequest(`/v1/teacher/real-exams/${id}/students/${studentId}`, {
      method: 'DELETE',
    });
  },

  /** GET /teacher/departments/{departmentId}/students — get students by department. */
  async getDepartmentStudents(departmentId: number, params?: {
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<User>> {
    const body = await apiRequest<Paginated<User>>(`/v1/teacher/departments/${departmentId}/students`, {
      query: params,
    });
    return body;
  },

  /** POST /teacher/real-exams/{examId}/attempts/{attemptId}/grade — grade attempt. */
  async gradeAttempt(examId: number, attemptId: number, answers: Array<{
    question_id: number;
    is_correct: boolean;
    points: number;
    grading_notes?: string;
  }>): Promise<{
    graded: number[];
    skipped: Array<{ question_id: number; reason: string }>;
    updated_score: number;
    correct_answers: number;
    wrong_answers: number;
    total_points: number;
    max_points: number;
  }> {
    const envelope = await apiRequest<Envelope<{
      graded: number[];
      skipped: Array<{ question_id: number; reason: string }>;
      updated_score: number;
      correct_answers: number;
      wrong_answers: number;
      total_points: number;
      max_points: number;
    }>>(`/v1/teacher/real-exams/${examId}/attempts/${attemptId}/grade`, {
      method: 'POST',
      body: { answers },
    });
    return unwrap(envelope, 'Could not grade attempt.');
  },

  /** GET /teacher/real-exams/{examId}/results/export — export exam results as Excel. */
  async exportResults(examId: number): Promise<Blob> {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/teacher/real-exams/${examId}/results/export`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('ofijan.student.token.v1')}`,
      },
    });
    if (!response.ok) throw new ApiError('Failed to export results', response.status, 'http');
    return response.blob();
  },
};

// ---------------------------------------------------------------------------
// Shared helpers derived from backend-exposed fields only
// ---------------------------------------------------------------------------

/**
 * Whether the backend will route this exam through the Real Exam flow.
 * `RealExamService::isRealExam()` resolves the same signals server-side:
 * category slug `real-exam` (or `realexam`) / the category's `real_state`
 * mode, which ExamResource exposes through `allowed_modes`.
 */
export function isRealExam(exam: Pick<Exam, 'category' | 'allowed_modes' | 'has_password'>): boolean {
  const slug = (exam.category?.slug ?? '').toLowerCase().replace(/_/g, '-');
  if (slug === 'real-exam' || slug === 'realexam') return true;
  if (exam.allowed_modes?.includes('real_state')) return true;
  return false;
}

/**
 * Mode to send to the standard start endpoint: the official `test` mode when
 * the exam allows it, otherwise the first mode the backend declares.
 */
export function pickMode(exam: Pick<Exam, 'allowed_modes'>): string {
  const modes = exam.allowed_modes ?? [];
  if (modes.includes('test')) return 'test';
  if (modes.length > 0) return modes[0];
  return 'test';
}

/** Question types the backend grades from a selected option. */
export const OPTION_QUESTION_TYPES = new Set([
  'multiple_choice',
  'mcq',
  'true_false',
  'single_choice',
  'multiple',
]);
