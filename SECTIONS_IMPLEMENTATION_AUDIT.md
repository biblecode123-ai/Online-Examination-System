# Exam Instructions, Parts, Sections, and Shared Question Materials - Repository Audit

## Executive Summary

This audit examines three repositories:
1. **Online-Examination-System** - Student-facing examination application (React + TypeScript + Vite)
2. **ofijan-cms** - Teacher dashboard and exam management (Next.js + TypeScript)
3. **ofijan-backend** - Backend API, database, authentication (Laravel + PHP)

**Key Finding:** The backend and frontend already have partial infrastructure for exam instructions and passages, but **no support for exam sections/parts with configurable headings, section-level instructions, and shared material**. The feature must be built from scratch with careful integration into existing patterns.

---

## 1. Online-Examination-System Audit

### Technology Stack
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (client-side routing)
- **State Management:** React hooks + TanStack Query
- **Build Tool:** Vite
- **UI Library:** Radix UI components with Tailwind CSS
- **API Client:** Custom `apiRequest` function with centralized error handling

### Key Files and Responsibilities

#### Application Structure
- `src/App.tsx` - Main routing and layout shell
- `src/pages/login.tsx` - Student authentication
- `src/pages/dashboard.tsx` - Student dashboard
- `src/pages/exams.tsx` - Exam listing
- `src/pages/exam-details.tsx` - Exam details and start flow
- `src/pages/attempt.tsx` - Active examination interface (CRITICAL for this feature)
- `src/pages/submission.tsx` - Post-submission view
- `src/pages/results.tsx` - Results display

#### API Integration
- `src/lib/api.ts` - Centralized API transport with:
  - Bearer token authentication
  - Server clock synchronization
  - Error handling and retry logic
  - Request cancellation support
- `src/lib/endpoints.ts` - API endpoint wrappers
- `src/lib/types.ts` - TypeScript types matching backend responses
- `src/lib/queries.ts` - React Query hooks
- `src/lib/auth.tsx` - Authentication context and session management

#### Exam State Management
- `src/lib/examState.ts` - Exam lifecycle and attempt status logic
- `src/lib/format.ts` - Time formatting and display utilities

### Existing Exam Instructions Support

**Exam-Level Instructions:**
- The `Exam` type includes `instructions?: ExamInstruction[]` field
- `ExamInstruction` type: `{ id: number; content: string; order_index?: number | null; is_active?: boolean; }`
- Currently displayed in `exam-details.tsx` (lines 63-69) before exam start
- Instructions are rendered as an ordered list with numbered items

**Question-Level Instructions:**
- The `QuestionPayload` type includes a `passage` field
- `Passage` type: `{ id: number; title?: string | null; content?: string | null }`
- Passages are attached to individual questions
- The student app does NOT currently render passages in the exam interface

### Existing Timer and Attempt Behavior

**Timer Implementation:**
- Server-authoritative countdown using `expires_at` from backend
- Server clock sampling via `noteServerTime()` to handle client clock skew
- Timer persists across page refreshes and reconnections
- Auto-submission when timer expires

**Answer Persistence:**
- Answers saved via debounced queue with retry logic
- Text answers persisted to `sessionStorage` as backup
- Server-side state is authoritative
- Automatic retry on network failures

**Anti-Cheat (Real Exam mode only):**
- Fullscreen exit detection
- Tab switch detection
- Copy/paste detection
- Right-click detection
- Multiple-tab detection
- Network disconnect monitoring
- Violation scoring with auto-submit thresholds

### Missing Functionality for Sections Feature

1. **No Section Data Structure**
   - Current types do not include sections
   - Questions are a flat list with `order_number`
   - No grouping mechanism exists

2. **No Section Rendering**
   - The `attempt.tsx` page renders questions sequentially
   - No section headers or separators
   - No shared material display
   - No section-specific instructions

3. **No Section Navigation**
   - Question navigation grid shows all questions as numbered buttons
   - No section groupings in navigation
   - No ability to jump to a specific section

4. **No Shared Material Panel**
   - Passages exist per-question but not as section-level shared content
   - No persistent side panel for shared material
   - No support for tables, diagrams, or other media types

### Integration Points

**API Calls:**
- `examApi.get(examId)` - Fetches exam details including instructions
- `examApi.questions(examId)` - Fetches questions for standard exams
- `realExamApi.questions(attemptId)` - Fetches questions for real exams
- Both endpoints would need to return section data

