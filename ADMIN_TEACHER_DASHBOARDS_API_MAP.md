# Admin & Teacher Dashboards - API Integration Map

**Phase 1 Audit Complete**  
Date: 2026-10-20  
Frontend: `Online-Examination-System` (React + TypeScript + Vite)  
Backend: `ofijan-backend` (Laravel 11 + PHP 8.2 + MySQL)

---

## Executive Summary

The backend has substantial infrastructure for Real Exam management, teacher workflows, and admin operations. However, **critical gaps** prevent implementing the Admin and Teacher dashboards as specified:

1. **No staff login endpoint** - The existing `/v1/login` explicitly rejects non-student roles
2. **Assignment is roster-gated** - Teachers can only assign students from their `teacher_students` roster, not from any target department
3. **Missing department student picker** - No endpoint to list students by department for assignment selection
4. **Teacher grading missing** - Essay/matching grading is admin-only
5. **Results export missing** - No Excel export endpoints for results
6. **Admin metrics incomplete** - Missing total teachers, departments, lifecycle counts
7. **Department assignment missing** - UserController doesn't accept department_id on create/update

---

## 1. Frontend Architecture

### Framework & Stack
- **Framework**: React 19 + TypeScript + Vite 7
- **Routing**: Wouter (file-based routing in `src/App.tsx`)
- **Server State**: TanStack Query v5 (`QueryClient` in `App.tsx`, hooks in `src/lib/queries.ts`)
- **API Transport**: Custom `apiRequest()` in `src/lib/api.ts`
  - Base URL: `VITE_API_BASE_URL` (dev: `http://localhost:3000`)
  - Production: Vercel proxy `/api/proxy`
  - Typed `ApiError` (status/code/validation bag/rate-limit/network)
  - Server-clock sampling via `Date` header (`serverNow()`)
- **Authentication**: `src/lib/auth.tsx` `AuthProvider`
  - Sanctum bearer token in localStorage (`ofijan.student.token.v1`)
  - Profile bootstrap on load
  - Session-expiry broadcast on 401
  - **Currently hard-rejects every non-student role** (line 95-98)

### Existing Pages
- `src/pages/login.tsx` - Student login
- `src/pages/dashboard.tsx` - Student overview
- `src/pages/exams.tsx` - Exam list
- `src/pages/exam-details.tsx` - Exam details, instructions, start
- `src/pages/attempt.tsx` - Active exam (1,190 lines: timer, heartbeat, answer save, anti-cheat, reauthorize)
- `src/pages/submission.tsx` - Post-exam confirmation
- `src/pages/results.tsx` - Results display
- `src/pages/history.tsx` - Attempt history
- `src/pages/profile.tsx` - Student profile

### API Endpoints (src/lib/endpoints.ts)
- `authApi` - login, profile, logout, change-password
- `examApi` - list, get, questions
- `attemptApi` - start, saveAnswer, submit, listMine, get, result
- `realExamApi` - verifyPassword, start, snapshot, questions, saveAnswer, heartbeat, reportEvent, reauthorize, submit
- `notificationApi` - list

### Design System
- Custom CSS classes in `src/index.css` (`app-shell`, `nav-link`, `card`, `button-primary`, tables, badges, dialogs)
- shadcn/ui components under `src/components/ui/*` (radix + tailwind v4)
- Existing pages use custom classes - new dashboards will follow that language

### Build & Scripts
- `pnpm dev` - Development server
- `pnpm build` - Production build
- `pnpm typecheck` - TypeScript checking
- **No test framework installed** - No test files exist

---

## 2. Backend Architecture

### Framework & Stack
- **Framework**: Laravel 11
- **PHP Version**: 8.2
- **Database**: MySQL with Eloquent ORM
- **API**: RESTful with Sanctum authentication
- **Routing**: 
  - `routes/api.php` → `routes/api/v1.php` (versioned modules)
  - `routes/api/legacy.php` (compat, same controllers under `/api/...`)

### Authentication
- **Provider**: Laravel Sanctum (bearer tokens)
- **Middleware**: `auth:sanctum`, `roles:...`, `role:...`
- **Policies**: Exam ownership policies on Exam model
- **Roles**: admin, encoder, student, teacher, promoter (from `roles` table)

### Key Models

#### User (app/Models/User.php)
```php
fillable: [
  name, email, password, role_id, telegram_username, telegram_chat_id,
  is_active, is_premium, premium_expires_at, google_id, avatar,
  email_verified, must_change_password, password_set_at, phone_number,
  university, university_id, gender, department, dept_id, department_id,
  referral_code, referred_by
]
relationships: role, department, university, examAttempts, exams, questions
```

