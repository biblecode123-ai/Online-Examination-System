# Backend patch (draft): expose marks on the staff attempts endpoint

**Status: DRAFT — not applied.** This repo (`Online-Examination-System`) contains only the
frontend. The `ofijan-backend` API is not present here and no shell/deploy access to
`2019api.ofijan.com` exists in this workspace, so the change below is written out for
whoever holds the backend repo. It has **not** been run or tested.

---

## 1. Root cause of the reported scoring behaviour

**The scoring calculation is already correct at grading time.** It uses per-question
points, not a correct-answer count. Verified live against `2019api.ofijan.com`:

`GET /v1/admin/results/368` (exam 11025) originally returned

| field | value |
|---|---|
| `marks_obtained` | 2 |
| `max_marks` | 3 |
| `percentage` | 66.67 |
| `correct_answers` | 1 |
| `total_questions` | 2 |
| question 152101 | `max_points: 1`, `awarded_points: 0` (incorrect) |
| question 152102 | `max_points: 2`, `awarded_points: 2` (correct) |

- Points formula: 2 / 3 × 100 = **66.67%** ← what the API stored
- Correct-count formula: 1 / 2 × 100 = **50%** ← what the spec says not to do

So the stored score matched the points formula: **grading itself does not need
rewriting.**

### 1a. But there ARE three real data-integrity defects

A sweep of **all 397 results** (`GET /v1/admin/results`) found violations of the §7
invariants — "earned must never exceed possible" and "displayed percentage must agree
with the stored marks":

| attempt | symptom | evidence |
|---|---|---|
| 258 | `marks_obtained 74` > `max_marks 45` (45 questions, all 1 pt) | `percentage: 0`, `correct_answers: 0`, yet ~27 of the 45 reviews show `awarded_points: 1` — three fields mutually contradictory |
| 169, 155 | `marks_obtained 4` > `max_marks 2` | review shows 2 questions × 1 pt, both awarded → correct sum is **2**, stored is exactly **2×** = 4. Classic **double-count from repeated grading** |
| 3 | `marks_obtained: 0`, `max_marks: 2`, but `percentage: 78.5` | percentage unrelated to marks or count |
| 353 | `marks_obtained 5 / max_marks 17` (= 29.41%) but `percentage: 27.78` | 27.78 = 5/18 → percentage computed from `correct/total_questions` (5/18), **not** from marks. Spec §1 explicitly forbids this |

**Root causes, in order of severity:**

1. **`max_marks` is recomputed live from the exam's *current* questions, while
   `marks_obtained`/`percentage` are frozen at grading time.** Demonstrated on attempt
   368: question `152669` (1 pt) was added to exam 11025 *after* grading, so
   `max_marks` silently went 3 → 4 while the percentage stayed 66.67. The result now
   reads `2 / 4` with `66.67%`, which no longer agrees with itself. This is spec §5's
   "Define how exam question points are preserved if the original question is edited
   after an attempt starts" — currently **undefined**, hence violated.
2. **Repeated grading adds marks twice** (attempts 169, 155 are exact doublings).
   Spec §5 "prevent duplicate submissions or repeated grading from incorrectly adding
   marks twice" is not enforced.
3. **At least one row still derives percentage from correct ÷ total** (attempt 353),
   the exact formula §1 forbids — so a second, older grading path survives somewhere
   in the backend.

These are backend defects. The frontend now **flags** them rather than displaying
impossible numbers as fact (see §4).

## 2. The actual gap

The staff attempts endpoint used by the exam Results tab omits every mark field:

- `GET /v1/teacher/real-exams/{id}/attempts` returns `score`, `correct_answers`,
  `total_questions`, `started_at`, `submitted_at` — but **no** `marks_obtained`,
  **no** `max_marks`, and no timestamps on the rows we inspected.
- `score` here *is* a percentage (66.67 for 2/3 marks). The current spec forbids
  rendering percentages at all, so this field must **not** be displayed — it is a
  trap for clients, and the UI deliberately ignores it.
- `GET /v1/admin/results*` already returns `marks_obtained`, `max_marks`,
  `grading_status`, `start_time`, `completed_at` — i.e. the data exists, it is just
  not surfaced on the attempts route.

The frontend has been updated to fetch marks from `GET /v1/admin/results?exam_id={id}`
(one request per exam, no N+1) as an interim measure. Removing that workaround is the
point of this patch.

### 2a. Display contract (frontend, already applied)