**Type Extensions Needed:**
- Add `SectionContent` interface to `types.ts`
- Extend `ExamQuestionsResponse` and `RealAttemptQuestionsResponse` to include `sections`
- Update API client types

**Component Changes:**
- Modify `attempt.tsx` to render section headers
- Add shared material display component
- Update question navigation to show section groupings
- Ensure timer and answer saving work unchanged

---

## 2. ofijan-cms Audit

### Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **State Management:** React hooks + Zustand
- **API Client:** Axios with custom wrappers
- **UI Library:** Radix UI components with Tailwind CSS
- **Rich Text Editor:** TipTap (for content editing)
- **Forms:** React Hook Form with Zod validation

### Key Files and Responsibilities

#### Exam Management Pages
- `src/app/(cms)/admin/exams/page.tsx` - Exam listing
- `src/app/(cms)/admin/exams/create/page.tsx` - Exam creation (wrapper)
- `src/app/(cms)/admin/exams/[id]/edit/page.tsx` - Exam editing (wrapper)
- `src/components/admin/exam-editor.tsx` - Main exam creation/editing component (CRITICAL)

#### Question Management
- `src/app/(cms)/admin/exams/[id]/questions/page.tsx` - Question assignment
- `src/app/(cms)/admin/exams/[id]/questions/create/page.tsx` - Create question in exam
- `src/app/(cms)/admin/questions/page.tsx` - Question bank
- `src/app/(cms)/admin/questions/create/page.tsx` - Create question

#### API Integration
- `src/lib/api.ts` - API client with authentication
- `src/lib/api/templates.ts` - API endpoint templates
- `src/lib/backend-url.ts` - Backend URL configuration

### Existing Exam Editor Structure

**ExamEditor Component** (`src/components/admin/exam-editor.tsx`):
- Large monolithic component (~200+ lines visible, likely much longer)
- Multi-step form with tabs for different exam settings
- Currently handles:
  - Basic exam details (title, description, category, department)
  - Duration and passing percentage
  - Real Exam settings (watermark, anti-cheat, violation thresholds)
  - Question mode (text/image)
  - Academic year and audience settings
  - Active date range
  - League association (for quizzes)

**Form Data Structure** (`ExamFormData` interface):
```typescript
interface ExamFormData {
  exam_title: string;
  description?: string;
  category_id: number;
  department_id?: number;
  password?: string;
  total_time: number;
  question_mode?: "text" | "image";
  shuffle_questions?: boolean;
  academic_year?: string;
  passing_percentage?: number;
  points_per_question?: number;
  is_active?: boolean;
  is_premium?: boolean;
  allowed_modes?: string[];
  active_from?: string | null;
  active_until?: string | null;
  league_id?: number | null;
  // Real Exam settings...
}
```

**Rich Text Editor:**
- TipTap-based editor available in the codebase
- Used for AI import and other features
- Supports lists, headings, formatting
- Can be reused for exam-level and section-level instructions

### Missing Functionality for Sections Feature

1. **No Section Creation UI**
   - No UI to add Part/Section/Custom headings
   - No heading style selector (Part/Section/Custom)
   - No numbering style selector (Roman/Arabic/None)
   - No section title input

2. **No Section Instructions Editor**
   - No rich text editor for section-level instructions
   - Section instructions are not part of the current form

3. **No Shared Material Editor**
   - No UI to add section-level shared material
   - No support for different material types (passage, scenario, table, diagram)
   - No media upload integration for section content

4. **No Question-Section Association**
   - Questions are currently assigned directly to exams
   - No UI to drag-and-drop questions into sections
   - No visual indication of which section a question belongs to
   - No section ordering UI

5. **No Exam Preview with Sections**
   - Existing preview (if any) likely shows flat question list
   - No preview of section structure
   - No preview of shared material display

### Integration Points

**API Calls:**
- `examApi.getById(examId)` - Fetch exam for editing
- `examApi.create(formData)` - Create new exam
- `examApi.update(examId, formData)` - Update existing exam
- Would need new endpoints for section CRUD operations

**Component Extensions Needed:**
- Add new tab/step in ExamEditor for "Sections & Structure"
- Create SectionEditor component for managing individual sections
- Create SharedMaterialEditor component for section content
- Create QuestionSectionPicker for associating questions with sections
- Add exam preview component that renders section structure