#### Role (app/Models/Role.php)
```php
fillable: [name, slug, description, created_by]
relationships: users, permissions
```

#### Department (app/Models/Department.php)
```php
fillable: [name, abbreviation, college_id, exam_category_id, description]
relationships: college, examCategory, courses, exams, blueprints, studyMaterials
```

#### Exam (app/Models/Exam.php)
```php
fillable: [
  exam_title, academic_year, description, category_id, department_id,
  course_id, password, total_time, passing_percentage, created_by,
  is_active, is_premium, audience, active_from, active_until,
  league_id, real_exam_settings, lifecycle_status, lifecycle_changed_at
]
lifecycle_status: draft, ready, started, completed, cancelled, archived
relationships: category, createdBy, questions, examAttempts, examSections
```

#### ExamAttempt (app/Models/ExamAttempt.php)
```php
fillable: [
  user_id, exam_id, exam_mode_id, score, start_time, expires_at,
  end_time, completed_at, session_id, extra_time_used, time_expired,
  status, total_questions, correct_answers, wrong_answers, skipped_answers,
  time_taken, source, points, current_question_index, attempt_status,
  attempt_number, session_token_hash, last_activity_at, violation_count,
  violation_score, auto_submitted_at, question_order, pass_mark, passed,
  access_question_ids
]
relationships: exam, examMode, user, studentAnswers
```

#### ExamStudent (app/Models/ExamStudent.php)
```php
fillable: [exam_id, student_id, assigned_by, is_active]
relationships: exam, student, assigner
```

### Exam Lifecycle (app/Support/ExamLifecycle.php)
```php
const LIFECYCLE_DRAFT = 'draft';
const LIFECYCLE_READY = 'ready';
const LIFECYCLE_STARTED = 'started';
const LIFECYCLE_COMPLETED = 'completed';
const LIFECYCLE_CANCELLED = 'cancelled';
const LIFECYCLE_ARCHIVED = 'archived';

LIFECYCLE_TRANSITIONS:
  draft → ready
  ready → started, draft, cancelled
  started → completed, cancelled
  completed → archived
  cancelled → archived
```

### Real Exam Services
- **RealExamService**: Preflight (lifecycle → active → assignment → department → window → password), transactional start(), resume-first, stable question order, violation accounting, finalizeExpired
- **RealExamPasswordService**: One-way hash, never returned
- **RealExamSettings**: attempt limit, randomization, fullscreen, disconnect policy, result_visibility (score_only|full_review), escalation, watermark

---

## 3. Verified API Contracts

### Authentication

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/login` | POST | None | Student only | `{email, password}` | `{user, token, token_type, must_change_password}` | **Blocks non-student roles** (line 141-149 in AuthController) |
| `/v1/register` | POST | None | Student | `{name, email, password, telegram_username?, phone_number?}` | `{user, token, token_type}` | Creates student role only |
| `/v1/register/promoter` | POST | None | Promoter | `{name, email, password, ...}` | `{user, token, token_type, role}` | Creates promoter role |
| `/v1/profile` | GET | Sanctum | Any | - | `{user}` | Returns role_slug, department_id, must_change_password |
| `/v1/logout` | POST | Sanctum | Any | - | `{success, message}` | Revokes current token |
| `/v1/change-password` | POST | Sanctum | Any | `{current_password, password, password_confirmation}` | `{success, message}` | Clears must_change_password |
| `/v1/forgot-password` | POST | None | Any | `{email}` | `{success, message}` | Generic response (no enumeration) |
| `/v1/reset-password` | POST | None | Any | `{email, password, password_confirmation, token}` | `{success, message}` | - |

**GAP B1**: No staff login endpoint. Admin/teacher cannot authenticate through the API.

---

### Departments

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/departments` | GET | None | Public | - | Paginated departments | Public endpoint |
| `/v1/departments/list-all` | GET | None | Public | - | All departments | Public endpoint |
| `/v1/departments/{id}` | GET | None | Public | - | Department detail | Public endpoint |
| `/v1/departments` | POST | Sanctum | Admin | `{name, abbreviation, college_id?, exam_category_id?, description?}` | Department | Admin only |
| `/v1/departments/{id}` | PUT | Sanctum | Admin | `{name, abbreviation, college_id?, exam_category_id?, description?}` | Department | Admin only |
| `/v1/departments/{id}` | DELETE | Sanctum | Admin | - | - | Admin only |

**Status**: ✅ Complete for admin needs.

---

