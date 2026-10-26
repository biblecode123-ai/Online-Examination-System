# Backend patch (draft): expose marks on the staff attempts endpoint

**Status: DRAFT — not applied.** This repo (`Online-Examination-System`) contains only the
frontend. The `ofijan-backend` API is not present here and no shell/deploy access to
`2019api.ofijan.com` exists in this workspace, so the change below is written out for
whoever holds the backend repo. It has **not** been run or tested.

---

## 1. Root cause of the reported scoring behaviour

**The scoring calculation is already correct.** It already uses per-question points,
not a correct-answer count. Verified live against `2019api.ofijan.com`:

`GET /v1/admin/results/368` (exam 11025) returns

| field | value |
|---|---|
| `marks_obtained` | 2 |
| `max_marks` | 3 |
| `percentage` | 66.67 |
| `correct_answers` | 1 |
| `total_questions` | 2 |
| question 152101 | `max_points: 1`, `awarded_points: 0` (incorrect) |
| question 152102 | `max_points: 2`, `awarded_points: 2` (correct) |

- Points formula: 2 / 3 × 100 = **66.67%** ← what the API stores
- Correct-count formula: 1 / 2 × 100 = **50%** ← what the spec says not to do

The stored score matches the points formula, so the backend does **not** compute
percentage as correct ÷ total. **No change to grading logic is required.**

## 2. The actual gap

The staff attempts endpoint used by the exam Results tab omits every mark field:

- `GET /v1/teacher/real-exams/{id}/attempts` returns `score`, `correct_answers`,
  `total_questions`, `started_at`, `submitted_at` — but **no** `marks_obtained`,
  **no** `max_marks`, **no** `percentage`, and no timestamps on the rows we inspected.
- `score` here *is* the percentage (66.67 for 2/3 marks) but is returned without a
  `percentage` key, so clients cannot label it safely.
- `GET /v1/admin/results*` already returns `marks_obtained`, `max_marks`,
  `percentage`, `grading_status`, `start_time`, `completed_at` — i.e. the data
  exists, it is just not surfaced on the attempts route.

The frontend has been updated to fetch marks from `GET /v1/admin/results?exam_id={id}`
(one request per exam, no N+1) as an interim measure. Removing that workaround is the
point of this patch.

## 3. Proposed change

Add the marks/percentage/timestamp fields to `ExamAttemptResource`
(`app/Http/Resources/ExamAttemptResource.php`), which backs
`GET /v1/teacher/real-exams/{id}/attempts`:

```php
'marks_obtained' => (float) ($attempt->marks_obtained ?? 0),
'max_marks'      => (float) ($attempt->max_marks ?? 0),
'percentage'     => $attempt->percentage !== null
    ? (float) $attempt->percentage
    : ($attempt->max_marks > 0
        ? round(($attempt->marks_obtained / $attempt->max_marks) * 100, 2)
        : null),
'started_at'     => $attempt->start_time ?? $attempt->started_at,
'submitted_at'   => $attempt->completed_at ?? $attempt->end_time,
```

Requirements:

- **Percentage must be derived from marks, never from `correct_answers / total_questions`.**
- Clamp `marks_obtained` to `[0, max_marks]` so a manual re-grade can never overshoot.
- If the columns live on `exam_attempts` already (the admin results query reads them
  from there), select them explicitly — do not trigger an N+1 per attempt.
- Return `null` (not `0`) for an attempt still being graded, so the UI shows `—`
  instead of a misleading `0 / 0`.

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

1. Equal points across questions → percentage = correct/total only when points are equal.
2. Different points → percentage follows marks (case above: 2/3 = 66.67, not 1/2 = 50).
3. All correct → 100%, `marks_obtained == max_marks`.
4. None correct → 0%.
5. Partial credit (matching, where supported) never exceeds that question's `max_points`.
6. Unanswered questions contribute 0 earned but remain in `max_marks`.
7. Essay pending manual grade → `grading_status: pending_review`, percentage not final.
8. Refresh twice → marks unchanged (no double counting).
9. Re-grade by an authorised grader → recalculates, still clamped to `max_marks`.
10. `marks_obtained <= max_marks` holds on every row; displayed % equals stored marks.

## 6. Files touched by this draft

| File | Change |
|---|---|
| `BACKEND_PATCH_results_marks.md` (this file) | Draft only — not applied |
| `ofijan-backend/app/Http/Resources/ExamAttemptResource.php` | *(proposed)* add marks/percentage/timestamps |

Frontend (already applied in this repo):
`src/pages/admin/exams/results.tsx` — Marks column, `%` labelling, timestamps and
grading status, enriched from `GET /v1/admin/results?exam_id={id}`.