**Form Data Extensions:**
- Add `sections` array to `ExamFormData`
- Define `SectionFormData` interface with:
  - heading_style: 'part' | 'section' | 'custom'
  - numbering_style: 'roman' | 'arabic' | 'none'
  - title: string
  - instructions: string (rich text)
  - shared_material_type: 'none' | 'passage' | 'scenario' | 'table' | 'diagram' | 'other'
  - shared_material_content: string
  - question_ids: number[]
  - order: number

---

## 3. ofijan-backend Audit

### Technology Stack
- **Framework:** Laravel (PHP)
- **Database:** MySQL
- **API Routes:** Laravel RESTful controllers
- **Authentication:** Laravel Sanctum (Bearer tokens)
- **Validation:** Laravel validation rules
- **File Storage:** Laravel Storage

### Key Database Tables

#### Core Exam Tables
- `exams` - Exam definitions
- `exam_categories` - Exam categories (including Real Exam category)
- `exam_questions` - Pivot table linking exams to questions with ordering
- `questions` - Question definitions
- `question_options` - Multiple choice options
- `exam_attempts` - Student exam attempts
- `student_answers` - Student answers per question

#### Supporting Tables
- `users` - User accounts (students, teachers, admins)
- `departments` - Academic departments
- `courses` - Course catalog
- `colleges` - College/university institutions
- `passages` - Question passages (currently per-question)
- `instructions` - Generic instructions table with polymorphic relationship

#### Real Exam Tables
- `real_exam_settings` - Real Exam configuration (stored in `exams.real_exam_settings` JSON)
- `exam_attempt_events` - Anti-cheat event logs

### Existing Models

**Exam Model** (`app/Models/Exam.php`):
- Fields: `exam_title`, `description`, `category_id`, `department_id`, `course_id`, `password`, `total_time`, `passing_percentage`, `is_active`, `is_premium`, `audience`, `active_from`, `active_until`, `real_exam_settings` (JSON), `lifecycle_status`, `lifecycle_changed_at`
- Relationships:
  - `category` - BelongsTo ExamCategory
  - `department` - BelongsTo Department
  - `course` - BelongsTo Course
  - `questions` - BelongsToMany via ExamQuestion
  - `instructions` - MorphMany (via polymorphic Instruction model)
- Supports soft deletes
- Uses DeltaSyncable trait for incremental sync

**Instruction Model** (`app/Models/Instruction.php`):
- Fields: `content`, `type`, `context_type`, `context_id`, `order_index`, `is_active`
- Polymorphic relationship to any context (Exam, Passage, QuestionGroup, Question)
- Currently used for exam-level instructions

**Passage Model** (`app/Models/Passage.php`):
- Fields: `title`, `content`
- Relationships:
  - `questions` - HasMany Question
  - `instructions` - MorphMany Instruction
- Currently attached to individual questions, not sections

**ExamQuestion Model** (`app/Models/ExamQuestion.php`):
- Fields: `exam_id`, `question_id`, `order_number`, `points`
- Pivot table between exams and questions
- Maintains question order within an exam
- No section association currently

### Existing API Endpoints

**Exam Endpoints** (from route inspection):
- `GET /api/v1/exams` - List exams
- `GET /api/v1/exams/{id}` - Get exam details
- `POST /api/v1/exams` - Create exam
- `PUT/PATCH /api/v1/exams/{id}` - Update exam
- `DELETE /api/v1/exams/{id}` - Delete exam
- `GET /api/v1/exams/{id}/questions` - Get exam questions (standard flow)
- Real Exam endpoints under `/api/v1/real-exams/` and `/api/v1/real-exam-attempts/`

**Question Endpoints:**
- `GET /api/v1/questions` - List questions
- `POST /api/v1/questions` - Create question
- `PUT/PATCH /api/v1/questions/{id}` - Update question
- `DELETE /api/v1/questions/{id}` - Delete question

### Missing Database Tables

**No Section Tables Exist:**
- No `exam_sections` table
- No `section_questions` pivot table
- No shared material storage beyond the `passages` table (which is per-question)

### Missing API Endpoints

**No Section Endpoints:**
- No endpoints to create/update/delete sections
- No endpoints to associate questions with sections
- No endpoints to reorder sections
- No endpoints to fetch exam structure with sections

### Missing Backend Validation