### User Management (Admin)

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/admin/users` | GET | Sanctum | Admin, Encoder | `?role=...&is_active=...&is_premium=...&has_telegram=...&per_page=...` | Paginated users | Filters by role, active, premium, telegram |
| `/v1/users` | GET | Sanctum | Admin, Encoder | Same as above | Paginated users | Same endpoint |
| `/v1/users/{id}` | GET | Sanctum | Admin, Encoder | - | User detail | - |
| `/v1/admin/users` | POST | Sanctum | Admin | `{name, email, password, role, telegram_username?}` | User | Creates user with must_change_password for staff |
| `/v1/users/{id}` | PUT | Sanctum | Admin | `{name, email?, password?, role?, telegram_username?, ...}` | User | Updates user |
| `/v1/users/{id}` | DELETE | Sanctum | Admin | - | - | Soft delete |
| `/v1/users/{id}/activate` | POST | Sanctum | Admin | - | - | Sets is_active=true |
| `/v1/users/{id}/deactivate` | POST | Sanctum | Admin | - | - | Sets is_active=false |

**GAP B7**: `UserController::store` (line 262-299) does not accept `department_id` in validation or fillable. The field exists in the model but is not populated on create/update.

---

### Teacher Real Exam Workflow

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/teacher/real-exams` | GET | Sanctum | Admin, Teacher | `?status=...&per_page=...` | Paginated exams | Teachers see own, admins see all |
| `/v1/teacher/real-exams` | POST | Sanctum | Admin, Teacher | `{exam_title, description?, department_id, total_time, passing_percentage?, exam_password, question_ids[], settings?}` | Exam | Category forced to real-exam, created_by set |
| `/v1/teacher/real-exams/{id}` | GET | Sanctum | Admin, Teacher | - | Exam detail | Ownership-scoped |
| `/v1/teacher/real-exams/{id}` | PATCH | Sanctum | Admin, Teacher | `{exam_title?, description?, total_time?, passing_percentage?, question_ids?, settings?}` | Exam | Locked after started |
| `/v1/teacher/real-exams/{id}/ready` | POST | Sanctum | Admin, Teacher | - | Exam | Validates: ≥1 question, duration, password, department, ≥1 assigned student |
| `/v1/teacher/real-exams/{id}/start` | POST | Sanctum | Admin, Teacher | - | Exam | Sets started_at, started_by, is_active=true |
| `/v1/teacher/real-exams/{id}/complete` | POST | Sanctum | Admin, Teacher | - | Exam | Finalizes active attempts, closes exam |
| `/v1/teacher/real-exams/{id}/revert-to-draft` | POST | Sanctum | Admin, Teacher | - | Exam | Ready → draft only |
| `/v1/teacher/real-exams/{id}/password` | POST | Sanctum | Admin, Teacher | `{password}` | - | Hashed via RealExamPasswordService, locked after start |
| `/v1/teacher/real-exams/{id}/attempts` | GET | Sanctum | Admin, Teacher | `?filter=all|ongoing|completed` | Attempts | Ownership-scoped |
| `/v1/teacher/real-exams/{id}/students` | GET | Sanctum | Admin, Teacher | - | Assigned students | List of assigned students |
| `/v1/teacher/real-exams/{id}/students` | POST | Sanctum | Admin, Teacher | `{student_ids[]}` | - | Assign students, locked after start |
| `/v1/teacher/real-exams/{id}/students/{studentId}` | DELETE | Sanctum | Admin, Teacher | - | - | Unassign student, locked after start |

**GAP B2**: Assignment is roster-gated. `TeacherRealExamController::assignStudents` validates against `teacher_students` table, not the exam's target department. Teachers can only assign students they have in their personal roster.

**GAP B3**: No endpoint to list students by department for the assignment picker. The only student listing endpoints are:
- `/v1/admin/users` (admin/encoder only, no department filter)
- Roster-based endpoints (teacher_students table)

---

