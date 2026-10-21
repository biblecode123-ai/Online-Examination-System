/**
 * Types for the verified Ofijan backend contract.
 *
 * Every type below mirrors a payload that the backend actually returns
 * (App\Http\Resources\ExamResource / ExamAttemptResource, the RealExam
 * controllers, and AuthController) — nothing here is invented.
 */

/** Envelope used by Api\V1\BaseController (success/error responses). */
export interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: { version?: string; error_type?: string };
  errors?: Record<string, string[]>;
}

/** Laravel paginator envelope (ExamController::index). */
export interface Paginated<T> {
  data: T[];
  links?: { first?: string | null; last?: string | null; prev?: string | null; next?: string | null };
  meta?: {
    current_page?: number;
    from?: number | null;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
  role_slug?: string;
  is_active?: boolean;
  is_premium?: boolean;
  plan_label?: string;
  phone_number?: string | null;
  gender?: string | null;
  department_id?: number | null;
  department?: string | null;
  department_detail?: { id: number; name: string; abbreviation?: string | null } | null;
  university?: {
    id: number;
    name_en?: string | null;
    name_am?: string | null;
    slug?: string | null;
    institution_type?: string | null;
  } | null;
  email_verified?: boolean;
  profile_completion_percentage?: number;
  /** True when the teacher-created account needs a password set on first login. */
  must_change_password?: boolean;
}

export interface LoginResponse {
  user: User;
  token: string;
  token_type: string;
  must_change_password?: boolean;
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export interface ExamCategoryRef {
  id: number;
  name?: string;
  category_name?: string;
  slug?: string | null;
  description?: string | null;
}

export interface ExamDepartmentRef {
  id: number;
  name: string;
  college_id?: number | null;
  college?: { id: number; name: string; abbreviation?: string | null } | null;
}

export interface ExamInstruction {
  id: number;
  content: string;
  order_index?: number | null;
  is_active?: boolean;
}

/** ExamResource (App\Http\Resources\ExamResource). */
export interface Exam {
  id: number;
  exam_title: string;
  has_password: boolean;
  is_active: boolean;
  is_premium: boolean;
  audience: 'public' | 'premium' | 'tutorial' | 'specific';
  audience_user_ids?: number[];
  /** Official duration in minutes (academic exams) — backend canonical value. */
  total_time: number;
  academic_year?: string | null;
  passing_percentage: number;
  active_from?: string | null;
  active_until?: string | null;
  category_id?: number | null;
  department_id?: number | null;
  course_id?: number | null;
  created_at?: string;
  updated_at?: string;
  questions_count?: number;
  allowed_modes?: string[];
  is_time_limited_quiz?: boolean;
  effective_time_limit?: number | null;
  has_countdown?: boolean;
  remaining_time_seconds?: number | null;
  is_time_expired?: boolean;
  category?: ExamCategoryRef | null;
  department?: ExamDepartmentRef | null;
  course?: { id: number; name: string; code?: string | null } | null;
  creator?: { id: number; name: string; email?: string } | null;
  instructions?: ExamInstruction[];
  /** Real Exam lifecycle status (draft/ready/started/completed/cancelled/archived). */
  lifecycle_status?: string | null;
  /** When the lifecycle status was last changed. */
  lifecycle_changed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: number;
  option_text: string;
}

export interface QuestionPayload {
  id: number;
  question_text: string;
  question_type: string;
  points?: number | null;
  order_number?: number;
  options: QuestionOption[];
  question_image?: string | null;
  passage?: { id: number; title?: string | null; content?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Exam Sections
// ---------------------------------------------------------------------------

export interface SectionContent {
  id: number;
  exam_id: number;
  heading_style: 'part' | 'section' | 'custom';
  numbering_style: 'roman' | 'arabic' | 'none';
  title: string;
  instructions: string | null;
  shared_material_type: string;
  shared_material_content: string | null;
  media_references: string[] | null;
  order: number;
  formatted_heading: string;
  question_ids: number[];
}

/** GET /exams/{id}/questions (ExamController::getWithQuestions). */
export interface ExamQuestionsResponse {
  id: number;
  exam_title: string;
  total_time: number;
  has_password?: boolean;
  questions: QuestionPayload[];
  sections?: SectionContent[];
  /** Exam-level instructions, already joined into one block of markup. */
  general_instructions?: string | null;
  /** Questions that belong to no part or section. */
  independent_question_ids?: number[];
  limit_info?: {
    allowed?: number;
    total?: number;
    locked?: boolean;
    message?: string;
    [key: string]: unknown;
  } | null;
}

/** GET /real-exam-attempts/{attempt}/questions (RealExamAttemptController). */
export interface RealAttemptQuestionsResponse {
  exam_id: number;
  attempt_id: number;
  questions: QuestionPayload[];
  sections?: SectionContent[];
  /** Exam-level instructions, already joined into one block of markup. */
  general_instructions?: string | null;
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

/** ExamAttemptResource (App\Http\Resources\ExamAttemptResource). */
export interface Attempt {
  id: number;
  exam_id: number;
  start_time?: string | null;
  expires_at?: string | null;
  end_time?: string | null;
  completed_at?: string | null;
  score?: number | null;
  total_questions?: number | null;
  correct_answers?: number | null;
  wrong_answers?: number | null;
  skipped_answers?: number | null;
  status: string;
  attempt_status?: string;
  time_taken?: number | null;
  created_at?: string;
  passed?: boolean;
  is_completed?: boolean;
  is_ongoing?: boolean;
  exam?: {
    id: number;
    exam_title: string;
    total_time?: number;
    passing_percentage?: number;
    pass_mark?: number;
  } | null;
  exam_mode?: { id: number; name: string } | null;
  exam_category?: { id: number; name: string } | null;
  /** Present only when the attempt was loaded with its answers. */
  student_answers?: AttemptAnswer[];
  accuracy_rate?: number;
}

export interface AttemptAnswer {
  id?: number;
  question_id: number;
  selected_option_id?: number | null;
  /** Only populated once the attempt is graded (see audit notes). */
  is_correct?: boolean | null;
}

/** POST /student/exams/{examId}/start (ExamAttemptController::startExam). */
export interface StartAttemptResponse {
  attempt: Attempt;
  resumed?: boolean;
  exam?: {
    id: number;
    title: string;
    effective_time_limit?: number | null;
    remaining_time_seconds?: number | null;
    is_time_limited_quiz?: boolean;
    has_countdown?: boolean;
    [key: string]: unknown;
  };
}

/** POST /student/exams/attempts/{id}/submit (ExamAttemptController::submitExam). */
export interface StandardSubmitResponse {
  message: string;
  time_expired?: boolean;
  score?: number | null;
  correct_answers?: number;
  wrong_answers?: number;
  skipped_answers?: number;
  total_questions?: number;
  attempt?: Attempt;
}

// ---------------------------------------------------------------------------
// Real exam (high-control mode)
// ---------------------------------------------------------------------------

export interface RealExamPublicSettings {
  fullscreen_required: boolean;
  tab_switch_detection: boolean;
  copy_paste_detection: boolean;
  right_click_detection: boolean;
  multiple_tab_detection: boolean;
  network_disconnect_policy: 'resume' | 'submit';
  result_visibility: 'score_only' | 'full_review';
  escalation_warn_at: number;
  escalation_lock_at: number;
  watermark_enabled: boolean;
  watermark_text: string;
}

/** POST /real-exams/{exam}/start and /real-exam-attempts/{attempt} snapshots. */
export interface RealStartData {
  attempt_id: number;
  session_token?: string;
  attempt_number?: number;
  started_at?: string | null;
  /** Authoritative deadline (ISO-8601, server clock). */
  expires_at?: string | null;
  /** Authoritative server-reported remaining time at response time. */
  remaining_seconds?: number;
  server_time?: string;
  total_questions?: number;
  status?: string;
  settings?: RealExamPublicSettings;
  answered_count?: number;
  question_order?: number[];
  violation_score?: number;
  violation_threshold?: number;
  auto_submitted_at?: string | null;
  score?: number | null;
  passed?: boolean | null;
}

export interface VerifyPasswordResponse {
  exam_id: number;
  attempt_limit: number;
  settings: RealExamPublicSettings;
}

export interface RealSubmitData {
  already_submitted?: boolean;
  attempt_id?: number;
  score?: number | null;
  passed?: boolean | null;
  pass_mark?: number | null;
  submitted_at?: string | null;
  auto_submitted?: boolean;
  result_visibility?: 'score_only' | 'full_review';
}

export interface HeartbeatData {
  attempt_id: number;
  server_time: string;
  expires_at?: string | null;
  remaining_seconds: number;
  status: string;
}

export interface EventResponse {
  recorded: boolean;
  event_type: string;
  severity?: string;
  violation_score?: number;
  auto_submitted?: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** GET /student/exams/attempts/{attemptId}/result */
export interface AttemptResult {
  attempt: {
    id: number;
    exam_id: number;
    exam_title: string;
    category?: string | null;
    mode?: string | null;
    status: string;
    score?: number | null;
    total_questions: number;
    correct_answers: number;
    incorrect_answers: number;
    skipped_answers: number;
    time_taken?: number | null;
    total_time?: number;
    start_time?: string | null;
    expires_at?: string | null;
    end_time?: string | null;
    completed_at?: string | null;
  };
  performance: {
    percentage: number;
    correct_count: number;
    incorrect_count: number;
    skipped_count: number;
    total_time_spent_seconds: number;
    average_time_per_question: number;
    passed: boolean;
    passing_percentage: number;
  };
  question_review: ResultQuestionReview[];
  academic_breakdown?: Record<string, unknown>;
}

export interface ResultQuestionReview {
  question_id: number;
  question_number: number;
  question_text: string;
  question_type: string;
  points?: number;
  student_answer: {
    selected_option_id?: number | null;
    selected_option_text?: string | null;
    answer_text?: string | null;
    is_correct?: boolean | null;
    answer_status: 'correct' | 'incorrect' | 'unanswered';
    [key: string]: unknown;
  };
  correct_answer: { option_id?: number | null; option_text?: string | null };
  options: { id: number; text: string; is_correct?: boolean }[];
  explanation?: string | null;
}

// ---------------------------------------------------------------------------
// Administrator results (App\Services\AdminResultsService)
// ---------------------------------------------------------------------------

/** The official academic outcome of a finished attempt. */
export type AdminResultOutcome = 'passed' | 'failed' | 'pending';

/** How far the grading of an attempt has progressed. */
export type AdminGradingStatus = 'automatic' | 'pending_review' | 'reviewed';

/** Columns the server may order the result list by. */
export type AdminResultSort = 'started_at' | 'completed_at' | 'score' | 'student' | 'exam';

/**
 * The filter set shared by the result table, the summary cards and the
 * Excel export — every one of them is applied by the server.
 */
export interface AdminResultsFilters {
  search?: string;
  student_id?: number;
  exam_id?: number;
  department_id?: number;
  category_id?: number;
  status?: string;
  outcome?: AdminResultOutcome;
  from_date?: string;
  to_date?: string;
  min_score?: number;
  max_score?: number;
  sort?: AdminResultSort;
  direction?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface AdminResultStudent {
  id: number;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  department_id: number | null;
  department_name: string | null;
}

export interface AdminResultExam {
  id: number;
  title: string | null;
  category_id: number | null;
  category_name: string | null;
  department_id: number | null;
  department_name: string | null;
  duration_minutes: number | null;
  passing_percentage: number | null;
  lifecycle_status: string | null;
  active_from: string | null;
  active_until: string | null;
}

/**
 * One examination attempt, as the server computed it.
 *
 * `marks_obtained`, `max_marks`, `score` (the percentage), `pass_mark` and
 * `outcome` are produced by the backend — the client never recalculates them.
 */
export interface AdminResultRow {
  id: number;
  attempt_number: number;
  student: AdminResultStudent;
  exam: AdminResultExam;
  mode: string | null;
  status: string | null;
  attempt_state: string | null;
  auto_submitted: boolean;
  time_expired: boolean;
  marks_obtained: number;
  max_marks: number | null;
  score: number | null;
  percentage: number | null;
  pass_mark: number;
  passed: boolean | null;
  outcome: AdminResultOutcome | null;
  grading_status: AdminGradingStatus;
  total_questions: number | null;
  correct_answers: number | null;
  wrong_answers: number | null;
  skipped_answers: number | null;
  violation_count: number;
  start_time: string | null;
  end_time: string | null;
  completed_at: string | null;
  auto_submitted_at: string | null;
  time_taken_seconds: number | null;
}

/** Summary statistics for the filtered attempt set. */
export interface AdminResultsSummary {
  total_attempts: number;
  unique_students: number;
  completed_attempts: number;
  in_progress_attempts: number;
  submitted_attempts: number;
  auto_submitted_attempts: number;
  passed_attempts: number;
  failed_attempts: number;
  pending_evaluation_attempts: number;
  average_score: number | null;
  graded_outcomes: number;
  pass_rate: number | null;
}

/** GET /admin/results — one page of results plus the matching summary. */
export interface AdminResultsPage {
  results: AdminResultRow[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  summary: AdminResultsSummary;
}

/** GET /admin/results/options — the values the filters can take. */
export interface AdminResultsOptions {
  exams: { id: number; title: string }[];
  departments: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}

export interface AdminQuestionOption {
  id: number;
  text: string;
  is_correct: boolean;
}

/** The administrator's question-by-question view of an attempt. */
export interface AdminQuestionReview {
  question_id: number;
  question_number: number;
  question_text: string;
  question_type: string;
  question_image: string | null;
  max_points: number;
  awarded_points: number;
  requires_manual_grading: boolean;
  graded_at: string | null;
  graded_by: number | null;
  grading_notes: string | null;
  student_answer: {
    selected_option_id: number | null;
    selected_option_text: string | null;
    answer_text: string | null;
    is_correct: boolean | null;
    time_spent_seconds: number | null;
    answered_at: string | null;
    answer_status: 'correct' | 'incorrect' | 'unanswered';
  };
  correct_answer: { option_id: number | null; option_text: string | null };
  options: AdminQuestionOption[];
  explanation: string | null;
}

/** GET /admin/results/{attempt} — the full result of one attempt. */
export interface AdminResultDetail {
  result: AdminResultRow;
  question_review: AdminQuestionReview[];
}

export interface AdminScoreBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** GET /admin/results/exams/{exam} — the exam-scoped result statistics. */
export interface AdminExamSummary extends AdminResultsSummary {
  exam: {
    id: number;
    title: string | null;
    category_name: string | null;
    department_name: string | null;
    duration_minutes: number | null;
    passing_percentage: number | null;
    lifecycle_status: string | null;
  };
  assigned_students: number;
  students_started: number;
  students_not_attempted: number;
  attempts: number;
  score_distribution: AdminScoreBucket[];
}