**No Section Validation:**
- No validation for section heading rules
- No validation for section question associations
- No prevention of duplicate question associations
- No enforcement of section ordering constraints

### Real Exam Active Exam Protection

**Existing Protection:**
- `lifecycle_status` field on exams (draft/ready/started/completed/cancelled/archived)
- RealExamService refuses to start attempts unless exam is 'started'
- This lifecycle system can be extended to lock exam structure once attempts begin

**Implementation Path:**
- Add check in section update/delete operations
- Reject section modifications if exam has `lifecycle_status = 'started'` and has active attempts
- Create exam version snapshot when first attempt starts (optional for future)

---

## 4. Gaps and Missing Functionality

### Database Schema Gaps

1. **No Exam Sections Table**
   - Need `exam_sections` table with:
     - `id` (primary key)
     - `exam_id` (foreign key to exams)
     - `heading_style` (enum: 'part', 'section', 'custom')
     - `numbering_style` (enum: 'roman', 'arabic', 'none')
     - `title` (string)
     - `instructions` (text or rich text)
     - `shared_material_type` (enum: 'none', 'passage', 'scenario', 'table', 'diagram', 'other')
     - `shared_material_content` (text or JSON for structured data)
     - `media_references` (JSON array of media IDs)
     - `order` (integer for section ordering)
     - `created_at`, `updated_at` timestamps
     - `deleted_at` (soft delete)

2. **No Section-Question Association Table**
   - Need `section_questions` pivot table with:
     - `id` (primary key)
     - `section_id` (foreign key to exam_sections)
     - `question_id` (foreign key to questions)
     - `order` (integer for question ordering within section)
     - Unique constraint on (section_id, question_id) to prevent duplicates
     - Unique constraint on (exam_id, question_id) to ensure question appears at most once per exam

3. **No Shared Material Storage**
   - The existing `passages` table is per-question, not per-section
   - Need to either:
     - Extend `passages` to be polymorphic (attach to sections or questions)
     - Or store shared material directly in `exam_sections.shared_material_content`
   - Recommendation: Store in `exam_sections` table for simplicity, use existing media storage for images/diagrams

### API Endpoint Gaps

1. **No Section CRUD Endpoints**
   - Need `POST /api/v1/exams/{examId}/sections` - Create section
   - Need `PUT /api/v1/exams/{examId}/sections/{sectionId}` - Update section
   - Need `DELETE /api/v1/exams/{examId}/sections/{sectionId}` - Delete section
   - Need `PATCH /api/v1/exams/{examId}/sections/reorder` - Reorder sections

2. **No Section-Question Association Endpoints**
   - Need `POST /api/v1/sections/{sectionId}/questions` - Add question to section
   - Need `DELETE /api/v1/sections/{sectionId}/questions/{questionId}` - Remove question from section
   - Need `PATCH /api/v1/sections/{sectionId}/questions/reorder` - Reorder questions in section
   - Need `POST /api/v1/exams/{examId}/questions/{questionId}/move-to-section` - Move question between sections

3. **No Exam Structure Endpoint**
   - Need to extend existing `GET /api/v1/exams/{id}/questions` to include sections
   - Need to extend `GET /api/v1/real-exam-attempts/{attemptId}/questions` to include sections
   - Response format must include:
     - Exam-level instructions
     - Ordered sections with headings, instructions, shared material
     - Questions grouped by sections
     - Standalone questions (not in any section)

### Backend Validation Gaps

1. **No Section Structure Validation**
   - Need validation for:
     - Heading title required if heading_style is not 'none'
     - Section order must be unique within exam
     - Question must exist and belong to question bank
     - Question cannot appear in multiple sections of same exam
     - Question cannot be both in a section and standalone

2. **No Active Exam Protection**
   - Need check in section create/update/delete:
     - If exam has `lifecycle_status = 'started'`, reject modifications
     - If exam has any active attempts, reject modifications
   - Need to store exam structure snapshot when first attempt starts (optional but recommended)

3. **No Content Security Validation**
   - Need sanitization for:
     - Rich text instructions (DOMPurify or similar)
     - Shared material content
     - Prevent XSS attacks
   - Need validation for:
     - Media file types and sizes
     - Table structure validation (if structured tables supported)

### CMS UI Gaps

1. **No Section Management UI**
   - Need new tab/step in ExamEditor for sections
   - Need SectionEditor component for each section
   - Need SharedMaterialEditor component
   - Need QuestionSectionPicker for question association