### Exam Structure (Sections)

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/teacher/exams/{examId}/structure` | GET | Sanctum | Admin, Teacher | - | Exam structure | Sections, instructions, question order |
| `/v1/teacher/exams/{examId}/structure` | PUT | Sanctum | Admin, Teacher | `{sections[], instructions[], question_order[]}` | Exam structure | Transactional save |
| `/v1/teacher/exams/{examId}/sections/media` | POST | Sanctum | Admin, Teacher | `{file}` | Media reference | Upload section media |
| `/v1/exams/{examId}/sections` | POST | Sanctum | Admin, Encoder, Teacher | `{title, heading_style, numbering_style, instructions?, shared_material_type?, shared_material_content?}` | Section | Create section |
| `/v1/exams/{examId}/sections/{sectionId}` | PUT | Sanctum | Admin, Encoder, Teacher | `{title?, heading_style?, numbering_style?, instructions?, ...}` | Section | Update section |
| `/v1/exams/{examId}/sections/{sectionId}` | DELETE | Sanctum | Admin, Encoder, Teacher | - | - | Delete section |
| `/v1/exams/{examId}/sections/reorder` | PATCH | Sanctum | Admin, Encoder, Teacher | `{new_order[]}` | - | Reorder sections |
| `/v1/sections/{sectionId}/questions` | POST | Sanctum | Admin, Encoder, Teacher | `{question_ids[]}` | Section | Add questions to section |
| `/v1/sections/{sectionId}/questions/{questionId}` | DELETE | Sanctum | Admin, Encoder, Teacher | - | - | Remove question from section |
| `/v1/sections/{sectionId}/questions/reorder` | PATCH | Sanctum | Admin, Encoder, Teacher | `{question_order[]}` | - | Reorder questions in section |

**Status**: ✅ Complete for section management.

---

### Questions

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/questions` | POST | Sanctum | Admin, Encoder, Teacher | `{question_text, question_type, points?, passage_id?, options[], ...}` | Question | Types: multiple_choice, true_false, essay, blank, matching |
| `/v1/questions/{id}` | PUT | Sanctum | Admin, Encoder, Teacher | `{question_text?, question_type?, points?, ...}` | Question | Update question |
| `/v1/questions/{id}` | DELETE | Sanctum | Admin, Encoder, Teacher | - | - | Delete question |
| `/v1/question-options` | POST | Sanctum | Admin, Encoder, Teacher | `{question_id, option_text, is_correct}` | Option | Add option |
| `/v1/question-options/{id}` | PUT | Sanctum | Admin, Encoder, Teacher | `{option_text?, is_correct?}` | Option | Update option |
| `/v1/question-options/{id}` | DELETE | Sanctum | Admin, Encoder, Teacher | - | - | Delete option |
| `/v1/questions/bulk-image-upload` | POST | Sanctum | Admin, Encoder, Teacher | `{files[]}` | `{image_urls[]}` | Upload question images |

**Status**: ✅ Complete for question management.

---

