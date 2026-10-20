# Phase 1 — Repository Audit & API Integration Map

Online Examination System — Admin & Teacher dashboards.
Audited: 2026-10-20, against the **actual** code in:

- Frontend: `Online-Examination-System` (this repo, app in `artifacts/online-examination`)
- Backend: `../ofijan-backend` (Laravel 11, PHP 8.2, MySQL, Sanctum)
- Legacy CMS: `../ofijan-cms` (inspected **read-only** for API contract discovery; never a dependency)

---

## 1. Architecture discovered

### Frontend (`artifacts/online-examination`, package `@workspace/ofijan-examflow`)

| Concern | Implementation |
|---|---|
| Framework | React 19 + TypeScript + Vite 7 |
| Routing | **wouter** (`src/App.tsx` — `Switch`/`Route`, no router library beyond wouter) |
| Server state | TanStack Query v5 (`QueryClient` in `App.tsx`, hooks in `src/lib/queries.ts`) |
| API transport | Central `apiRequest()` in `src/lib/api.ts` — base URL `VITE_API_BASE_URL` (dev `http://localhost:3000`), production goes through Vercel proxy `/api/proxy`. Typed `ApiError` (status/code/validation bag/rate-limit/network). Server-clock sampling via `Date` header (`serverNow()`). |
| Auth | `src/lib/auth.tsx` `AuthProvider`: Sanctum bearer token in localStorage (`ofijan.student.token.v1`), profile bootstrap on load, session-expiry broadcast on 401. **Currently hard-rejects every non-student role.** |
| Endpoint map | `src/lib/endpoints.ts` — `authApi`, `examApi`, `attemptApi`, `realExamApi`, `notificationApi`. Every function documented against real backend routes. |
| Design system | Custom CSS classes in `src/index.css` (`app-shell`, `nav-link`, `card`, `button-primary`, tables, badges, dialogs) + shadcn-style components under `src/components/ui/*` (radix + tailwind v4 available). Existing pages use the custom classes — new dashboards will follow that language. |
| Exam flow pages | `dashboard.tsx`, `exams.tsx`, `exam-details.tsx`, `attempt.tsx` (1,190 lines: timer, heartbeat, answer save, anti-cheat events, reauthorize), `submission.tsx`, `results.tsx`, `history.tsx`, `profile.tsx`, `login.tsx` |
| Scripts | `pnpm dev`, `pnpm build`, `pnpm typecheck`. **No frontend test framework installed; no test files exist.** |
| Notifications | `GET /v1/notifications` |

### Backend (`../ofijan-backend`)

- Laravel 11, routes split: `routes/api.php` → `routes/api/v1.php` (versioned modules) + `routes/api/legacy.php` (compat, same controllers, served under `/api/...`).
- Auth: Sanctum bearer tokens; `roles:...` / `role:...` middleware; policies on Exam for ownership.
- Exam domain: `exams` (with `lifecycle_status`), `exam_questions` pivot (ordered, points), `exam_students` roster, `audience_assignments`, `exam_attempts` (`status` **and** `attempt_status`, `score`=**percentage**, `pass_mark`, `passed`, `expires_at`, `question_order`, `access_question_ids`), `student_answers` (snapshot, `is_correct`, `points`), `question_groups`/`exam_sections`, `passages`, polymorphic `instructions`.
- Lifecycle (`app/Support/ExamLifecycle.php`): `draft → ready → started → completed → archived` (+`cancelled`), NULL = not teacher-governed. `Exam::LIFECYCLE_TRANSITIONS` defines the legal graph.
- Real Exam policy layer (`app/Services/RealExam/*`): `RealExamService` (preflight = lifecycle → active → assignment → department → window → **password**, transactional `start()` with row lock, resume-first, stable question order, violation accounting, `finalizeExpired`), `RealExamPasswordService` (one-way hash, never returned), `RealExamSettings` (attempt limit, randomization, fullscreen, disconnect policy, **`result_visibility: score_only|full_review`**, escalation, watermark).
- Grading: `ExamSubmissionService` (server-side; MCQ/true-false/blank auto-scored; **essay + matching evaluate() → false, awaiting manual grade**); `ExamAttemptController::manualGrade` recalculates percentage/pass — **admin-only today**.
- Test suite: `tests/Feature/*` (PHPUnit, `phpunit.xml` + `phpunit.mysql.xml`), incl. `RealExamModeTest`, `AttemptOwnershipAndScoringTest`, `AttemptTimerExpiryTest`, `ExamAccessControlTest`.
- Excel: `openspout/openspout` is a dependency (real .xlsx possible).

