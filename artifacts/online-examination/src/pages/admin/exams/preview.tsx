import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, FileText, Timer } from 'lucide-react';
import { adminExamApi } from '../../../lib/endpoints';
import { resolveQuestionImage } from '../../../lib/api';
import { renderRichText } from '../../../lib/richText';
import { EmptyState, ErrorBox, LoadingBlock, PageTitle, Status } from '../../../components/shell';
import { QUESTION_TYPE_LABEL, fmtMinutes, questionTotalMarks } from './logic';
import type { AdminQuestionRow, AdminRealExam } from '../../../lib/types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Instruction text may arrive as a plain string, an array of polymorphic
 * instruction rows (passage/section/group inheritance), or not at all —
 * normalize all shapes to displayable text.
 */
function instructionText(question: AdminQuestionRow): string {
  const rows: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const text =
      typeof value === 'string'
        ? value
        : value && typeof value === 'object' && 'content' in value
          ? String((value as { content?: unknown }).content ?? '')
          : '';
    if (text.trim()) rows.push(text.trim());
  };
  push(question.merged_instructions);
  if (Array.isArray(question.instructions)) question.instructions.forEach((row) => push(row));
  return [...new Set(rows)].join('\n');
}

/** One Column A row of a matching board: the item text plus the index of its
 * correct option in Column B (null while unset). Keyed by index — not text —
 * so the editor's in-progress form state (empty or duplicate texts) still
 * highlights the right option. */
export interface MatchingBoardRow {
  left: string;
  correctRightIndex: number | null;
}

/**
 * §3 — Matching board as students see it: two separate columns, Column B
 * may hold more options than Column A (distractors included). The correct
 * relationships stay hidden until the answer key is toggled — no legacy
 * `↔ ______` placeholder, no preset instruction text.
 *
 * Shared by the exam Preview tab and the question editor's live preview.
 */