### Student Real Exam Flow

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/real-exams/{exam}/verify-password` | POST | Sanctum | Student | `{password}` | `{eligible, message}` | Preflight: lifecycle + assignment + department + window + password |
| `/v1/real-exams/{exam}/start` | POST | Sanctum | Student | `{password}` | `{attempt_id, expires_at, remaining_seconds}` | Transactional, resume-first, no duplicates |
| `/v1/real-exam-attempts/{attempt}` | GET | Sanctum | Student | - | `{attempt, exam, remaining_seconds}` | Authoritative clock |
| `/v1/real-exam-attempts/{attempt}/questions` | GET | Sanctum | Student | - | `{questions, sections[]}` | Stable order, no answer keys |
| `/v1/real-exam-attempts/{attempt}/answers` | POST | Sanctum | Student | `{question_id, option_id?, answer_text?}` | - | Idempotent upsert |
| `/v1/real-exam-attempts/{attempt}/heartbeat` | POST | Sanctum | Student | `{}` | `{remaining_seconds}` | Resync countdown |
| `/v1/real-exam-attempts/{attempt}/events` | POST | Sanctum | Student | `{event_type, metadata?}` | - | Anti-cheat audit trail |
| `/v1/real-exam-attempts/{attempt}/reauthorize` | POST | Sanctum | Student | `{password}` | `{attempt, remaining_seconds}` | Unlock locked attempt |
| `/v1/real-exam-attempts/{attempt}/submit` | POST | Sanctum | Student | `{}` | `{score, passed, ...}` | Idempotent finalization |

**Status**: ✅ Complete and working. Student dashboard already uses these.

---

### Results & Grading

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|--------|-------|---------|----------|-------|
| `/v1/student/exams/attempts/{attemptId}/result` | GET | Sanctum | Student | - | Attempt result | Own completed attempts only |
| `/v1/exam-attempts/{id}` | GET | Sanctum | Admin, Student, Teacher | - | Attempt detail | Ownership-checked |
| `/v1/exam-attempts/exam/{examId}` | GET | Sanctum | Admin, Student, Teacher | - | Attempts for exam | **Teacher scoping needs verification** |
| `/v1/exam-attempts/{id}/grade` | POST | Sanctum | Admin | `{answers[], grading_notes?}` | Updated attempt | **Admin-only** - no teacher endpoint |
| `/v1/teacher/exams/{examId}/results` | GET | Sanctum | Teacher (legacy) | - | Results list | Legacy endpoint, not in v1 |
| `/v1/admin/bi/dashboard/summary` | GET | Sanctum | Admin | - | System stats | Partial metrics |

**GAP B4**: Grading endpoint is admin-only. Teachers cannot grade essays/matching on their own exams.

**GAP B5**: No results export endpoints for Excel/.xlsx. `openspout/openspout` is available in composer.

**GAP B6**: Admin BI dashboard summary is incomplete. Missing: total teachers, total departments, per-lifecycle exam counts, recent exam activity.

---

### Bulk Student Import (Teacher)

| Endpoint | Method | Auth | Roles | Request | Response | Notes |
|----------|--------|------|-------|---------|----------|-------|
| `/v1/teacher/students/import-template` | GET | Sanctum | Admin, Teacher | - | Excel template | Downloadable .xlsx |
| `/v1/teacher/students/import/preview` | POST | Sanctum | Admin, Teacher | `{file}` | Preview with validation | Row-level validation, generated passwords |
| `/v1/teacher/students/import/confirm` | POST | Sanctum | Admin, Teacher | `{token}` | Import report | Transactional, chunked |
| `/v1/teacher/students/import/report/{token}` | GET | Sanctum | Admin, Teacher | - | Import report | 24h TTL, owner-scoped |

**Status**: ✅ Complete for bulk student import.

---

## 4. Critical Backend Gaps

### B1: Staff Login Endpoint

**Problem**: `POST /v1/login` (AuthController::login, line 113-180) explicitly rejects non-student roles:
```php
$roleSlug = $user->role?->slug;
if ($roleSlug && $roleSlug !== 'student') {
    return $this->forbiddenResponse('The online examination portal is available to student accounts only.');
}
```

**Impact**: Admin and teacher accounts cannot authenticate through the API. No entry point exists for staff roles.

**Required Solution**: Create `POST /v1/staff-login` (or similar) that:
- Accepts admin, teacher, encoder, promoter roles
- Issues Sanctum tokens with appropriate abilities
- Sets `must_change_password=true` for newly created staff accounts
- Returns the same response format as student login for frontend consistency

**Implementation Location**: 
- Route: `routes/api/v1/auth.php`
- Controller: `AuthController::staffLogin()` or new `StaffAuthController`

---

### B2: Department-Based Assignment

**Problem**: `TeacherRealExamController::assignStudents()` validates against the `teacher_students` roster table, not the exam's target department. Teachers can only assign students they have personally added to their roster.

**Spec Requirement**: Teachers must be able to assign **any student of the exam's target department**, regardless of whether the student is in the teacher's personal roster. A teacher's home department must not restrict exam creation or assignment.

**Required Solution**: Modify `assignStudents()` to:
- Accept student IDs from the exam's target department
- Validate each student belongs to the exam's `department_id`
- Reject students from other departments
- Keep deduplication logic
- Keep locked-after-start protection

**Implementation Location**: 
- File: `app/Http/Controllers/Api/V1/Teacher/TeacherRealExamController.php`
- Method: `assignStudents()`

---

### B3: Department Student Picker

**Problem**: No endpoint exists to list students by department for the assignment UI. The available student listing endpoints are:
- `/v1/admin/users` - Admin/encoder only, no department filter
- Roster-based endpoints - Limited to `teacher_students` table

**Spec Requirement**: Teachers need a searchable list of students belonging to a specific department to select them for exam assignment.

**Required Solution**: Create `GET /v1/teacher/departments/{departmentId}/students` that:
- Lists students with `department_id = {departmentId}`
- Supports search by name, email
- Paginated response
- Returns: student ID, name, email, department
- Protected by `roles:admin,teacher` middleware

**Implementation Location**:
- Route: `routes/api/v1/teacher.php`
- Controller: New method in `TeacherRealExamController` or separate `TeacherDepartmentController`

---

### B4: Teacher Grading Endpoint

**Problem**: `POST /v1/exam-attempts/{id}/grade` (ExamAttemptController::manualGrade) is protected by `role:admin` middleware only. Teachers cannot grade essays or matching questions on their own exams.

**Spec Requirement**: Teachers must be able to grade essay and matching questions for examinations they own.

**Required Solution**: Create `POST /v1/teacher/real-exams/{examId}/attempts/{attemptId}/grade` that:
- Accepts grading data for essay/matching questions
- Validates the teacher owns the exam (created_by = user.id)
- Recalculates percentage and pass/fail status
- Uses the same grading logic as the admin endpoint
- Returns updated attempt with new score

**Implementation Location**:
- Route: `routes/api/v1/teacher.php`
- Controller: New method in `TeacherRealExamController` or separate `TeacherGradingController`

---

### B5: Results Export Endpoints

**Problem**: No endpoints exist to export results to Excel/.xlsx format. The backend has `openspout/openspout` available in composer.json.

**Spec Requirement**: Teachers must export results for their own authorized examinations. Administrators must export system-wide results subject to their permissions.

**Required Solution**: Create two endpoints:
1. `GET /v1/teacher/real-exams/{examId}/results/export.xlsx` - Teacher-scoped export
2. `GET /v1/admin/results/export.xlsx` - Admin-scoped export with filters

Both endpoints must:
- Use OpenSpout for real .xlsx generation
- Include: exam ID/title, department, student ID, student name, attempt status, start time, submission time, time taken, obtained marks, total marks, percentage, pass/fail, grading status
- Respect authorization scope (teacher sees own exams only, admin sees all)
- Prevent spreadsheet formula injection (sanitize user-controlled fields)
- Exclude passwords, hashes, tokens, correct answers, private data

**Implementation Location**:
- Routes: `routes/api/v1/teacher.php` and `routes/api/v1/admin-bi-dashboard.php`
- Controller: New `ResultsExportController` or methods in existing controllers

---

### B6: Admin Exam Overview Metrics

**Problem**: `GET /v1/admin/bi/dashboard/summary` (AdminBiDashboardController::summary) returns partial metrics. Missing:
- Total teachers count
- Total departments count
- Per-lifecycle exam counts (draft, ready, running, completed, archived)
- Recent exam activity

**Spec Requirement**: Administrator dashboard must display genuine backend data including total students, teachers, departments, examinations, lifecycle counts, and recent activity.

**Required Solution**: Enhance `AdminBiDashboardController::summary()` to include:
```php
{
  total_students: int,
  total_teachers: int,
  total_departments: int,
  total_examinations: int,
  lifecycle_counts: {
    draft: int,
    ready: int,
    started: int,
    completed: int,
    archived: int
  },
  recent_exams: [{id, exam_title, lifecycle_status, created_at, department_name}]
}
```

**Implementation Location**:
- File: `app/Http/Controllers/Api/V1/Dashboard/AdminBiDashboardController.php`
- Method: `summary()`

---

### B7: Department Assignment on User Create/Update

**Problem**: `UserController::store()` (line 262-299) validates and fills:
```php
$validator = Validator::make($request->all(), [
    'name' => 'required|string|max:255',
    'email' => 'required|string|email|max:255|unique:users',
    'password' => 'required|string|min:8',
    'role' => 'required|in:admin,encoder,student,teacher,promoter',
    'telegram_username' => 'nullable|string|max:255',
]);
```

The `department_id` field exists in the User model fillable but is not accepted in the validation or populated on create/update.

**Spec Requirement**: Administrators must be able to assign teachers and students to a department at account creation.

**Required Solution**: Add `department_id` to validation and fill:
```php
$validator = Validator::make($request->all(), [
    // ... existing fields
    'department_id' => 'nullable|integer|exists:departments,id',
]);

