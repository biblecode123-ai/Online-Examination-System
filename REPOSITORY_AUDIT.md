# Repository Audit: Exam Instructions, Parts, Sections, and Shared Question Materials

## Executive Summary

The backend infrastructure for exam sections (QuestionGroups) is **already implemented** in `ofijan-backend`. The database schema, models, and Real Exam API endpoints support sections with headings, instructions, and shared passages. However, the CMS teacher interface and student application need updates to fully utilize this infrastructure.

---

## 1. Online-Examination-System (Student Application)

### Framework & Architecture
- **Framework**: React + TypeScript with Vite
- **Routing**: Wouter (file-based routing)
- **State Management**: React hooks + TanStack Query
- **UI Components**: Custom components with TailwindCSS
- **API Client**: Custom fetch wrapper in `src/lib/api.ts`

### Key Files & Responsibilities

#### Authentication & Session
- `src/lib/auth.tsx` - AuthProvider, login/logout, token management
- `src/lib/endpoints.ts` - API endpoints (authApi, examApi, attemptApi, realExamApi)
- Session persistence via localStorage tokens

#### Exam Flow
- `src/pages/exam-details.tsx` - Exam details, instructions display, exam start
- `src/pages/attempt.tsx` - Active exam interface, question navigation, answer saving
- `src/pages/submission.tsx` - Post-exam submission confirmation
- `src/pages/results.tsx` - Results display

#### Existing Section Support
**Location**: `src/pages/attempt.tsx` (lines 33-43, 106, 360-393)

```typescript
// Mock section types already defined
interface SectionContent {
  id: number;
  title: string;
  heading_style: 'part' | 'section' | 'custom';
  numbering_style: 'roman' | 'arabic' | 'none';
  instructions: string | null;
  passage_content: string | null;
  question_ids: number[];
}

// Section state already exists
const [sections, setSections] = useState<SectionContent[]>([]);

// Backend sections are fetched (RealExamAttemptController)
sectionData = res.sections ?? [];
```

**Status**: The student app already fetches sections from the backend Real Exam API, but the rendering logic to display them is **not implemented**. The sections data is received but not rendered in the UI.

#### API Types
**Location**: `src/lib/types.ts`

- `Exam` interface includes `instructions?: ExamInstruction[]`
- `ExamInstruction` interface exists (id, content, order_index, is_active)
- `QuestionPayload` includes `passage?: { id, title, content }`
- **Missing**: Section/QuestionGroup types in the public type definitions

### Existing API Endpoints Used
- `GET /v1/exams/{id}` - Exam with instructions
- `GET /v1/exams/{id}/questions` - Questions for standard exams
- `POST /v1/student/exams/{examId}/start` - Start attempt
- `POST /v1/real-exams/{exam}/start` - Start real exam
- `GET /v1/real-exam-attempts/{attempt}/questions` - **Already returns sections**
- `POST /v1/real-exam-attempts/{attempt}/answers` - Save answer

### Gaps Identified
1. **Section Rendering**: The `attempt.tsx` page receives sections data but doesn't render them
2. **Section Types**: Section types are defined locally but not in shared `types.ts`
3. **Standard Exam Support**: Standard exam questions endpoint doesn't return sections (only Real Exam)
4. **Question Numbering**: No logic to calculate question ranges per section
5. **Shared Material Display**: No UI component to display passages alongside questions

---

## 2. ofijan-backend (Laravel API)

### Framework & Architecture
- **Framework**: Laravel 11
- **Database**: MySQL with Eloquent ORM
- **API**: RESTful with Sanctum authentication
- **Routing**: API routes in `routes/api.php` and `routes/api/v1/*.php`

### Database Schema

#### Existing Tables

**question_groups** (Migration: 2026_06_06_04_093100, updated 2026_10_19_110601)
```php
- id
- exam_id (foreign key, cascade delete)
- title (string)
- description (text, nullable) - repurposed as section instructions
- order_index (integer, default 0)
- heading_style (string, default 'section') - 'part', 'section', 'custom'
- numbering_style (string, default 'arabic') - 'roman', 'arabic', 'none'
- passage_id (foreign key to passages, nullable, set null on delete)
- timestamps
```