2. **No Exam Preview with Sections**
   - Need preview component that renders:
     - Exam-level instructions
     - Section headings with configured numbering
     - Section instructions
     - Shared material
     - Questions grouped by sections
     - Calculated question ranges

3. **No Drag-and-Drop Question Assignment**
   - Need UI to move questions between sections
   - Need visual indication of section membership
   - Need question ordering within sections

### Student App UI Gaps

1. **No Section Rendering**
   - Need to render section headers above questions
   - Need to display section instructions
   - Need to display shared material
   - Need to handle section transitions smoothly

2. **No Shared Material Display**
   - Need component to display passages, scenarios, tables, diagrams
   - Need responsive design for mobile/desktop
   - Need image zoom for diagrams
   - Need table scrolling for large datasets

3. **No Section Navigation**
   - Need to update question navigation grid to show section groupings
   - Need ability to jump to section start
   - Need visual indication of current section

---

## 5. Proposed Implementation Sequence

### Phase 1: Backend Foundation (ofijan-backend)

**Step 1.1: Database Schema Changes**
- Create migration for `exam_sections` table
- Create migration for `section_questions` pivot table
- Add foreign key constraints and indexes
- Add unique constraints to prevent duplicate question associations
- Run migrations

**Step 1.2: Model Creation**
- Create `ExamSection` model with relationships:
  - `exam()` - BelongsTo Exam
  - `questions()` - BelongsToMany Question via SectionQuestion
- Create `SectionQuestion` pivot model
- Update `Exam` model to add `sections()` relationship
- Update `Question` model to add `sections()` relationship (optional)

**Step 1.3: API Controllers**
- Create `ExamSectionController` with:
  - `store()` - Create section
  - `update()` - Update section
  - `destroy()` - Delete section
  - `reorder()` - Reorder sections
- Add section association methods to existing `ExamQuestionController` or create new:
  - `addQuestion()` - Add question to section
  - `removeQuestion()` - Remove question from section
  - `moveQuestion()` - Move question between sections
  - `reorderQuestions()` - Reorder questions in section

**Step 1.4: API Route Registration**
- Add routes under `/api/v1/exams/{examId}/sections`
- Add routes under `/api/v1/sections/{sectionId}/questions`
- Add route for exam structure endpoint

**Step 1.5: Response Resources**
- Create `ExamSectionResource` for section serialization
- Update `ExamQuestionResource` to include section information
- Update `ExamResource` to include sections (for teacher view)
- Update question endpoints to return section structure

**Step 1.6: Validation and Authorization**
- Add FormRequest validation for section creation/update
- Add validation for section-question associations
- Add policy checks for section modifications (teacher ownership)
- Add active exam protection checks (reject if exam has started attempts)

**Step 1.7: Backend Tests**
- Write unit tests for ExamSection model
- Write feature tests for section CRUD endpoints
- Write tests for section-question associations
- Write tests for validation and authorization
- Write tests for active exam protection

### Phase 2: CMS Implementation (ofijan-cms)

**Step 2.1: Type Definitions**
- Add `SectionFormData` interface
- Add `SharedMaterialType` enum
- Add `HeadingStyle` and `NumberingStyle` types
- Update API client types to include section endpoints

**Step 2.2: API Client Extensions**
- Add API methods for section CRUD operations
- Add API methods for section-question associations
- Add error handling for section operations

**Step 2.3: Section Editor Component**
- Create `SectionEditor` component with:
  - Heading style selector (Part/Section/Custom)
  - Numbering style selector (Roman/Arabic/None)
  - Title input
  - Instructions rich text editor (TipTap)
  - Shared material type selector
  - Shared material content editor
  - Delete button
- Add validation for required fields

**Step 2.4: Shared Material Editor Component**
- Create `SharedMaterialEditor` component with:
  - Type-specific editor (passage, scenario, table, diagram)
  - Rich text editor for text-based content
  - Media upload for diagrams/images
  - Table editor for structured data (if supporting tables)
  - Preview of rendered content

**Step 2.5: Question Section Picker**
- Create `QuestionSectionPicker` component with:
  - List of available questions
  - Section assignment dropdown/selector
  - Drag-and-drop support (optional but recommended)
  - Visual indication of current section membership
  - Question ordering within section