$userData = [
    // ... existing fields
    'department_id' => $request->department_id,
];
```

Same change for `update()` method.

**Implementation Location**:
- File: `app/Http/Controllers/Api/V1/Common/UserController.php`
- Methods: `store()` and `update()`

---

## 5. Backend Changes Required

### Summary Table

| ID | Change | File(s) | Priority | Complexity |
|----|--------|---------|----------|------------|
| B1 | Staff login endpoint | `routes/api/v1/auth.php`, `AuthController` | CRITICAL | Low |
| B2 | Department-based assignment | `TeacherRealExamController::assignStudents` | CRITICAL | Medium |
| B3 | Department student picker | `routes/api/v1/teacher.php`, new controller method | CRITICAL | Low |
| B4 | Teacher grading endpoint | `routes/api/v1/teacher.php`, new controller method | HIGH | Medium |
| B5 | Results export endpoints | New controller, routes in teacher/admin | HIGH | Medium |
| B6 | Admin exam overview metrics | `AdminBiDashboardController::summary` | MEDIUM | Low |
| B7 | Department on user create/update | `UserController::store`, `UserController::update` | MEDIUM | Low |

### No Schema Migrations Required

All required changes can be implemented without database migrations:
- `users.department_id` column already exists
- `exam_students` table already exists
- `exam_attempts` table already has all required fields
- `lifecycle_status` already exists on exams
- `openspout/openspout` already in composer.json

---

## 6. Frontend Changes Required

### Authentication Layer (src/lib/auth.tsx)

**Current Behavior**: Hard-rejects non-student roles (line 95-98)

**Required Changes**:
1. Replace `isStudent()` check with role-aware routing
2. Add role-based redirect logic in `RouterRoot`:
   - Student → `/dashboard`
   - Teacher → `/teacher`
   - Admin → `/admin`
3. Update login to accept staff roles once B1 is implemented
4. Create separate shell components for teacher and admin routes

### API Client (src/lib/endpoints.ts)

**Required Additions**:
```typescript
export const staffAuthApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    // POST /v1/staff-login (B1)
  }
}