**passages** (Migration: 2026_06_06_04_000002)
```php
- id
- title (string)
- content (text)
- timestamps
```

**instructions** (Migration: 2026_06_04_093000)
```php
- id
- content (text)
- type (string) - 'exam', 'section', 'question', etc.
- context_type (string) - polymorphic type
- context_id (integer) - polymorphic ID
- order_index (integer)
- is_active (boolean)
- timestamps
```

**questions** (has group_id column)
```php
- id
- question_text (encrypted)
- question_type (string)
- passage_id (nullable) - direct passage reference
- group_id (nullable) - QuestionGroup reference
- exam_id (nullable) - direct exam reference (via pivot)
- order_number (integer)
- points (integer)
- ... other fields
```

**exam_questions** (pivot table)
```php
- exam_id
- question_id
- order_number
- points
```

### Models

#### QuestionGroup (app/Models/QuestionGroup.php)
```php
protected $fillable = [
    'exam_id',
    'title',
    'description', // Used for section instructions
    'order_index',
    'heading_style',
    'numbering_style',
    'passage_id',
];

// Relationships
public function exam() { return $this->belongsTo(Exam::class); }
public function passage() { return $this->belongsTo(Passage::class); }
public function questions() { return $this->hasMany(Question::class, 'group_id'); }
public function instructions() { return $this->morphMany(Instruction::class, 'context'); }
```

#### Instruction (app/Models/Instruction.php)
```php
protected $fillable = [
    'content',
    'type',
    'context_type',
    'context_id',
    'order_index',
    'is_active',
];

// Polymorphic relationship to Exam, Passage, QuestionGroup, Question
public function context() { return $this->morphTo(); }
```

#### Exam (app/Models/Exam.php)
```php
// Existing relationships
public function instructions() { return $this->morphMany(Instruction::class, 'context'); }
public function questionGroups() { return $this->hasMany(QuestionGroup::class); }
public function questions() { return $this->belongsToMany(Question::class, 'exam_questions'); }
```

#### Question (app/Models/Question.php)
```php
// Existing relationships
public function passage() { return $this->belongsTo(Passage::class, 'passage_id'); }
public function group() { return $this->belongsTo(QuestionGroup::class, 'group_id'); }
public function instructions() { return $this->morphMany(Instruction::class, 'context'); }
```

### Existing API Endpoints

#### Real Exam Attempt Controller (app/Http/Controllers/Api/V1/Exam/RealExamAttemptController.php)

**GET /real-exam-attempts/{attempt}/questions** (lines 115-173)
```php
// ALREADY RETURNS SECTIONS
$fresh->exam->load(['questions', 'questionGroups.instructions', 'questionGroups.passage']);

$sections = $fresh->exam->questionGroups->map(fn($g) => [
    'id' => $g->id,
    'title' => $g->title,
    'heading_style' => $g->heading_style,
    'numbering_style' => $g->numbering_style,
    'instructions' => $g->instructions->first()?->content,
    'passage_content' => $g->passage?->content,
    'question_ids' => $g->questions->pluck('id')->toArray(),
]);

return $this->successResponse([
    'exam_id' => $fresh->exam_id,
    'attempt_id' => $fresh->id,
    'questions' => $questions,
    'sections' => $sections, // <-- SECTIONS ALREADY RETURNED
]);
```

#### Exam Controller (app/Http/Controllers/ExamController.php)

**POST /exams** (lines 227-348)
- Accepts `instructions` array for exam-level instructions
- Creates Instruction records with type='exam' and context_type='App\Models\Exam'

**GET /exams/{id}** (via ExamResource)
- Returns exam with instructions relationship

### Existing Controllers