**Step 2.6: Exam Editor Integration**
- Add new tab/step "Sections & Structure" to ExamEditor
- Integrate SectionEditor for each section
- Integrate SharedMaterialEditor
- Integrate QuestionSectionPicker
- Add section ordering UI (drag-and-drop or up/down buttons)
- Save section data with exam form submission

**Step 2.7: Exam Preview Component**
- Create `ExamPreview` component that renders:
  - Exam-level instructions
  - Section headings with correct numbering
  - Section instructions
  - Shared material
  - Questions grouped by sections
  - Calculated question ranges
  - Standalone questions
- Match student app rendering as closely as possible

**Step 2.8: CMS Tests**
- Write unit tests for SectionEditor component
- Write unit tests for SharedMaterialEditor component
- Write integration tests for exam creation with sections
- Write tests for section-question associations
- Write tests for exam preview rendering

### Phase 3: Student App Implementation (Online-Examination-System)

**Step 3.1: Type Extensions**
- Add `SectionContent` interface to `types.ts`
- Add `SharedMaterial` type
- Extend `ExamQuestionsResponse` to include `sections`
- Extend `RealAttemptQuestionsResponse` to include `sections`

**Step 3.2: API Client Updates**
- Update `examApi.questions()` to handle section data
- Update `realExamApi.questions()` to handle section data
- No new API methods needed, just response parsing

**Step 3.3: Section Header Component**
- Create `SectionHeader` component with:
  - Rendered heading with correct style and numbering
  - Section instructions display
  - Shared material display
  - Collapsible/expandable (optional for large content)

**Step 3.4: Shared Material Display Component**
- Create `SharedMaterialDisplay` component with:
  - Rich text rendering for passages/scenarios
  - Image display with zoom for diagrams
  - Table rendering for datasets
  - Responsive design
  - Accessibility (ARIA labels, keyboard navigation)

**Step 3.5: Attempt Page Updates**
- Update `attempt.tsx` to:
  - Fetch and store section data
  - Render section headers before questions
  - Display shared material
  - Maintain existing timer and answer saving behavior
  - Update question navigation to show section groupings
  - Handle section transitions smoothly

**Step 3.6: Question Navigation Updates**
- Update question navigation grid to:
  - Show section groupings
  - Add section labels
  - Add ability to jump to section start
  - Maintain existing answered/current/review indicators

**Step 3.7: Exam Details Page Updates**
- Update `exam-details.tsx` to:
  - Display exam-level instructions (already exists, ensure it works)
  - No changes needed for sections (sections shown during attempt only)

**Step 3.8: Student App Tests**
- Write unit tests for SectionHeader component
- Write unit tests for SharedMaterialDisplay component
- Write integration tests for attempt page with sections
- Write tests for timer persistence with sections
- Write tests for answer saving with sections

### Phase 4: Integration Testing

**Step 4.1: End-to-End Test Flow**
1. Teacher creates exam with general instructions
2. Teacher adds Part I with instructions and scenario
3. Teacher adds questions to Part I
4. Teacher adds Section II with instructions and passage
5. Teacher adds questions to Section II
6. Teacher adds standalone questions
7. Teacher previews exam
8. Teacher saves and publishes exam
9. Student logs in and views exam details
10. Student starts exam
11. Student sees general instructions
12. Student sees Part I header, instructions, scenario
13. Student answers questions in Part I
14. Student navigates to Section II
15. Student sees Section II header, instructions, passage
16. Student answers questions in Section II
17. Student answers standalone questions
18. Student submits exam
19. Verify section structure is preserved in results

**Step 4.2: Regression Testing**
- Run existing backend tests
- Run existing CMS tests
- Run existing student app tests
- Verify no breaking changes to existing exams
- Verify backward compatibility with exams without sections

**Step 4.3: Performance Testing**
- Test with large exams (50+ questions, 10+ sections)
- Test with large shared material (long passages, large images)
- Verify rendering performance
- Verify API response times

### Phase 5: Documentation and Cleanup

**Step 5.1: Documentation**
- Update backend API documentation
- Add CMS user guide for sections feature
- Update student app documentation
- Document database schema changes
- Document migration and rollback procedures

**Step 5.2: Code Cleanup**
- Remove any temporary mock data
- Remove debug code
- Ensure consistent code style
- Add comments where complex logic exists

