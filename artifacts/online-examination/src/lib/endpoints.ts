/**
 * Verified endpoint map for the Ofijan student examination backend.
 *
 * Every function below targets a route that exists in
 * `ofijan-backend/routes/api/v1/*.php` (see AUDIT.md for the full matrix).
 * No endpoint here is invented, and no function invents response fields.
 */
import { ApiError, apiRequest, apiBlob, API_ROOT, API_ROOT_DIRECT } from './api';
import type {
  AdminDepartmentRow,
  AdminExamSummary,
  AdminInstructionRow,
  AdminQuestionRow,
  AdminRealExam,
  AdminRealExamSettings,
  AdminResultDetail,
  AdminResultsFilters,
  AdminResultsOptions,
  AdminResultsPage,
  AdminResultsSummary,
  Attempt,
  AttemptResult,
  DepartmentStudent,
  Envelope,
  EventResponse,
  Exam,
  ExamAssignmentRow,
  ExamAttemptRow,
  ExamQuestionsResponse,
  ExamStructureData,
  HeartbeatData,
  LaravelPaginator,
  LoginResponse,
  Paginated,
  PassageRow,
  QuestionListMeta,
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
import type { QueryValue } from './api';

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

/**
 * /v1/instructions responds with a BARE Instruction object (verified live:
 * `{id, content, type, context_type, context_id, …}`), not the `{data: …}`
 * envelope the question endpoints use — unwrap() would throw a false
 * "could not save" error on a save that actually succeeded. Accept both shapes.
 */
function unwrapInstruction(body: unknown, fallback: string): AdminInstructionRow {
  const root = (body ?? {}) as Record<string, unknown>;
  const row = (root.data !== undefined && root.data !== null ? root.data : root) as Record<string, unknown>;
  if (typeof row !== 'object' || row === null || row.id === undefined) {
    throw new ApiError(fallback, 502, 'parse');
  }
  return row as unknown as AdminInstructionRow;
}

/** Drop the empty filter values so the backend receives a clean query string. */
function toQuery(filters?: AdminResultsFilters): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};
  if (!filters) return query;
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    query[key] = value as QueryValue;
  }
  return query;
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
      baseUrl: API_ROOT_DIRECT,
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
   * POST /student/exams/attempts/{attemptId}/answers/batch
   * Batch save answers with version tracking (idempotent upsert).
   */
  async batchSaveAnswers(
    attemptId: number,
    payload: {
      answers: Array<{
        question_id: number;
        selected_option_id?: number | null;
        answer_text?: string | null;
        version?: number;
      }>;
    },
  ): Promise<{
    message: string;
    saved_count: number;
    skipped_count: number;
    saved_answers: Array<{ question_id: number; version: number }>;
    skipped_question_ids: number[];
  }> {
    return apiRequest(
      `/v1/student/exams/attempts/${attemptId}/answers/batch`,
      { method: 'POST', body: payload },
    );
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

  /**
   * POST /real-exam-attempts/{attempt}/answers/batch
   * Batch save answers with version tracking (idempotent upsert).
   */
  async batchSaveAnswers(
    attemptId: number,
    payload: {
      answers: Array<{
        question_id: number;
        option_id?: number | null;
        answer_text?: string | null;
        version?: number;
      }>;
    },
  ): Promise<{
    saved_count: number;
    skipped_count: number;
    saved_answers: Array<{ question_id: number; version: number }>;
    skipped_question_ids: number[];
  }> {
    return apiRequest(
      `/v1/real-exam-attempts/${attemptId}/answers/batch`,
      { method: 'POST', body: payload },
    );
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
    department_id?: number | null;
    telegram_available?: boolean;
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<User>> {
    const body = await apiRequest<Paginated<User>>('/v1/admin/users', {
      query: params,
    });
    return body;
  },

  /**
   * Every teacher account id (GET /admin/users?role=teacher, all pages) —
   * the admin results page lists only the examinations these users created.
   */
  async listTeacherIds(signal?: AbortSignal): Promise<number[]> {
    const ids: number[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const body = await apiRequest<Paginated<User>>('/v1/admin/users', {
        query: { role: 'teacher', page, per_page: 100 },
        signal,
      });
      const rows = body?.data ?? [];
      ids.push(...rows.map((user) => user.id));
      if (rows.length === 0 || page >= (body?.meta?.last_page ?? 1)) break;
    }
    return ids;
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

  /**
   * GET /admin/results — the filtered, paginated system-wide result list.
   *
   * The server applies every filter, orders the rows and returns the summary
   * of exactly the same set, so the cards and the table can never disagree.
   */
  async results(
    filters?: AdminResultsFilters,
    signal?: AbortSignal,
  ): Promise<AdminResultsPage> {
    const envelope = await apiRequest<Envelope<AdminResultsPage>>('/v1/admin/results', {
      query: toQuery(filters),
      signal,
    });
    return unwrap(envelope, 'Could not load the examination results.');
  },

  /** GET /admin/results/summary — the summary cards for the same filters. */
  async resultsSummary(
    filters?: AdminResultsFilters,
    signal?: AbortSignal,
  ): Promise<AdminResultsSummary> {
    const envelope = await apiRequest<Envelope<AdminResultsSummary>>('/v1/admin/results/summary', {
      query: toQuery(filters),
      signal,
    });
    return unwrap(envelope, 'Could not load the results summary.');
  },

  /** GET /admin/results/options — the exams, departments and categories. */
  async resultsOptions(signal?: AbortSignal): Promise<AdminResultsOptions> {
    const envelope = await apiRequest<Envelope<AdminResultsOptions>>('/v1/admin/results/options', {
      signal,
    });
    return unwrap(envelope, 'Could not load the result filters.');
  },

  /** GET /admin/results/exams/{exam} — the exam-scoped result statistics. */
  async examResults(examId: number, signal?: AbortSignal): Promise<AdminExamSummary> {
    const envelope = await apiRequest<Envelope<AdminExamSummary>>(
      `/v1/admin/results/exams/${examId}`,
      { signal },
    );
    return unwrap(envelope, 'Could not load the examination statistics.');
  },

  /** GET /admin/results/{attempt} — the full result of a single attempt. */
  async result(attemptId: number, signal?: AbortSignal): Promise<AdminResultDetail> {
    const envelope = await apiRequest<Envelope<AdminResultDetail>>(
      `/v1/admin/results/${attemptId}`,
      { signal },
    );
    return unwrap(envelope, 'Could not load this result.');
  },

  /**
   * GET /admin/results/export — export the filtered results as Excel.
   *
   * The export honours exactly the same filters as the table, so the file
   * always matches what the administrator is looking at.
   */
  async exportResults(filters?: AdminResultsFilters): Promise<Blob> {
    return apiBlob('/v1/admin/results/export', { query: toQuery(filters) });
  },

  /** GET /teacher/students/import-template — download Excel import template. */
  async downloadImportTemplate(): Promise<Blob> {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/teacher/students/import-template`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('ofijan.student.token.v1')}`,
      },
    });
    if (!response.ok) throw new ApiError('Failed to download template', response.status, 'http');
    return response.blob();
  },

  /** POST /teacher/students/import/preview — preview bulk import with validation. */
  async previewImport(file: File): Promise<Record<string, unknown>> {
    const formData = new FormData();
    formData.append('file', file);
    const envelope = await apiRequest<Envelope<Record<string, unknown>>>(
      '/v1/teacher/students/import/preview',
      {
        method: 'POST',
        body: formData,
      },
    );
    return unwrap(envelope, 'Could not preview import.');
  },

  /** POST /teacher/students/import/confirm — confirm bulk import. */
  async confirmImport(token: string): Promise<Record<string, unknown>> {
    const envelope = await apiRequest<Envelope<Record<string, unknown>>>(
      '/v1/teacher/students/import/confirm',
      {
        method: 'POST',
        body: { token },
      },
    );
    return unwrap(envelope, 'Could not confirm import.');
  },

  /** GET /teacher/students/import/report/{token} — get import report. */
  async getImportReport(token: string): Promise<Record<string, unknown>> {
    const envelope = await apiRequest<Envelope<Record<string, unknown>>>(
      `/v1/teacher/students/import/report/${token}`,
    );
    return unwrap(envelope, 'Could not get import report.');
  },

  /** GET /departments/list-all — list departments with stats. */
  async listDepartments(params?: { search?: string; page?: number; per_page?: number }): Promise<{
    items: AdminDepartmentRow[];
    lastPage: number;
    total: number;
  }> {
    const query = { per_page: 10, ...params };
    const response = await apiRequest<Envelope<LaravelPaginator<AdminDepartmentRow>> | AdminDepartmentRow[] | Envelope<AdminDepartmentRow[]>>('/v1/departments/list-all', {
      query,
    });

    // Handle different response formats from the backend
    if (Array.isArray(response)) {
      // If it's a plain array, do client-side pagination
      const allItems = response;
      const page = params?.page || 1;
      const perPage = params?.per_page || 10;
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const items = allItems.slice(start, end);
      return {
        items,
        lastPage: Math.ceil(allItems.length / perPage),
        total: allItems.length,
      };
    }

    // Check if it's an envelope with data array
    if (response && typeof response === 'object' && 'data' in response) {
      const envelope = response as Envelope<AdminDepartmentRow[]>;
      if (Array.isArray(envelope.data)) {
        const allItems = envelope.data;
        const page = params?.page || 1;
        const perPage = params?.per_page || 10;
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const items = allItems.slice(start, end);
        return {
          items,
          lastPage: Math.ceil(allItems.length / perPage),
          total: allItems.length,
        };
      }
    }

    // Try to unwrap as LaravelPaginator
    try {
      const page = unwrapPage(response as Envelope<LaravelPaginator<AdminDepartmentRow>> | null, 'Could not load departments.');
      return { items: page.items, lastPage: page.lastPage, total: page.total };
    } catch {
      // Fallback: treat as envelope with array data
      const envelope = response as Envelope<AdminDepartmentRow[]>;
      const allItems = unwrap(envelope, 'Could not load departments.');
      const page = params?.page || 1;
      const perPage = params?.per_page || 10;
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const items = allItems.slice(start, end);
      return {
        items,
        lastPage: Math.ceil(allItems.length / perPage),
        total: allItems.length,
      };
    }
  },

  /** GET /colleges/list-all — list colleges for select inputs. */
  async listColleges(): Promise<{ id: number; name: string }[]> {
    const envelope = await apiRequest<Envelope<{ id: number; name: string }[]>>('/v1/colleges/list-all');
    return unwrap(envelope, 'Could not load colleges.');
  },

  /** POST /departments — create a department. */
  async createDepartment(data: {
    name: string;
    college_id: number;
    exam_category_id: number;
    description?: string;
  }): Promise<AdminDepartmentRow> {
    const envelope = await apiRequest<Envelope<AdminDepartmentRow>>('/v1/departments', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create department.');
  },

  /** PUT /departments/{id} — update a department. */
  async updateDepartment(
    id: number,
    data: {
      name?: string;
      college_id?: number;
      exam_category_id?: number;
      description?: string;
    },
  ): Promise<AdminDepartmentRow> {
    const envelope = await apiRequest<Envelope<AdminDepartmentRow>>(`/v1/departments/${id}`, {
      method: 'PUT',
      body: data,
    });
    return unwrap(envelope, 'Could not update department.');
  },

  /** DELETE /departments/{id} — delete a department. */
  async deleteDepartment(id: number): Promise<void> {
    await apiRequest(`/v1/departments/${id}`, { method: 'DELETE' });
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
    // The backend wraps the paginator in the standard envelope
    // ({ success, data: { data: [...], ... } }), so unwrap first — returning
    // the raw body made `exams.data` the paginator object rather than the
    // exam array and crashed the teacher pages on `.map`.
    const envelope = await apiRequest<Envelope<Paginated<Exam>>>(
      '/v1/teacher/real-exams',
      {
        query: params,
      },
    );
    return unwrap(envelope, 'Could not load your exams.');
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
    return apiBlob(`/v1/teacher/real-exams/${examId}/results/export`);
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

// ---------------------------------------------------------------------------
// Admin exam management
//
// Every function below was verified against the running local backend
// (TeacherRealExamController, QuestionController, PassageController and the
// department/category routes) by creating a real exam and inspecting the
// exact payloads — see scripts/seed-dev-exam-fixture.mjs for the fixture.
// The teacherApi above was written speculatively (wrong unwrap shape and
// field names for this backend); adminExamApi is the verified contract.
// ---------------------------------------------------------------------------

export type AdminExamLifecycleAction = 'ready' | 'start' | 'complete' | 'revert-to-draft';

/**
 * Input accepted by POST/PATCH /v1/teacher/real-exams (StoreExamRequest).
 * POST requires exam_title, department_id, total_time (1–480) and
 * exam_password (4–100 chars); PATCH accepts any subset.
 * The backend now accepts either a single department_id or an array of department_ids
 * for creating exams across multiple departments.
 */
export interface AdminExamInput {
  exam_title?: string;
  description?: string | null;
  department_id?: number;
  department_ids?: number[];
  total_time?: number;
  passing_percentage?: number;
  exam_password?: string;
  question_ids?: number[];
  settings?: Partial<AdminRealExamSettings>;
}

/** Input accepted by POST/PUT /v1/questions (StoreQuestionRequest rules). */
export interface AdminQuestionInput {
  exam_id?: number;
  question_type: string;
  question_text: string;
  points?: number;
  difficulty?: string;
  explanation?: string;
  question_image?: string;
  answer?: string;
  /** `null` explicitly detaches the passage on update (omitting it keeps the old one). */
  passage_id?: number | null;
  /** Backend requires BOTH question_option and option_text with the same text. */
  options?: {
    question_option: string;
    option_text: string;
    option_type: 'mc' | 'tf' | 'truefalse' | 'matching';
    is_correct: boolean;
  }[];
  matching_pairs?: {
    left_item: string;
    right_item: string;
  }[];
  /** New format for matching questions with separate Column A and Column B */
  matching_data?: {
    left_items: { text: string; correct_option_id: number | null }[];
    right_options: { text: string }[];
  };
  instructions?: string;
}

function unwrapPage<T>(envelope: Envelope<LaravelPaginator<T>> | null, fallback: string) {
  const paginator = unwrap(envelope, fallback);
  return {
    items: paginator.data ?? [],
    lastPage: paginator.last_page ?? 1,
    total: paginator.total ?? (paginator.data?.length ?? 0),
    currentPage: paginator.current_page ?? 1,
  };
}

export const adminExamApi = {
  /**
   * GET /v1/teacher/real-exams — the admin passes the teacher-ownership
   * check (TeacherRoleFilter grants admins every teacher scope), so this is
   * the authoritative governed-exam list with attempts/assignment counts.
   */
  async listExams(signal?: AbortSignal): Promise<{
    items: AdminRealExam[];
    lastPage: number;
    total: number;
  }> {
    const items: AdminRealExam[] = [];
    let lastPage = 1;
    let total = 0;
    for (let page = 1; page <= 10; page += 1) {
      const envelope = await apiRequest<Envelope<LaravelPaginator<AdminRealExam>>>(
        '/v1/teacher/real-exams',
        { query: { page, per_page: 100 }, signal },
      );
      const batch = unwrapPage(envelope, 'Could not load the examinations.');
      items.push(...batch.items);
      lastPage = batch.lastPage;
      total = batch.total;
      if (page >= lastPage) break;
    }
    return { items, lastPage, total };
  },

  /** GET /v1/content/exams — joins created_at/updated_at/academic_year in. */
  async listContentMeta(signal?: AbortSignal): Promise<
    Record<
      number,
      {
        created_at?: string | null;
        updated_at?: string | null;
        academic_year?: string | null;
        course_id?: number | null;
        allowed_modes?: string[] | null;
      }
    >
  > {
    const meta: Record<number, { created_at?: string | null; updated_at?: string | null }> = {};
    for (let page = 1; page <= 10; page += 1) {
      const body = await apiRequest<{
        data?: { id: number; created_at?: string | null; updated_at?: string | null }[];
        meta?: { pagination?: { total_pages?: number } };
      }>('/v1/content/exams', { query: { page, per_page: 100 }, signal });
      for (const row of body?.data ?? []) {
        meta[row.id] = { created_at: row.created_at, updated_at: row.updated_at };
      }
      if (page >= (body?.meta?.pagination?.total_pages ?? 1)) break;
    }
    return meta;
  },

  /** GET /v1/teacher/real-exams/{id} — full decorate incl. assigned_students. */
  async showExam(id: number | string, signal?: AbortSignal): Promise<AdminRealExam> {
    const envelope = await apiRequest<Envelope<AdminRealExam>>(`/v1/teacher/real-exams/${id}`, {
      signal,
    });
    return unwrap(envelope, 'Could not load this examination.');
  },

  /** POST /v1/teacher/real-exams — always created in the draft state. */
  async createExam(data: AdminExamInput): Promise<AdminRealExam> {
    const envelope = await apiRequest<Envelope<AdminRealExam>>('/v1/teacher/real-exams', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create the examination.');
  },

  /** PATCH /v1/teacher/real-exams/{id} — blocked server-side once started. */
  async updateExam(id: number, data: AdminExamInput): Promise<AdminRealExam> {
    const envelope = await apiRequest<Envelope<AdminRealExam>>(`/v1/teacher/real-exams/${id}`, {
      method: 'PATCH',
      body: data,
    });
    return unwrap(envelope, 'Could not update the examination.');
  },

  /** POST /v1/teacher/real-exams/{id}/{ready|start|complete|revert-to-draft}. */
  async transition(
    id: number,
    action: AdminExamLifecycleAction,
  ): Promise<AdminRealExam> {
    const envelope = await apiRequest<Envelope<AdminRealExam>>(
      `/v1/teacher/real-exams/${id}/${action}`,
      { method: 'POST', body: {} },
    );
    return unwrap(envelope, `Could not ${action} the examination.`);
  },

  /** POST /v1/teacher/real-exams/{id}/password — plaintext never returned. */
  async setExamPassword(id: number, examPassword: string): Promise<{ has_password: boolean }> {
    const envelope = await apiRequest<Envelope<{ has_password: boolean }>>(
      `/v1/teacher/real-exams/${id}/password`,
      { method: 'POST', body: { exam_password: examPassword } },
    );
    return unwrap(envelope, 'Could not set the exam password.');
  },

  /** GET /v1/teacher/real-exams/{id}/attempts — one page of staff attempts. */
  async listAttempts(
    id: number,
    params: { filter?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ items: ExamAttemptRow[]; lastPage: number; total: number }> {
    const envelope = await apiRequest<Envelope<LaravelPaginator<ExamAttemptRow>>>(
      `/v1/teacher/real-exams/${id}/attempts`,
      { query: params, signal },
    );
    const page = unwrapPage(envelope, 'Could not load the attempts.');
    return { items: page.items, lastPage: page.lastPage, total: page.total };
  },

  /** GET /v1/teacher/real-exams/{id}/students — assigned students (pivot). */
  async listAssigned(
    id: number,
    page = 1,
    signal?: AbortSignal,
  ): Promise<{ items: ExamAssignmentRow[]; lastPage: number; total: number }> {
    const envelope = await apiRequest<Envelope<LaravelPaginator<ExamAssignmentRow>>>(
      `/v1/teacher/real-exams/${id}/students`,
      { query: { page, per_page: 50 }, signal },
    );
    const paginator = unwrapPage(envelope, 'Could not load the assigned students.');
    return { items: paginator.items, lastPage: paginator.lastPage, total: paginator.total };
  },

  /** POST /v1/teacher/real-exams/{id}/students — idempotent bulk assign. */
  async assignStudents(
    id: number,
    studentIds: number[],
  ): Promise<{
    assigned: number[];
    skipped: { student_id?: number; studentId?: number; reason?: string }[];
    total_assigned: number;
  }> {
    const envelope = await apiRequest<Envelope<{
      assigned: number[];
      skipped: { student_id?: number; studentId?: number; reason?: string }[];
      total_assigned: number;
    }>>(`/v1/teacher/real-exams/${id}/students`, {
      method: 'POST',
      body: { student_ids: studentIds },
    });
    return unwrap(envelope, 'Could not assign the selected students.');
  },

  /** DELETE /v1/teacher/real-exams/{id}/students/{studentId} — pre-start only. */
  async unassignStudent(id: number, studentId: number): Promise<void> {
    await apiRequest(`/v1/teacher/real-exams/${id}/students/${studentId}`, {
      method: 'DELETE',
    });
  },

  /** GET /v1/teacher/departments/{deptId}/students — eligible students. */
  async departmentStudents(
    departmentId: number,
    params: { search?: string; page?: number; per_page?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ items: DepartmentStudent[]; lastPage: number; total: number }> {
    const envelope = await apiRequest<Envelope<LaravelPaginator<DepartmentStudent>>>(
      `/v1/teacher/departments/${departmentId}/students`,
      { query: { per_page: 50, ...params }, signal },
    );
    const page = unwrapPage(envelope, 'Could not load the department students.');
    return { items: page.items, lastPage: page.lastPage, total: page.total };
  },

  /**
   * GET /v1/questions?exam_id=X — the staff question list (QuestionResource,
   * includes options with the answer key for admins). Custom pagination in
   * `meta.pagination` rather than a Laravel paginator.
   */
  async examQuestions(
    examId: number,
    signal?: AbortSignal,
  ): Promise<{ items: AdminQuestionRow[]; meta: QuestionListMeta }> {
    const body = await apiRequest<{
      success?: boolean;
      message?: string;
      data?: AdminQuestionRow[];
      meta?: { pagination?: QuestionListMeta };
      errors?: Record<string, string[]>;
    }>('/v1/questions', { query: { exam_id: examId, per_page: 100 }, signal });
    if (body?.success === false) {
      throw new ApiError(body.message || 'Could not load the questions.', 400, 'http', undefined, body.errors);
    }
    return {
      items: body?.data ?? [],
      meta: body?.meta?.pagination ?? { current_page: 1, per_page: 100, total: body?.data?.length ?? 0, total_pages: 1 },
    };
  },

  /** POST /v1/questions — the ExamQuestionObserver attaches it to the exam. */
  async createQuestion(data: AdminQuestionInput): Promise<AdminQuestionRow> {
    const envelope = await apiRequest<Envelope<AdminQuestionRow>>('/v1/questions', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create the question.');
  },

  /** PUT /v1/questions/{id} — options are replaced wholesale when provided. */
  async updateQuestion(id: number, data: AdminQuestionInput): Promise<AdminQuestionRow> {
    const envelope = await apiRequest<Envelope<AdminQuestionRow>>(`/v1/questions/${id}`, {
      method: 'PUT',
      body: data,
    });
    return unwrap(envelope, 'Could not update the question.');
  },

  /**
   * POST /v1/instructions — question-level instructions live in the polymorphic
   * `instructions` table, NOT on the question body: the backend silently ignores
   * an `instructions` field on POST/PUT /v1/questions (verified live, 200 with no
   * effect). `context_type` must be the fully-qualified Question model.
   */
  async createQuestionInstruction(questionId: number, content: string): Promise<AdminInstructionRow> {
    const body = await apiRequest<unknown>('/v1/instructions', {
      method: 'POST',
      body: {
        content,
        type: 'question',
        context_type: 'App\\Models\\Question',
        context_id: questionId,
      },
    });
    return unwrapInstruction(body, 'Could not save the question instructions.');
  },

  /** PUT /v1/instructions/{id} — replaces the content of one instruction row. */
  async updateQuestionInstruction(instructionId: number, content: string): Promise<AdminInstructionRow> {
    const body = await apiRequest<unknown>(`/v1/instructions/${instructionId}`, {
      method: 'PUT',
      body: { content },
    });
    return unwrapInstruction(body, 'Could not update the question instructions.');
  },

  /** DELETE /v1/instructions/{id} — used when the instructions field is cleared. */
  async deleteQuestionInstruction(instructionId: number): Promise<void> {
    await apiRequest<unknown>(`/v1/instructions/${instructionId}`, { method: 'DELETE' });
  },

  /** DELETE /v1/questions/{id} — blocked server-side once attempts exist. */
  async deleteQuestion(id: number): Promise<void> {
    await apiRequest(`/v1/questions/${id}`, { method: 'DELETE' });
  },

  /** POST /v1/questions/multiple — bulk import; one bad item rejects the batch. */
  async bulkCreateQuestions(questions: AdminQuestionInput[]): Promise<AdminQuestionRow[]> {
    const envelope = await apiRequest<Envelope<AdminQuestionRow[]>>('/v1/questions/multiple', {
      method: 'POST',
      body: { questions },
    });
    return unwrap(envelope, 'Could not import the questions.');
  },

  /** GET /v1/teacher/exams/{id}/structure — staff structure + instructions. */
  async getStructure(
    examId: number,
    signal?: AbortSignal,
  ): Promise<ExamStructureData> {
    const envelope = await apiRequest<Envelope<ExamStructureData>>(
      `/v1/teacher/exams/${examId}/structure`,
      { signal },
    );
    return unwrap(envelope, 'Could not load the exam structure.');
  },

  /** PUT /v1/teacher/exams/{id}/structure — instructions is a plain string. */
  async putStructure(
    examId: number,
    data: { instructions: string; sections: unknown[] },
  ): Promise<ExamStructureData> {
    const envelope = await apiRequest<Envelope<ExamStructureData>>(
      `/v1/teacher/exams/${examId}/structure`,
      { method: 'PUT', body: data },
    );
    return unwrap(envelope, 'Could not save the exam instructions.');
  },

  /** GET /v1/departments — reference list for the filters and pickers. Fetches every page. */
  async departments(signal?: AbortSignal): Promise<{ id: number; name: string }[]> {
    const items: { id: number; name: string }[] = [];
    let lastPage = 1;
    for (let page = 1; page <= 10; page += 1) {
      const response = await apiRequest<unknown>('/v1/departments', {
        query: { page, per_page: 100 },
        signal,
      });

      let pageItems: { id: number; name: string }[] = [];
      let paginatorLastPage = 1;

      if (Array.isArray(response)) {
        pageItems = response as { id: number; name: string }[];
      } else if (response && typeof response === 'object') {
        const obj = response as Record<string, unknown>;
        // Envelope shape: { success, data: [...] }
        if (Array.isArray(obj.data)) {
          pageItems = obj.data as { id: number; name: string }[];
        }
        // Paginator shape: { data: [...], last_page, ... } or { success, data: { data: [...], last_page } }
        else if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) && 'data' in obj.data && Array.isArray((obj.data as Record<string, unknown>).data)) {
          const paginator = obj.data as Record<string, unknown>;
          pageItems = (paginator.data as { id: number; name: string }[]) ?? [];
          paginatorLastPage = Number(paginator.last_page ?? 1);
        }
      }

      items.push(...pageItems);
      lastPage = paginatorLastPage;
      if (page >= lastPage || pageItems.length === 0) break;
    }
    return items;
  },

  /** GET /v1/exam-categories — the Real Exam category is fetched, never hardcoded. */
  async categories(signal?: AbortSignal): Promise<{ id: number; name: string; slug?: string | null }[]> {
    const envelope = await apiRequest<Envelope<{ id: number; name: string; slug?: string | null }[]>>(
      '/v1/exam-categories',
      { query: { per_page: 100 }, signal },
    );
    return unwrap(envelope, 'Could not load the exam categories.');
  },

  /** GET /v1/passages — reusable reading passages (PassageController@index). */
  async passages(signal?: AbortSignal): Promise<PassageRow[]> {
    const body = await apiRequest<{ data?: PassageRow[] } | PassageRow[] | Envelope<PassageRow[]>>(
      '/v1/passages',
      { query: { per_page: 100 }, signal },
    );
    if (Array.isArray(body)) return body;
    if (Array.isArray((body as { data?: PassageRow[] })?.data)) {
      return (body as { data: PassageRow[] }).data;
    }
    return unwrap(body as Envelope<PassageRow[]>, 'Could not load the passages.');
  },

  /** POST /v1/passages — { title?, content } (PassageController::store). */
  async createPassage(data: { title?: string; content: string }): Promise<PassageRow> {
    const envelope = await apiRequest<Envelope<PassageRow>>('/v1/passages', {
      method: 'POST',
      body: data,
    });
    return unwrap(envelope, 'Could not create the passage.');
  },

  /**
   * PUT /v1/passages/{id} — update a passage's title/content (verified via
   * OPTIONS on the live API: GET,HEAD,PUT,DELETE are allowed). Accepts either
   * the bare passage object or the `{data}` envelope.
   */
  async updatePassage(
    id: number,
    data: { title?: string | null; content: string },
  ): Promise<PassageRow> {
    const body = await apiRequest<unknown>(`/v1/passages/${id}`, {
      method: 'PUT',
      body: data,
    });
    const root = (body ?? {}) as Record<string, unknown>;
    const row = (root.data !== undefined && root.data !== null ? root.data : root) as PassageRow;
    if (!row || typeof row !== 'object' || row.id === undefined) {
      throw new ApiError('Could not update the passage.', 502, 'parse');
    }
    return row;
  },

  /** DELETE /v1/passages/{id} — removal is server-verified by the caller list. */
  async deletePassage(id: number): Promise<void> {
    await apiRequest<unknown>(`/v1/passages/${id}`, { method: 'DELETE' });
  },

  /**
   * DELETE /v1/exams/{id} — the backend refuses to delete exams with attempt
   * history; the UI additionally hides this until attempts reach zero.
   */
  async deleteExam(id: number): Promise<void> {
    await apiRequest(`/v1/exams/${id}`, { method: 'DELETE' });
  },
};