#### QuestionGroupController (app/Http/Controllers/QuestionGroupController.php)
```php
// CRUD endpoints exist but are NOT in the API/V1 namespace
public function index(Request $request) // Filter by exam_id
public function store(Request $request) // Create group
public function show(QuestionGroup $questionGroup) // With questions and instructions
public function update(Request $request, QuestionGroup $questionGroup)
public function destroy(QuestionGroup $questionGroup)
```

**Status**: Basic CRUD exists but needs to be:
1. Moved to API/V1 namespace for consistency
2. Enhanced with proper validation for heading_style, numbering_style
3. Added authorization (teacher ownership)
4. Added question association management

### Gaps Identified

1. **API V1 Endpoints**: QuestionGroupController is not in the V1 API namespace
2. **Standard Exam Support**: Standard exam questions endpoint doesn't return sections
3. **Question Association**: No API endpoint to associate questions with groups
4. **Section Ordering**: No API endpoint to reorder sections
5. **Exam-Level Instructions**: Instructions exist but no dedicated UI in CMS
6. **Validation**: Missing validation for heading_style and numbering_style values
7. **Authorization**: No teacher ownership checks on QuestionGroup operations
8. **Active Exam Locking**: No mechanism to prevent section changes after attempts start

---

## 3. ofijan-cms (Teacher Dashboard)

### Framework & Architecture
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: shadcn/ui components with TailwindCSS
- **State**: React hooks
- **API**: Custom fetch wrapper in `src/lib/api.ts`

### Key Files & Responsibilities

#### Teacher Exam Pages

**`src/app/(cms)/teacher/exams/page.tsx`**
- Lists teacher's exams
- Shows question count buckets
- Filters by status and question count

**`src/app/(cms)/teacher/exams/create/page.tsx`**
- Creates new Real Exam category exams
- Fields: title, category, department, description, duration, password
- **Missing**: Exam-level instructions field

**`src/app/(cms)/teacher/exams/[id]/page.tsx`**
- Exam detail view
- Lifecycle status management (draft → ready → started → completed)
- Exam extension dialog
- **Missing**: Section management UI

**`src/app/(cms)/teacher/exams/[id]/questions/page.tsx`**
- Question management for an exam
- Add questions from topics
- Question analytics display
- **Partial Section Support**: Lines 87-91 show section dialog state but not fully implemented

```typescript
// New Section State (lines 87-91)
const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
const [newSectionTitle, setNewSectionTitle] = useState("");
const [newSectionStyle, setNewSectionStyle] = useState("section");
```

**Status**: Section dialog state exists but the actual dialog UI and backend integration are missing.

### API Client (src/lib/api.ts)
- `teacherApi.getExams()` - List teacher's exams
- `teacherApi.getExam(id)` - Get exam details
- `teacherApi.deleteExam(id)` - Delete exam
- `teacherApi.updateExamStatus(id, status)` - Update lifecycle status
- **Missing**: Section/QuestionGroup API methods

### Gaps Identified

1. **Exam Instructions**: No field to add/edit exam-level instructions in create/edit forms
2. **Section Creation UI**: Section dialog state exists but no actual UI component
3. **Section Editing**: No UI to edit existing sections (heading, instructions, shared material)
4. **Section Reordering**: No drag-and-drop or move controls for sections
5. **Question Association**: No UI to assign questions to sections
6. **Section Preview**: No preview mode to see how sections will appear to students
7. **Shared Material Editor**: No rich text editor for passages/scenarios
8. **Numbering Configuration**: No UI to select numbering style (Roman/Arabic/None)

---

## 4. Existing Database Entities & Relationships

```
Exam (1) ----< (N) QuestionGroup
  |                    |
  |                    |---- (1) Passage (shared material)
  |                    |
  |                    |---- (N) Question
  |                           |
  |                           |---- (N) QuestionOption
  |
  |---- (N) Instruction (exam-level)
  |
  |---- (N) Question (via exam_questions pivot, independent of groups)

QuestionGroup (1) ----< (N) Instruction (section-level)
```