**Step 5.3: Deliverables**
- Repository audit document (this document)
- Design summary
- Database changes documentation
- API changes documentation
- CMS changes documentation
- Student changes documentation
- Security summary
- Test results
- End-to-end evidence
- Changed files list
- Outstanding issues

---

## 6. Backward Compatibility Strategy

### Database Compatibility
- New tables (`exam_sections`, `section_questions`) are additive
- Existing `exam_questions` table remains unchanged
- Existing exams without sections will work:
  - `exam_sections` table will be empty for those exams
  - API endpoints will return empty sections array
  - Student app will render questions as standalone

### API Compatibility
- Existing endpoints will not be removed
- New section fields in responses will be optional
- Existing API clients will ignore unknown fields
- New endpoints are additions, not modifications

### Frontend Compatibility
- Student app will handle missing section data gracefully
- If `sections` array is empty or null, render questions as before
- CMS will handle exams without sections (existing behavior)

### Migration Rollback
- If issues arise, can rollback by:
  - Dropping `exam_sections` and `section_questions` tables
  - Removing section-related code from CMS and student app
  - Existing exams will continue to work without sections

---

## 7. Security Considerations

### Authorization
- Only exam owners/teachers can manage sections
- Students cannot access section management endpoints
- Section visibility follows exam visibility rules

### Content Security
- Sanitize all rich text content (instructions, shared material)
- Validate media file types and sizes
- Prevent XSS attacks through shared content
- Use DOMPurify or similar for HTML sanitization

### Active Exam Protection
- Reject section modifications if exam has active attempts
- Use existing `lifecycle_status` system
- Consider exam versioning for audit trail (optional)

### Data Integrity
- Unique constraints prevent duplicate question associations
- Foreign key constraints prevent orphaned records
- Transactions for multi-record operations

---

## 8. Risks and Mitigations

### Risk 1: Scope Creep
- **Mitigation:** Stick to the requirements in the prompt
- **Mitigation:** Phase implementation clearly
- **Mitigation:** Focus on core functionality first

### Risk 2: Breaking Existing Exams
- **Mitigation:** Additive database changes only
- **Mitigation:** Comprehensive testing before deployment
- **Mitigation:** Clear rollback procedure

### Risk 3: Performance Issues
- **Mitigation:** Test with large exams early
- **Mitigation:** Add database indexes appropriately
- **Mitigation:** Optimize API queries with eager loading

### Risk 4: UI Complexity
- **Mitigation:** Reuse existing UI components
- **Mitigation:** Keep CMS UI simple initially
- **Mitigation:** Follow existing design patterns

### Risk 5: Student Confusion
- **Mitigation:** Clear section headers and instructions
- **Mitigation:** Maintain familiar question navigation
- **Mitigation:** Test with real users if possible

---

## 9. Definition of Done Checklist

The implementation is complete when:

- [ ] Backend has `exam_sections` and `section_questions` tables
- [ ] Backend has section CRUD API endpoints
- [ ] Backend has section-question association endpoints
- [ ] Backend validates section structure and prevents duplicates
- [ ] Backend protects active exams from modification
- [ ] Backend tests pass for all new functionality
- [ ] CMS has section creation/editing UI
- [ ] CMS has shared material editor
- [ ] CMS has question-section association UI
- [ ] CMS has exam preview with sections
- [ ] CMS tests pass for all new functionality
- [ ] Student app renders section headers correctly
- [ ] Student app displays section instructions
- [ ] Student app displays shared material
- [ ] Student app maintains timer and answer saving
- [ ] Student app handles exams without sections
- [ ] Student app tests pass for all new functionality
- [ ] End-to-end test passes with real data
- [ ] No "Group 1" or "Group 2" labels appear in UI
- [ ] Backward compatibility verified
- [ ] Documentation complete
- [ ] Deliverables document complete

---

## 10. Next Steps

Based on this audit, the implementation should proceed in the following order:

1. **Backend Schema** - Create database tables and models
2. **Backend API** - Implement section CRUD and association endpoints
3. **Backend Tests** - Validate backend functionality
4. **CMS UI** - Implement section management in exam editor
5. **CMS Tests** - Validate CMS functionality
6. **Student App** - Implement section rendering
7. **Student Tests** - Validate student app functionality
8. **Integration** - End-to-end testing
9. **Documentation** - Complete all documentation
10. **Deliverables** - Produce final deliverables document

This audit is complete. Proceeding to implementation.