Per the refined spec, the Results table renders **only** these three columns and no
percentages anywhere:

| Column | Meaning | Source |
|---|---|---|
| Total Marks | the exam's total possible points = Σ question points | `max_marks` |
| Score | `earned / possible` | `marks_obtained` / `max_marks` |
| Correct | `correct / total questions`, independent of points | `correct_answers` / `total_questions` |

The header is labelled **Total Marks** (not "Marks") in both tables —
`src/pages/admin/results.tsx` (system-wide) and `src/pages/admin/exams/results.tsx`
(exam tab).

For the spec's example (10 + 5 + 15 = 30 possible, Q1 and Q3 correct): Marks `30`,
Score `25 / 30`, Correct `2 / 3`. No `83.33%` is shown.

## 3. Proposed change

### 3a. Expose marks on the attempts route

Add the marks/timestamp fields to `ExamAttemptResource`
(`app/Http/Resources/ExamAttemptResource.php`), which backs
`GET /v1/teacher/real-exams/{id}/attempts`:

```php
// read path — the UI renders Marks/Score/Correct from these three only
'marks_obtained' => $attempt->marks_obtained !== null
    ? (float) $attempt->marks_obtained : null,   // earned
'max_marks'      => $attempt->max_marks !== null
    ? (float) $attempt->max_marks : null,        // possible (Σ question points)
'correct_answers'   => $attempt->correct_answers,   // for the Correct column
'total_questions'   => $attempt->total_questions,
'grading_status' => $attempt->grading_status,   // automatic|pending_review|reviewed
'started_at'     => $attempt->start_time ?? $attempt->started_at,
'submitted_at'   => $attempt->completed_at ?? $attempt->end_time,
// optional diagnostic only — NEVER rendered by the UI, and never derived from
// correct_answers/total_questions (that is the §1a-3 defect)
'percentage'     => $attempt->max_marks > 0
    ? round($attempt->marks_obtained / $attempt->max_marks * 100, 2) : null,
```

Requirements:

- **`percentage`, if kept, must derive from marks, never from
  `correct_answers / total_questions`.** The UI does not display it either way.
- `max_marks` must be the **snapshot taken at grading time**, not a live sum of the
  exam's current questions (see B1) — otherwise Score `2 / 4` drifts from the
  `2 / 3` that was true when graded.
- Clamp `marks_obtained` to `[0, max_marks]` so a manual re-grade can never overshoot.
- If the columns live on `exam_attempts` already (the admin results query reads them
  from there), select them explicitly — do not trigger an N+1 per attempt.
- Return `null` (not `0`) for an attempt still being graded, so the UI shows `—`
  instead of a misleading `0 / 0`.

### 3b. Fix the three integrity defects (§1a) — the actual required work

These are the changes that satisfy "correct the underlying scoring calculation".

**B1 — Freeze the denominator at grading time.** Persist `max_marks` (with
`marks_obtained` and `percentage`) as an immutable snapshot on the attempt row when
the attempt is graded. Never derive `max_marks` from the exam's current question list.

```php
// on finalize/grade — write the snapshot; never recompute it later
$attempt->max_marks      = $questions->sum('points');   // snapshot, not a live query
$attempt->marks_obtained = $awarded;                    // clamped to [0, max_marks]
$attempt->percentage     = $attempt->max_marks > 0
    ? round($attempt->marks_obtained / $attempt->max_marks * 100, 2) : null;
$attempt->save();
```

The read path uses only those stored columns, so editing a question after an attempt
starts leaves past attempts untouched (spec §5 final bullet; test case 11).

**B2 — Make grading idempotent.** Attempts 169/155 are stored at exactly 2× the real
sum, so repeated grading added instead of recomputing. Replace additive updates with a
full recomputation from the answer rows, inside a transaction:

```php
DB::transaction(function () use ($attempt) {
    $earned = $attempt->answers->sum(fn ($a) => $a->points ?? 0); // recompute, don't add
    $attempt->marks_obtained = min($max, max(0, $earned));        // clamp
    $attempt->percentage = $max > 0
        ? round($attempt->marks_obtained / $max * 100, 2) : null;
    $attempt->save();
});
```

Guard with a row version/lock so two concurrent grading requests cannot both commit.

**B3 — Remove the surviving correct-count percentage.** Attempt 353 computes 27.78% as
5/18 (correct ÷ total) instead of 5/17 marks — so a second, older grading path still
exists. Locate it:

```bash
rg -n "correct_answers.*total_questions|/ *count\(|COUNT\(.*is_correct" app/
```

Every grading path must derive percentage from `marks_obtained / max_marks`.

**B4 — Enforce the invariant.** Add a CHECK constraint (MySQL 8+/SQLite) so
`marks_obtained <= max_marks` is unrepresentable, plus a test asserting it.

### 3c. Matching questions — storage and grading contract (frontend applied)

The frontend now edits, stores, renders and previews matching questions as two
independent lists (spec §3). The backend must accept, persist and grade this shape.

**Payload sent by the question editor** (`AdminQuestionInput`,
`src/pages/admin/exams/questions.tsx` → `buildPayload`):

```jsonc
"matching_data": {
  "left_items":   [ { "text": "Capital of Ethiopia", "correct_option_id": 1 }, … ],
  "right_options": [ { "text": "Addis Ababa" }, { "text": "Nairobi" }, … ]  // may be longer — distractors
}
```

- `left_items` = **Column A**, `right_options` = **Column B**. Column B may hold
  **more entries than Column A** (distractors); equal sizes are not required.
- `correct_option_id` is a **0-based index into `right_options`** (the editor sends
  `findIndex(...)`), not a database option id. Every left item stores its own
  explicit relationship — correct answers are never inferred from row order.
- The legacy `matching_pairs` (`[{left_item, right_item}]`) plus `answer`
  (JSON map of left→right text) are still sent alongside for backward
  compatibility. New questions must round-trip through `matching_data` on read:
  `GET …/questions/{id}` and the attempt payload must return `matching_data` so the
  student sees both columns.

**Attempt payload (student side):** for an attempt, matching questions must be
returned **without** `correct_option_id` (`null`) so the answer key never reaches
the browser; the admin/teacher preview endpoints must return it.

**Answer format:** the student submits a map of Column A index → Column B index;
the backend stores it against the attempt + question like any other answer.

**Grading:** a fully-correct matching answer earns the question's full `points`;
partial credit policy must be explicit (e.g. `correct_matches / left_items × points`,
rounded consistently) and must never exceed `max_points`. Unanswered → 0 earned,
but the question stays in `max_marks`. A matching question whose answer is saved
but not yet graded must appear with `requires_manual_grading: true` /
`grading_status: pending_review` — never as a silent 0.

**Observed defect (live data):** attempt 368's review contains 3 question records
(one pending matching question) while `total_questions` reports 2 — i.e.
`total_questions` excludes ungraded questions that `max_marks` and the review list
include. The UI now flags this divergence with `!` instead of hiding it. See §3d.

### 3d. Attempt-details API contract (`GET /v1/admin/results/{attempt}`)

The attempt-details page (`src/pages/admin/result-detail.tsx`) renders exclusively
from this response and never recomputes marks. It requires:

| Field | Used for |
|---|---|
| `result.marks_obtained` / `result.max_marks` | Score header `earned / possible` |
| `result.correct_answers`, `wrong_answers`, `skipped_answers`, `total_questions` | summary metrics + Correct `x / y` |
| `result.grading_status` | pending vs final presentation |
| `result.pass_mark`, `passed`, `outcome`, `mode`, `auto_submitted`, timestamps | summary/timeline |
| `question_review[]` | per-question records: `max_points`, `awarded_points`, `requires_manual_grading`, `student_answer.answer_status`, `correct_answer`, `options` |

Contract requirements:

1. **`total_questions` must agree with `question_review`'s length.** If ungraded
   questions are excluded from `total_questions`, they must also be excluded from
   `max_marks` — or both must include them. §5.1: summary and question-level
   records must not contradict each other. The frontend flags (never hides) a
   mismatch, but the flag is a bug report, not the intended UX.
2. **Every question in the attempt appears exactly once in `question_review`** —
   no duplicates (double-counted answers) and no cross-attempt records; keyed by
   `question_id`.
3. **`awarded_points ≤ max_points` per question, and
   `Σ awarded_points == result.marks_obtained`** for a graded attempt.
4. **Outcome filter values** derive from `student_answer.answer_status`
   (`correct` | `incorrect` | `unanswered`) plus `requires_manual_grading` — the
   page offers All / Correct / Incorrect / Unanswered / Pending grading filters
   with live counts, so each record must carry one unambiguous outcome.