---

## 2. Verified API integration map

Legend: ✅ exists and fits the requirement · 🟡 exists with caveats · ❌ missing (backend change needed)

### Auth

| Capability | Endpoint | Notes |
|---|---|---|
| Student login | `POST /v1/login` (throttle 5/min) | ✅ **Blocks every non-student role** (`AuthController::login`) — must stay for the student portal |
| Staff login (admin/teacher) | — | ❌ **No entry point exists.** `AuthController` only issues tokens from `/login` (student-only), `/register` (student role), Google/Telegram OAuth. |
| Profile | `GET /v1/profile` | ✅ returns `{user}` incl. `role_slug`, `department_id`, `must_change_password` |
| Logout | `POST /v1/logout` | ✅ |
| Change password | `POST /v1/change-password` | ✅ (`current_password`, `password`, `password_confirmation`) |

### Departments

| Capability | Endpoint | Notes |
|---|---|---|
| List | `GET /v1/departments`, `GET /v1/departments/list-all` | ✅ public/any-auth; used for exam creation & student filtering |
| Detail | `GET /v1/departments/{id}` | ✅ |
| Create/update/delete | `POST/PUT/DELETE /v1/departments` | ✅ `role:admin` |

### Accounts (admin)

| Capability | Endpoint | Notes |
|---|---|---|
| List users w/ filters | `GET /v1/admin/users` (role:admin/encoder) + `GET /v1/users` | 🟡 supports `role`, `is_active`, `is_premium` filters; **no search-by-name/email and no department filter** in `UserController::index` (two route files register `/admin/users`; exact match must be confirmed live) |
| Create user (teacher/student, role, password) | `POST /v1/admin/users` | ✅ `role:admin`; `role in:admin,encoder,student,teacher,promoter`; staff get `must_change_password=true` |
| Update / activate / deactivate | `PUT /v1/users/{id}`, `POST /v1/users/{id}/activate|deactivate` | ✅ `role:admin` |
| Teacher home department | `department_id` is a users column; `UserController::update`/`store` | 🟡 `store()` currently ignores `department_id` — small backend gap to accept it on create/update |
| Student unique ID | — | ❌ **No student-number column exists** (`users` has `email` unique + `name`). Unique student identity = `users.id` + unique email. Documented decision: surface `users.id`/email as the student ID; do not invent a schema field. |
| Bulk student import (Excel/CSV) | `GET /v1/teacher/students/import-template`, `POST /v1/teacher/students/import/preview`, `.../confirm`, `GET .../report/{token}` | ✅ row-level validation + one-time tokenized confirm (teacher role) |
| Teacher's own student roster CRUD | legacy `GET/POST /api/teacher/students`, `/search`, `/import` | 🟡 roster-based (`teacher_students`), used by CMS |

### Exams & categories

| Capability | Endpoint | Notes |
|---|---|---|
| Categories | `GET /v1/exam-categories` (public), CRUD `roles:admin,encoder,teacher` | ✅ Real Exam resolved server-side by slug `real-exam` or `is_real_exam` flag — never hardcode IDs |
| List exams (audience-filtered) | `GET /v1/exams`, `GET /v1/exams/available`, `GET /v1/exams/statistics` | ✅ paginator totals available |
| Exam detail + instructions | `GET /v1/exams/{id}` (`department` middleware) | ✅ |
| Create/update/delete exams (generic) | `POST/PUT/DELETE /v1/exams/{id}` | 🟡 `roles:admin,encoder,teacher`, generic CMS-oriented flow |
| **Teacher Real Exam workflow** | `GET/POST /v1/teacher/real-exams`, `GET/PATCH /v1/teacher/real-exams/{id}` | ✅ `roles:admin,teacher`; create validated: `exam_title, description, department_id, total_time(1..480), passing_percentage, exam_password(4..100), question_ids[], settings{}`; **category forced to real-exam; other categories rejected 422**; owner-scoped (`created_by`), admin sees all |
| Lifecycle transitions | `POST /v1/teacher/real-exams/{id}/ready` · `/start` · `/complete` · `/revert-to-draft` | ✅ backend-enforced: ready-blockers (≥1 question, duration, password, department, ≥1 assigned student); `start()` sets `started_at/started_by/is_active=true`; `complete()` finalizes active attempts then closes. Frontend-only status change impossible. |
| Archive | legacy `PUT /api/teacher/exams/{examId}/status` (`canTransitionTo`, completed→archived) | 🟡 exists for any teacher-owned exam; the v1 real-exam group has no archive endpoint → expose archive via existing legacy route (documented) or skip (spec says "adapting names to the existing backend") |
| Password | `POST /v1/teacher/real-exams/{id}/password` | ✅ hashed (RealExamPasswordService), write-only, locked after start |
| Questions CRUD | `POST/PUT/DELETE /v1/questions{,/{id}}`, options `POST/PUT/DELETE /v1/question-options` | ✅ `roles:admin,encoder,teacher`; types supported: `multiple_choice, true_false, essay, blank, matching` (QuestionService); images via `POST /v1/questions/bulk-image-upload` |
| Exam ↔ questions | `POST /v1/teacher/real-exams` `question_ids`, `PATCH .../{id}`; legacy `POST /api/teacher/exams/{examId}/questions` | ✅ ordered sync, points from question |
| Sections/parts & shared material | `GET/PUT /v1/teacher/exams/{examId}/structure`, `POST .../sections/media`, plus section CRUD under `/v1/exams/{examId}/sections` | ✅ (added in prior work; owner-scoped) |
| Result release policy | exam `settings.result_visibility = score_only \| full_review` | ✅ backend-controlled per exam; surfaced in attempt snapshot |