### Key Relationships
- **Exam → QuestionGroup**: One-to-many (exam has many sections)
- **QuestionGroup → Question**: One-to-many (section has many questions)
- **QuestionGroup → Passage**: Many-to-one (section has optional shared passage)
- **QuestionGroup → Instruction**: One-to-many (section has instructions)
- **Exam → Instruction**: One-to-many (exam has instructions)
- **Question → QuestionGroup**: Many-to-one (question belongs to optional section)

---

## 5. Missing Functionality

### Backend
1. **API V1 QuestionGroup Endpoints**: Move QuestionGroupController to V1 namespace
2. **Standard Exam Section Support**: Add sections to standard exam questions endpoint
3. **Question Association API**: Endpoint to add/remove questions from sections
4. **Section Reordering API**: Endpoint to update section order_index
5. **Active Exam Locking**: Prevent section modifications after first attempt
6. **Validation**: Validate heading_style in ['part', 'section', 'custom']
7. **Validation**: Validate numbering_style in ['roman', 'arabic', 'none']

### CMS (Teacher Interface)
1. **Exam Instructions Field**: Rich text editor for exam-level instructions
2. **Section Creation Dialog**: Full UI for creating sections
3. **Section Editing UI**: Edit heading, instructions, shared material
4. **Section List Display**: Show all sections with their questions
5. **Question Assignment UI**: Drag-and-drop or selector to assign questions to sections
6. **Section Reordering**: Drag-and-drop to reorder sections
7. **Shared Material Editor**: Rich text editor for passages
8. **Preview Mode**: Student view preview of exam structure

### Student App
1. **Section Rendering**: Display section headings with correct styling
2. **Section Instructions Display**: Show section-specific instructions
3. **Shared Material Display**: Render passages/scenarios before questions
4. **Question Numbering**: Calculate and display question ranges per section
5. **Standalone Questions**: Display questions not in any section
6. **Navigation**: Section-aware question navigation

---

## 6. Proposed Database Changes

### No Schema Changes Required

The database schema already supports all required functionality:
- `question_groups` table has all necessary fields
- `instructions` table supports polymorphic instructions
- `passages` table supports shared material
- `questions.group_id` links questions to sections

### Optional Enhancements (Not Required)
1. Add `material_type` enum to `question_groups` for explicit material categorization
2. Add indexes on `question_groups.order_index` for faster ordering queries
3. Add unique constraint on `(exam_id, order_index)` to prevent duplicate ordering

---

## 7. Proposed API Changes

### New/Enhanced Endpoints

#### QuestionGroup Management (API/V1)

**POST /v1/exams/{examId}/question-groups**
- Create a new section
- Body: `{ title, heading_style, numbering_style, instructions, passage_id }`
- Response: QuestionGroup resource

**GET /v1/exams/{examId}/question-groups**
- List all sections for an exam
- Response: Array of QuestionGroup resources with instructions and passage

**PUT /v1/question-groups/{id}**
- Update section
- Body: `{ title, heading_style, numbering_style, instructions, passage_id }`
- Response: Updated QuestionGroup resource

**DELETE /v1/question-groups/{id}**
- Delete section (only if no active attempts)
- Response: 204 No Content

**POST /v1/question-groups/{id}/reorder**
- Update section order
- Body: `{ new_order_index }`
- Response: Updated QuestionGroup resource

#### Question Association

**POST /v1/question-groups/{id}/questions**
- Add questions to a section
- Body: `{ question_ids: number[] }`
- Response: Updated section with questions

**DELETE /v1/question-groups/{id}/questions/{questionId}**
- Remove a question from a section
- Response: 204 No Content

**PUT /v1/question-groups/{id}/questions/reorder**
- Reorder questions within a section
- Body: `{ question_order: number[] }`
- Response: Updated section

#### Standard Exam Enhancement

**GET /v1/exams/{examId}/questions** (Enhanced)
- Add sections to response (currently only for Real Exam)
- Response: `{ questions, sections }`