5. **Correct answers may be omitted only for unauthorized callers** — admins and
   assigned teachers must receive `correct_answer` and `options[].is_correct` here;
   students must not.
6. **Matching rows must be letterable** — `question_review` carries a matching
   answer only as the JSON `left→right` map (`student_answer.answer_text`,
   `correct_answer.option_text`) with no Column B order, so the review rows cannot
   show the A/B/C letters the student saw. Either populate `options` with Column B
   (ordered) for matching questions or add `matching_data.right_options` to the
   review record. The frontend letters pairs whenever an order is available
   (`formatMatchingAnswer` in `src/lib/format.ts`) and otherwise falls back to
   plain `left → right` text; staff pages currently load the exam's question list
   to recover the order.

## 4. No database migration expected

The admin results endpoint already reads `marks_obtained`, `max_marks`, `percentage`,
`grading_status`, `start_time`, `completed_at` for attempt 368, so these columns are
believed to exist already. Confirm before assuming:

```sql
-- run against the backend DB; expected: no rows if columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exam_attempts'
  AND column_name IN ('marks_obtained','max_marks','percentage');
```

If any column is missing, add it with a nullable migration; do **not** backfill with a
correct-count-derived percentage — recompute from `student_answers.points` instead.

## 5. Tests to run once applied (not run here)

Assertions are on **marks**, not percentages — the UI no longer renders percentages.

1. **Acceptance case (spec §6):** points 10, 5, 15; student correct on Q1 and Q3 →
   Marks `30`, Score `25 / 30`, Correct `2 / 3`. No percentage rendered anywhere.
2. Equal points across questions → Score `earned / possible` still correct (e.g. 3 of 5
   one-point questions → `3 / 5`).
3. Different points → Score follows marks, not the correct count (2/3 marks with 1/2
   correct → `2 / 3`, **not** `1 / 2`).
4. All correct → `marks_obtained == max_marks` (e.g. `30 / 30`), Correct `n / n`.
5. None correct → `0 / max`, Correct `0 / n`.
6. Partial credit (matching, where supported) never exceeds that question's `max_points`.
7. Fill-in-the-blank follows its existing grading rules.
8. Unanswered questions contribute 0 earned but remain in `max_marks`.
9. Essay pending manual grade → `grading_status: pending_review`, Score not final;
   once manually graded, uses the awarded marks.
10. Refresh twice → marks unchanged (no double counting).
11. Question edited after an attempt starts → past attempt's Marks/Score unchanged
    (B1 snapshot).
12. Re-grade by an authorised grader → recalculates (not adds), still clamped.
13. `marks_obtained <= max_marks` on every row (B4 constraint); the UI's `!` flag
    never appears once B1–B4 land.

## 6. Files touched by this draft

| File | Change |
|---|---|
| `BACKEND_PATCH_results_marks.md` (this file) | Draft only — not applied |
| `ofijan-backend/app/Http/Resources/ExamAttemptResource.php` | *(proposed)* add marks/percentage/timestamps |

Frontend (already applied in this repo):

| File | Change |
|---|---|
| `src/pages/admin/exams/results.tsx` | **Total Marks** column, marks-based Score/Correct, role-aware attempt-details link, footnote |
| `src/pages/admin/results.tsx` | **Total Marks** header, clickable student name → attempt details, whitespace-in-`<tr>` fix |
| `src/pages/admin/result-detail.tsx` | marks-based score header, summary metrics, outcome filters + counts, summary/review divergence `!` flag, role-aware back links |
| `src/pages/admin/exams/preview.tsx` | `MatchingPreview` board (Column A/B, distractors, answer-key toggle); legacy placeholder removed |
| `src/pages/admin/exams/questions.tsx` | Matching editor: independent Column A / Column B controls, per-item correct option, `matching_data` payload (§3c) |
| `src/pages/attempt.tsx` | Student matching renderer (Column A/B, legacy `matching_pairs` fallback with key stripped) |
| `src/lib/answerPersistence.ts` | **Fixed invalid `by-synced` compound index** (boolean key → IndexedDB `DataError` on every query; unsynced reads always returned `[]`, so autosave silently never synced) |
| `src/lib/answerSync.ts` | `loadConfig` scope params + config narrowing |
| `src/lib/types.ts` | Legacy `matching_pairs` + `matching_data` fields on shared types |
| `src/App.tsx` | `/teacher/results/:attemptId` route for attempt details |
| `src/index.css` | Filter-chip styles, `marks-flag-mark` style |