### Assignment

| Capability | Endpoint | Notes |
|---|---|---|
| Assign/unassign/list | `POST/DELETE/GET /v1/teacher/real-exams/{id}/students` | ✅ dedupe, `is_active` toggle, mirrors `audience_assignments` so students see the exam; locked once started |
| Assign rule | — | ❌ **Roster-gated**: only students in the acting teacher's `teacher_students` list can be assigned. Spec requires assigning **any student of the exam's target department**. Backend change required. |
| List students of a department (for the picker) | — | ❌ **No endpoint.** `GET /v1/users` is admin/encoder-only; teacher endpoints only expose the roster. Backend change required. |
| Assign all (department) | legacy `POST /api/teacher/exams/{examId}/assign-all` | 🟡 roster-based + department-filtered |

### Attempts & timing (student side — already working)

| Capability | Endpoint | Notes |
|---|---|---|
| Verify password | `POST /v1/real-exams/{exam}/verify-password` | ✅ preflight: lifecycle + assignment + department + window + password (throttled) |
| Start attempt | `POST /v1/real-exams/{exam}/start` | ✅ transactional, lockForUpdate, resume-first (refresh-safe, no duplicates), returns `expires_at`/`remaining_seconds` — **per-student timer starts here, not at teacher start** |
| Snapshot / questions | `GET /v1/real-exam-attempts/{attempt}` · `/questions` | ✅ authoritative clock, stable order, returns `sections`, no answer keys |
| Save answer / heartbeat / events / reauthorize / submit | `POST .../answers|heartbeat|events|reauthorize|submit` | ✅ idempotent upsert; heartbeat resyncs countdown; auto-finalize on expiry (`finalizeExpired`) |
| Attempt restore | `GET /v1/exam-attempts/{attemptId}` | ✅ ownership-checked, used to survive refresh |
| Results (student) | `GET /v1/student/exams/attempts/{id}/result`, `GET /v1/student/real-exam/{attemptId}` | ✅ gated to own completed attempts; detail level follows `result_visibility` |

### Results, grading, export

| Capability | Endpoint | Notes |
|---|---|---|
| Teacher exam results | legacy `GET /api/teacher/exams/{examId}/results` (+ `/pending-students`, `/students/{sid}/result`) | 🟡 **Caveats**: scoped `created_by = me` ✅; queries `status='completed'`; returns rank, name, email, score(%), counts, time — **no student department, no attempt start time, no grading status; `student_id` here is `user_id`** |
| Teacher attempt monitor | `GET /v1/teacher/real-exams/{id}/attempts?filter=all|ongoing|completed` | ✅ status, score, start/expires/end, violation score, ownership-scoped (admin sees all) |
| Teacher dashboard stats | legacy `GET /api/teacher/dashboard` | 🟡 totals for owned exams only (`total_exams, active_exams, total_students, total_completed_attempts, average_score`) — **no per-lifecycle counts** (frontend will read them from the paginated `?status=` totals of `/v1/teacher/real-exams`) |
| System-wide results (admin) | `GET /v1/exam-attempts` (role:admin), `GET /api/exam-attempts/exam/{examId}` (admin/teacher — must verify scoping live), `GET /v1/admin/bi/dashboard/*` | 🟡 exists; scoping of `exam-attempts/exam/{id}` for teachers must be verified (potential cross-teacher leak — will verify and tighten if needed) |
| Essay grading | `POST /v1/exam-attempts/{id}/grade` | ❌ **admin-only**; no teacher grading endpoint; no grading-status model (pending/partial/final) |
| Excel/xlsx results export | — | ❌ **No results export endpoint anywhere.** (`/v1/exams/export` exports exam *content*.) `openspout/openspout` available → real `.xlsx`. |
| Admin overview metrics | `GET /v1/admin/dashboard`, `/v1/admin/stats`, `/v1/admin/bi/dashboard/summary` | 🟡 totals for users/questions/active exams/avg score; **missing**: total teachers, total departments, per-lifecycle exam counts, recent exam activity |