---

## 8. Backward Compatibility Risks

### Low Risk
- Existing exams without sections will continue to work (sections array will be empty)
- Existing question order via `exam_questions` pivot is preserved
- Exam-level instructions already exist and are backward compatible

### Medium Risk
- Adding sections to standard exam questions endpoint changes response structure
- **Mitigation**: Make sections field optional and additive; clients that ignore it will continue working

### No Breaking Changes Required
- No database migrations needed
- No existing API endpoints need to be removed
- Existing question ordering mechanism remains valid

---

## 9. Implementation Sequence

### Phase 1: Backend Foundation (ofijan-backend)
1. Create API/V1/QuestionGroupController with full CRUD
2. Add question association endpoints
3. Add section reordering endpoints
4. Add authorization middleware (teacher ownership)
5. Add active exam locking (prevent changes after attempts start)
6. Enhance standard exam questions endpoint to include sections
7. Add validation for heading_style and numbering_style
8. Write backend tests

### Phase 2: CMS Teacher Interface (ofijan-cms)
1. Add exam-level instructions field to create/edit forms
2. Implement section creation dialog
3. Implement section list display
4. Implement section editing UI
5. Implement question assignment to sections
6. Implement section reordering
7. Implement shared material editor
8. Add preview mode
9. Write CMS tests

### Phase 3: Student Interface (Online-Examination-System)
1. Add Section types to shared types.ts
2. Implement section rendering in attempt.tsx
3. Implement section instructions display
4. Implement shared material display
5. Implement question range calculation
6. Implement section-aware navigation
7. Handle standalone questions
8. Write student app tests

### Phase 4: Integration & Testing
1. End-to-end test: Create exam with sections in CMS
2. End-to-end test: Verify student sees correct structure
3. End-to-end test: Verify answer persistence across sections
4. End-to-end test: Verify timer behavior
5. Performance testing
6. Security audit (authorization, input validation)

---

## 10. Security Considerations

### Authorization
- Teachers can only manage sections for exams they own
- Students cannot access section management endpoints
- Section IDs must be validated against exam ownership

### Content Security
- Sanitize HTML in instructions and passages
- Validate heading_style and numbering_style against allowed values
- Prevent XSS through rich text content

### Active Exam Protection
- Prevent section modifications after first attempt starts
- Use exam lifecycle status (draft/ready/started) to control edits
- Audit log for section changes

### Data Integrity
- Use database transactions for section/question updates
- Prevent duplicate question associations
- Validate question belongs to exam before assigning to section

---

## 11. Testing Requirements

### Backend Tests
1. Create section with valid heading_style
2. Reject invalid heading_style values
3. Create section with instructions
4. Create section with shared passage
5. Add questions to section
6. Remove questions from section
7. Reorder sections
8. Reorder questions within section
9. Prevent section deletion with active attempts
10. Prevent unauthorized section modifications

### CMS Tests
1. Create exam with instructions
2. Create section with Part heading
3. Create section with Section heading
4. Create section with custom heading
5. Add instructions to section
6. Add passage to section
7. Assign questions to section
8. Reorder sections
9. Preview exam structure
10. Save and reload exam

### Student App Tests
1. Display exam-level instructions
2. Display section headings with correct style
3. Display section instructions
4. Display shared passages
5. Display question ranges
6. Navigate between sections
7. Answer questions in sections
8. Persist answers across navigation
9. Handle standalone questions
10. Refresh and reconnect

---

## 12. Conclusion

The backend infrastructure for exam sections is **largely complete**. The database schema, models, and Real Exam API already support sections with headings, instructions, and shared passages. The main work required is:

1. **Backend**: Create API V1 endpoints for section management and enhance standard exam support
2. **CMS**: Build the teacher UI for creating and managing sections
3. **Student App**: Implement the rendering logic to display sections

No database migrations are required. The implementation can proceed incrementally without breaking existing functionality.