export function MatchingBoard({
  rows,
  rightOptions,
  showKey,
  idKey,
}: {
  rows: MatchingBoardRow[];
  rightOptions: string[];
  showKey: boolean;
  idKey: string | number;
}) {
  if (rows.length === 0 || rightOptions.length === 0) {
    return (
      <div className="preview-matching" data-testid={`preview-matching-${idKey}`}>
        <span className="text-muted">No matching items configured</span>
      </div>
    );
  }

  // Answer-key line: letter the correct option with the same A/B/C the
  // Column B list shows, so "→ B. Central processing unit" reads as a letter
  // choice rather than bare text.
  const keyLabel = (correctRightIndex: number | null): string => {
    if (correctRightIndex === null || correctRightIndex < 0) return '—';
    const text = rightOptions[correctRightIndex];
    if (text === undefined) return '—';
    return `${LETTERS[correctRightIndex] ?? correctRightIndex + 1}. ${text}`;
  };

  // Column B rows that are the correct match for some Column A item — tinted
  // only while the answer key is shown (distractors stay plain).
  const keyRightIndexes = new Set(
    showKey
      ? rows
          .map((row) => row.correctRightIndex)
          .filter((index): index is number => index !== null && index >= 0)
      : [],
  );

  return (
    <div
      className="preview-matching"
      style={{
        margin: '0.75rem 0',
        background: 'var(--bg-subtle, #f8fafc)',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
      }}
      data-testid={`preview-matching-${idKey}`}
    >
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <small style={columnLabelStyle}>Column A</small>
          <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
            {rows.map((row, idx) => (
              <li key={`${row.left}-${idx}`} style={{ fontSize: '0.9rem' }}>
                {row.left}
                {showKey && (
                  <strong
                    style={{ color: 'var(--primary, #3b82f6)', marginLeft: '0.5rem' }}
                    data-testid={`preview-match-key-${idKey}-${idx}`}
                  >
                    → {keyLabel(row.correctRightIndex)}
                  </strong>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div style={{ flex: 1 }}>
          <small style={columnLabelStyle}>Column B</small>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '0.4rem 0 0',
              display: 'grid',
              gap: '0.4rem',
            }}
          >
            {rightOptions.map((right, idx) => {
              const isKey = keyRightIndexes.has(idx);
              return (
                <li
                  key={`${right}-${idx}`}
                  style={{
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '2px 8px',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    ...(isKey
                      ? {
                          background: 'var(--brand-primary-light, #eef2ff)',
                          borderColor: 'var(--brand-primary, #594fb6)',
                          fontWeight: 600,
                        }
                      : null),
                  }}
                  data-testid={
                    isKey ? `preview-match-key-option-${idKey}-${idx}` : undefined
                  }
                >
                  <span>
                    {LETTERS[idx] ?? idx + 1}. {right}
                  </span>
                  {isKey && (
                    <em
                      style={{
                        marginLeft: 'auto',
                        fontSize: '0.7rem',
                        fontStyle: 'normal',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--brand-primary, #594fb6)',
                      }}
                    >
                      Key
                    </em>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Preview-tab wrapper: derives the board rows from the staff question row —
 * new `matching_data` format or legacy `matching_pairs`.
 */
function MatchingPreview({
  question,
  showKey,
}: {
  question: AdminQuestionRow;
  showKey: boolean;
}) {
  const { rows, rightOptions } = useMemo(() => {
    const data = question.matching_data;
    if (data?.left_items?.length && data.right_options?.length) {
      const right = data.right_options.map((opt) => opt.text);
      return {
        rightOptions: right,
        rows: data.left_items.map((item) => ({
          left: item.text,
          correctRightIndex: data.right_options.findIndex(
            (opt) => opt.id === item.correct_option_id,
          ),
        })),
      };
    }
    // Legacy pairs: derive both columns from the saved pairs.
    const pairs = question.matching_pairs ?? [];
    const right = [...new Set(pairs.map((pair) => pair.right_item))];
    return {
      rightOptions: right,
      rows: pairs.map((pair) => ({
        left: pair.left_item,
        correctRightIndex: right.indexOf(pair.right_item),
      })),
    };
  }, [question]);

  return (
    <MatchingBoard rows={rows} rightOptions={rightOptions} showKey={showKey} idKey={question.id} />
  );
}

const columnLabelStyle: CSSProperties = {
  fontWeight: 600,
  color: 'var(--text-muted)',
  display: 'block',
  textTransform: 'uppercase',
  fontSize: '0.72rem',
  letterSpacing: '0.04em',
};

/**
 * Admin preview — renders the exact questions/options students will receive
 * (staff-side data only; no student endpoint is called, so nothing is leaked
 * through public APIs). The answer key is hidden by default and can be
 * toggled for verification.
 */
export function PreviewTab({ exam }: { exam: AdminRealExam }) {
  const [showKey, setShowKey] = useState(false);

  const questionsQuery = useQuery({
    queryKey: ['admin-exam-questions', exam.id],
    queryFn: ({ signal }) => adminExamApi.examQuestions(exam.id, signal),
    staleTime: 15_000,
  });

  const questions = useMemo(
    () =>
      [...(questionsQuery.data?.items ?? [])].sort(
        (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0),
      ),
    [questionsQuery.data],
  );
  const totalMarks = questionTotalMarks(questions);

  if (questionsQuery.isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <LoadingBlock label="Loading preview…" />
        </div>
      </div>
    );
  }

  if (questionsQuery.isError) {
    return (
      <div className="card">
        <div className="card-body">
          <ErrorBox error={questionsQuery.error} onRetry={() => void questionsQuery.refetch()} />
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <EmptyState
            icon={<FileText size={26} />}
            title="Nothing to preview"
            description="Add questions first — the preview mirrors them exactly."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="preview-wrap">
      <PageTitle
        eyebrow="STUDENT PREVIEW"
        title={exam.exam_title}
        detail={`${questions.length} question${questions.length === 1 ? '' : 's'} · ${totalMarks} marks · ${fmtMinutes(exam.total_time)} · passing ${exam.passing_percentage ?? '—'}%`}
        action={
          <button
            type="button"
            className={`button ${showKey ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setShowKey((value) => !value)}
            data-testid="button-toggle-answer-key"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            {showKey ? 'Hide answer key' : 'Show answer key'}
          </button>
        }
      />

      <div className="exam-alert" role="status">
        <Timer size={16} />
        <span>
          This is how the exam appears to students. The countdown is enforced by the server —
          students cannot extend their time from the browser.
        </span>
      </div>

      <div className="preview-questions">
        {questions.map((question, index) => {
          const typeLabel = QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type;
          const instructions = instructionText(question);
          const imageSrc = resolveQuestionImage(question.question_image);
          return (
            <article className="preview-question" key={question.id} data-testid={`preview-question-${question.id}`}>
              <header>
                <span className="q-number">{index + 1}</span>
                <div className="q-meta">
                  <Status tone="neutral">{typeLabel}</Status>
                  <small className="text-muted">{question.points ?? 1} mark(s)</small>
                  {question.difficulty && <small className="text-muted">· {question.difficulty}</small>}
                </div>
                <small className="text-muted">Q#{question.id}</small>
              </header>

              {instructions && (
                <div
                  className="question-instructions-banner preview-instructions"
                  data-testid={`preview-instructions-${question.id}`}
                >
                  <strong>Instructions:</strong> {instructions}
                </div>
              )}

              {question.passage && (
                <div className="preview-passage" data-testid={`preview-passage-${question.id}`}>
                  <strong>{question.passage.title || 'Reading passage'}</strong>
                  {/* Passages support markdown-lite (headings, tables, lists,
                      images) — rendered as sanitised HTML, exactly as students
                      see it during an attempt. */}
                  <div
                    className="passage-body passage-rich"
                    dangerouslySetInnerHTML={{ __html: renderRichText(question.passage.content) }}
                  />
                </div>
              )}

              <p className="q-text">{question.question_text}</p>
              {imageSrc && (
                <img src={imageSrc} alt="" className="q-image" loading="lazy" />
              )}

              {question.question_type === 'matching' ? (
                <MatchingPreview question={question} showKey={showKey} />
              ) : (question.options ?? []).length > 0 ? (
                <ul className="q-options">
                  {(question.options ?? []).map((option, optionIndex) => (
                    <li
                      key={option.id}
                      className={showKey && option.is_correct ? 'option-correct' : undefined}
                      data-testid={`preview-option-${option.id}`}
                    >
                      <span className="option-letter">{LETTERS[optionIndex] ?? optionIndex + 1}</span>
                      {option.option_text}
                      {showKey && option.is_correct && <strong className="correct-tag">correct</strong>}
                    </li>
                  ))}
                </ul>
              ) : question.question_type === 'blank' ? (
                <div className="q-textanswer">
                  <span className="option-letter">__</span>
                  <span className="text-muted">Student types the answer</span>
                </div>
              ) : (
                <div className="q-textanswer">
                  <span className="option-letter">¶</span>
                  <span className="text-muted">Student writes a free-text answer</span>
                </div>
              )}

              {showKey && (question.answer || question.explanation) && (
                <div className="q-key">
                  {question.answer && (
                    <p>
                      <strong>Expected answer:</strong> {question.answer}
                    </p>
                  )}
                  {question.explanation && (
                    <p>
                      <strong>Explanation:</strong> {question.explanation}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