### Gaps to implement in the backend (all documented in §4)

1. `POST /v1/staff-login` — admin/teacher token issuance (student `/v1/login` untouched).
2. `GET /v1/teacher/departments/{departmentId}/students` — searchable student picker for any department.
3. Department-based assignment in `TeacherRealExamController::assignStudents` (replace roster gate with target-department validation; keep dedupe; still locked after start).
4. `POST /v1/teacher/real-exams/{examId}/attempts/{attemptId}/grade` — teacher grading of essays/matching on **owned** exams, recalc percentage/pass.
5. `GET /v1/teacher/real-exams/{examId}/results/export.xlsx` + `GET /v1/admin/results/export.xlsx` — authorization-scoped, formula-injection-safe, no secrets.
6. `GET /v1/admin/exam-overview` — totals: students, teachers, departments, exams, per-lifecycle counts, recent activity (all real aggregates).
7. Accept `department_id` in `UserController::store/update` so admins can place teachers/students in a department at creation.

---

## 3. Roles, routes and enforcement plan (frontend)

- Roles come from the backend (`user.role_slug`), never from client state.
- New structure inside the **existing** app (no rewrite):
  - `/login` — one form; backend decides role. Student → `/dashboard`, teacher → `/teacher`, admin → `/admin`.
  - Student routes unchanged (`/dashboard`, `/exams`, `/results`, `/history`, `/profile`, attempt/submission) with the existing student shell.
  - New `/teacher/*` and `/admin/*` route trees with their own nav shells, guarded by role (frontend convenience only — **every action re-checked by backend policies/middleware**).
- Existing `isStudent()` gate in `auth.tsx` is replaced by role-aware routing that still prevents students from entering staff areas and vice versa.

---

## 4. Backend changes (with rationale) — implemented in Phase 2–6

| # | Change | Files | Justification |
|---|---|---|---|
| B1 | Staff login endpoint | `routes/api/v1/auth.php`, `AuthController::staffLogin` | No entry point exists for admin/teacher; student login must remain student-only (rule 1) |
| B2 | Department student picker | `routes/api/v1/teacher.php`, new method in `TeacherRealExamController` | Assignment UI needs students of the target department; teacher must not need them rostered |
| B3 | Department-based assignment | `TeacherRealExamController::assignStudents` | Spec §4/§5.D: assign by target department, reject other departments |
| B4 | Teacher grading endpoint | `routes/api/v1/teacher.php`, new grading method (reuses manualGrade math) | Essay/matching are otherwise ungradeable by the exam owner |
| B5 | Results export (.xlsx) | new `ResultsExportController` + routes (teacher + admin) | Spec §5.G; openspout already in composer |
| B6 | Admin exam overview | new method on admin dashboard controller + route | Spec §4.A metrics not available otherwise |
| B7 | Department on user create/update | `UserController::store/update` | Teacher home department / student department assignment from admin UI |

No schema migration is planned (exam/lifecycle/attempt/grading tables already exist). If B4 requires a grading-status field, a small additive migration will be described before applying.

---

## 5. Test & build commands (baseline)

- Frontend: `pnpm --filter @workspace/ofijan-examflow typecheck`, `... build`. No test runner installed (gap — see Phase 7; a minimal vitest setup may be added).
- Backend: `cd ../ofijan-backend && php vendor/bin/phpunit` (`phpunit.xml` = sqlite/fast, `phpunit.mysql.xml` = mysql). DB: XAMPP MySQL at 127.0.0.1:3306 (`ofijan` DB), **not running at audit time** — must be started for e2e verification.
- Backend lint: no pint/php-cs config found — `php -l` on touched files.