export const adminApi = {
  async overview(): Promise<AdminOverview> {
    // GET /v1/admin/bi/dashboard/summary (B6)
  },
  async users(params: UserListParams): Promise<Paginated<User>> {
    // GET /v1/admin/users
  },
  async createUser(data: CreateUser): Promise<User> {
    // POST /v1/admin/users (B7)
  },
  async updateUser(id: number, data: UpdateUser): Promise<User> {
    // PUT /v1/users/{id} (B7)
  },
  async resultsExport(filters?: ResultFilters): Promise<Blob> {
    // GET /v1/admin/results/export.xlsx (B5)
  }
}

export const teacherApi = {
  async departmentStudents(deptId: number, params?: SearchParams): Promise<Paginated<Student>> {
    // GET /v1/teacher/departments/{deptId}/students (B3)
  },
  async gradeAttempt(examId: number, attemptId: number, data: GradingData): Promise<Attempt> {
    // POST /v1/teacher/real-exams/{examId}/attempts/{attemptId}/grade (B4)
  },
  async resultsExport(examId: number): Promise<Blob> {
    // GET /v1/teacher/real-exams/{examId}/results/export.xlsx (B5)
  }
}
```

### Routing (src/App.tsx)

**Required Changes**:
1. Add `/teacher/*` route tree with TeacherShell
2. Add `/admin/*` route tree with AdminShell
3. Keep existing `/dashboard`, `/exams`, etc. for students
4. Add role guards for teacher and admin routes

### New Pages Required

**Admin Dashboard**:
- `/admin` - Overview with metrics (B6)
- `/admin/users` - User management (list, create, edit, activate/deactivate)
- `/admin/departments` - Department management
- `/admin/exams` - System-wide exam oversight
- `/admin/results` - System-wide results with export (B5)

**Teacher Dashboard**:
- `/teacher` - Overview with owned exams
- `/teacher/exams` - Real Exam list
- `/teacher/exams/create` - Create Real Exam
- `/teacher/exams/{id}` - Exam detail, lifecycle management
- `/teacher/exams/{id}/questions` - Question management
- `/teacher/exams/{id}/students` - Student assignment (B2, B3)
- `/teacher/exams/{id}/results` - Results with grading (B4) and export (B5)

### Type Definitions (src/lib/types.ts)

**Required Additions**:
```typescript
export interface AdminOverview {
  total_students: number;
  total_teachers: number;
  total_departments: number;
  total_examinations: number;
  lifecycle_counts: {
    draft: number;
    ready: number;
    started: number;
    completed: number;
    archived: number;
  };
  recent_exams: RecentExam[];
}

export interface CreateUser {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'teacher' | 'student' | 'encoder';
  department_id?: number;
  telegram_username?: string;
}

export interface GradingData {
  answers: Array<{
    question_id: number;
    points?: number;
    grading_notes?: string;
  }>;
}
```

---

## 7. Implementation Sequence

### Phase 1: Backend Foundation (Critical Path)

1. **B1 - Staff Login Endpoint** (CRITICAL - blocks all staff access)
   - Create `POST /v1/staff-login`
   - Test with admin and teacher accounts
   - Update frontend auth to use new endpoint

2. **B2 - Department-Based Assignment** (CRITICAL - blocks assignment workflow)
   - Modify `TeacherRealExamController::assignStudents()`
   - Remove roster gate, add department validation
   - Test assignment flow

3. **B3 - Department Student Picker** (CRITICAL - blocks assignment UI)
   - Create `GET /v1/teacher/departments/{deptId}/students`
   - Add search and pagination
   - Test with real department data

4. **B7 - Department on User Create/Update** (MEDIUM - blocks admin workflow)
   - Update `UserController::store()` and `update()`
   - Add validation and fill for department_id
   - Test user creation with department

### Phase 2: Teacher Dashboard Features

5. **B4 - Teacher Grading Endpoint** (HIGH - blocks grading workflow)
   - Create teacher grading endpoint
   - Reuse admin grading logic
   - Test with essay/matching questions

6. **B5 - Results Export Endpoints** (HIGH - blocks export feature)
   - Create teacher export endpoint
   - Create admin export endpoint
   - Implement OpenSpout generation
   - Add formula injection protection
   - Test exports

### Phase 3: Admin Dashboard Features

7. **B6 - Admin Exam Overview Metrics** (MEDIUM - incomplete dashboard)
   - Enhance `AdminBiDashboardController::summary()`
   - Add missing metrics
   - Test with real data

### Phase 4: Frontend Implementation

8. **Authentication Layer Update**
   - Replace student-only check with role-aware routing
   - Add staff login integration
   - Create separate shells for teacher/admin

9. **API Client Extensions**
   - Add adminApi methods
   - Add teacherApi methods
   - Add type definitions

10. **Admin Dashboard Pages**
    - Overview page with metrics
    - User management pages
    - Department management pages
    - Results pages with export

11. **Teacher Dashboard Pages**
    - Overview page
    - Real Exam creation flow
    - Question management
    - Student assignment (with department picker)
    - Results with grading and export

### Phase 5: Integration & Testing

12. **End-to-End Workflows**
    - Admin creates teacher account with department
    - Teacher signs in
    - Teacher creates Real Exam for any department
    - Teacher adds questions
    - Teacher assigns students from target department
    - Teacher publishes exam as Ready
    - Teacher starts exam
    - Students take exam
    - Teacher grades essays
    - Teacher exports results
    - Admin views system-wide results

13. **Security Verification**
    - Test authorization boundaries
    - Verify backend enforcement
    - Test cross-teacher access prevention
    - Verify password security

14. **Regression Testing**
    - Verify existing student routes still work
    - Verify login/logout flows
    - Verify exam taking still works
    - Run backend tests

---

## 8. Security Considerations

### Authorization
- All new endpoints must use appropriate middleware (`roles:...`, `role:...`)
- Teacher endpoints must check `created_by = user.id` for ownership
- Admin endpoints must remain admin-only
- Student endpoints must remain student-only

### Password Security
- Examination passwords already use `RealExamPasswordService` (one-way hash)
- Never return passwords or hashes in API responses
- Rate-limit password verification (already throttled)
- Log failed attempts (already implemented)

### Timing & Attempt Integrity
- Backend is authoritative for timing (already implemented)
- Frontend countdown is display-only (already implemented)
- Transactional start prevents duplicates (already implemented)
- Auto-submit on expiry (already implemented)

### Data Integrity
- Use database transactions for multi-record operations
- Prevent duplicate assignments (already implemented)
- Validate question belongs to exam before assignment
- Foreign key constraints prevent orphaned records

### Export Security
- Sanitize user-controlled fields to prevent formula injection
- Exclude passwords, hashes, tokens, correct answers
- Respect authorization scope in queries
- Use OpenSpout for safe .xlsx generation

---

## 9. Testing Requirements

### Backend Tests
- Staff login endpoint (B1)
- Department-based assignment (B2)
- Department student picker (B3)
- Teacher grading (B4)
- Results export (B5)
- Admin overview metrics (B6)
- Department on user create/update (B7)

### Authorization Tests
- Admin can manage system-wide records
- Teacher can create exam for any department
- Teacher cannot view another teacher's results
- Student cannot access staff endpoints
- Unassigned students cannot start exam

### Frontend Tests
- Role-based routing works correctly
- Admin dashboard renders metrics
- Teacher dashboard renders owned exams
- Assignment picker shows department students
- Export downloads correct file
- Grading form submits correctly

### End-to-End Tests
- Complete workflow from admin create to student attempt to teacher grade
- Verify all lifecycle transitions work
- Verify timing enforcement
- Verify result calculations

---

## 10. Conclusion

The backend has substantial infrastructure for Real Exam management, but **7 critical gaps** must be addressed before implementing the Admin and Teacher dashboards:

1. **B1 (CRITICAL)**: No staff login endpoint - blocks all staff access
2. **B2 (CRITICAL)**: Assignment is roster-gated - blocks assignment workflow
3. **B3 (CRITICAL)**: No department student picker - blocks assignment UI
4. **B4 (HIGH)**: Teacher grading missing - blocks grading workflow
5. **B5 (HIGH)**: Results export missing - blocks export feature
6. **B6 (MEDIUM)**: Admin metrics incomplete - incomplete dashboard
7. **B7 (MEDIUM)**: Department assignment missing - blocks admin workflow

All gaps can be addressed without database migrations. The implementation sequence prioritizes critical path items (B1, B2, B3) that block the core workflows.

Once these backend changes are implemented, the frontend can be extended with role-based routing, new dashboard pages, and the required API client methods.
