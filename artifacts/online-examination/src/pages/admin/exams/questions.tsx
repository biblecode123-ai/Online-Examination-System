import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Copy,
  Download,
  ListPlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { adminExamApi, type AdminQuestionInput } from '../../../lib/endpoints';
import { ConfirmDialog, ErrorBox, LoadingBlock, NoticeBanner, Status } from '../../../components/shell';
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_LABEL,
  SUPPORTED_QUESTION_TYPES,
  attemptsExist,
  fmtDate,
  questionTotalMarks,
} from './logic';
import type { AdminQuestionRow, AdminRealExam } from '../../../lib/types';

interface OptionDraft {
  text: string;
  correct: boolean;
}

interface QuestionFormState {
  question_text: string;
  question_type: string;
  points: number;
  difficulty: string;
  explanation: string;
  question_image: string;
  answer: string;
  passage_id: string;
  options: OptionDraft[];
}

const EMPTY_FORM: QuestionFormState = {
  question_text: '',
  question_type: 'multiple_choice',
  points: 1,
  difficulty: 'medium',
  explanation: '',
  question_image: '',
  answer: '',
  passage_id: '',
  options: [
    { text: '', correct: true },
    { text: '', correct: false },
  ],
};

function formFromQuestion(q: AdminQuestionRow): QuestionFormState {
  return {
    question_text: q.question_text ?? '',
    question_type: q.question_type ?? 'multiple_choice',
    points: Number(q.points) || 1,
    difficulty: q.difficulty ?? 'medium',
    explanation: q.explanation ?? '',
    question_image: q.question_image ?? '',
    answer: q.answer ?? '',
    passage_id: q.passage_id ? String(q.passage_id) : '',
    options:
      (q.options ?? []).length > 0
        ? q.options!.map((o) => ({ text: o.option_text, correct: Boolean(o.is_correct) }))
        : EMPTY_FORM.options.map((o) => ({ ...o })),
  };
}

/** Translate the form state into the backend's verified store/update payload. */
function toPayload(
  form: QuestionFormState,
  examId: number,
): { payload: AdminQuestionInput; error?: string } {
  const text = form.question_text.trim();
  if (!text) return { payload: {} as AdminQuestionInput, error: 'Question text is required.' };
  const points = Number(form.points);
  if (!Number.isFinite(points) || points <= 0)
    return { payload: {} as AdminQuestionInput, error: 'Points must be greater than zero.' };

  const base: AdminQuestionInput = {
    exam_id: examId,
    question_type: form.question_type,
    question_text: text,
    points,
    difficulty: form.difficulty,
  };
  if (form.explanation.trim()) base.explanation = form.explanation.trim();
  if (form.question_image.trim()) base.question_image = form.question_image.trim();
  if (form.passage_id) base.passage_id = Number(form.passage_id);

  if (form.question_type === 'multiple_choice') {
    const options = form.options.filter((o) => o.text.trim());
    if (options.length < 2)
      return { payload: {} as AdminQuestionInput, error: 'Multiple-choice needs at least two options.' };
    if (!options.some((o) => o.correct))
      return { payload: {} as AdminQuestionInput, error: 'Mark the correct answer.' };
    base.options = options.map((o) => ({
      question_option: o.text.trim(),
      option_text: o.text.trim(),
      option_type: 'mc' as const,
      is_correct: o.correct,
    }));
  } else if (form.question_type === 'true_false') {
    const correct = form.options.find((o) => o.correct);
    if (!correct) return { payload: {} as AdminQuestionInput, error: 'Choose the correct answer (True or False).' };
    base.options = [true, false].map((value) => ({
      question_option: value ? 'True' : 'False',
      option_text: value ? 'True' : 'False',
      option_type: 'tf' as const,
      is_correct: value === (correct.text === 'True'),
    }));
  } else if (form.question_type === 'blank') {
    if (!form.answer.trim())
      return { payload: {} as AdminQuestionInput, error: 'Provide the expected answer text.' };
    base.answer = form.answer.trim();
  }
  // essay: text-only question — no options, no answer key.
  return { payload: base };
}

function QuestionDialog({
  exam,
  editing,
  passages,
  onClose,
}: {
  exam: AdminRealExam;
  editing: AdminQuestionRow | null;
  passages: { id: number; title?: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuestionFormState>(
    editing ? formFromQuestion(editing) : EMPTY_FORM,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exam-detail', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const { payload, error } = toPayload(form, exam.id);
      if (error) return Promise.reject(new Error(error));
      return editing
        ? adminExamApi.updateQuestion(editing.id, payload)
        : adminExamApi.createQuestion(payload);
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const setOption = (index: number, patch: Partial<OptionDraft>, singleCorrect: boolean) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((option, i) => {
        if (i === index) return { ...option, ...patch };
        if (singleCorrect && patch.correct) return { ...option, correct: false };
        return option;
      }),
    }));
  };

  const isOptionsType = form.question_type === 'multiple_choice';
  const isTF = form.question_type === 'true_false';
  const serverErrors = saveMutation.error instanceof Error && 'errors' in saveMutation.error
    ? (saveMutation.error as { errors?: Record<string, string[]> }).errors
    : undefined;

  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label={editing ? 'Edit question' : 'Add question'} data-testid="dialog-question-form">
        <div className="dialog-head">
          <h3>{editing ? `Edit question #${editing.id}` : 'Add a question'}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" data-testid="button-close-question-dialog">
            <X size={16} />
          </button>
        </div>

        <ErrorBox error={saveMutation.error} testId="question-save-error" />
        {clientError && (
          <div className="error-box" role="alert" data-testid="question-client-error">
            {clientError}
          </div>
        )}

        <div className="exam-form-grid">
          <div className="form-group">
            <label htmlFor="q-type">Question type</label>
            <select
              id="q-type"
              className="select"
              value={form.question_type}
              onChange={(e) => setForm({ ...form, question_type: e.target.value })}
              data-testid="select-question-type"
            >
              {SUPPORTED_QUESTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <small className="field-hint">
              Only types the student exam UI can render and grade are offered.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="q-points">Points</label>
            <input
              id="q-points"
              type="number"
              min={1}
              value={form.points}
              onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
              data-testid="input-question-points"
            />
          </div>

          <div className="form-group span-2">
            <label htmlFor="q-text">Question text</label>
            <textarea
              id="q-text"
              rows={3}
              value={form.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              data-testid="textarea-question-text"
            />
          </div>

          <div className="form-group">
            <label htmlFor="q-difficulty">Difficulty</label>
            <select
              id="q-difficulty"
              className="select"
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="q-passage">Reading passage (optional)</label>
            <select
              id="q-passage"
              className="select"
              value={form.passage_id}
              onChange={(e) => setForm({ ...form, passage_id: e.target.value })}
              data-testid="select-question-passage"
            >
              <option value="">No passage</option>
              {passages.map((passage) => (
                <option key={passage.id} value={passage.id}>
                  {passage.title || `Passage #${passage.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group span-2">
            <label htmlFor="q-image">Image URL (optional)</label>
            <input
              id="q-image"
              type="url"
              value={form.question_image}
              onChange={(e) => setForm({ ...form, question_image: e.target.value })}
              placeholder="https://…"
            />
            <small className="field-hint">
              The backend stores an image reference; upload the file through the question-images
              tooling and paste its public URL here.
            </small>
          </div>

          <div className="form-group span-2">
            <label htmlFor="q-explanation">Explanation / solution (optional)</label>
            <textarea
              id="q-explanation"
              rows={2}
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            />
          </div>

          {isOptionsType && (
            <div className="form-group span-2">
              <label>Answer options — pick the correct one</label>
              <div className="options-editor" data-testid="options-editor">
                {form.options.map((option, index) => (
                  <div className="option-line" key={index}>
                    <input
                      type="radio"
                      name="correct-option"
                      checked={option.correct}
                      onChange={() => setOption(index, { correct: true }, true)}
                      aria-label={`Mark option ${index + 1} correct`}
                      data-testid={`radio-correct-${index}`}
                    />
                    <input
                      type="text"
                      value={option.text}
                      placeholder={`Option ${index + 1}`}
                      onChange={(e) => setOption(index, { text: e.target.value }, false)}
                      data-testid={`input-option-${index}`}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove option ${index + 1}`}
                      disabled={form.options.length <= 2}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          options: prev.options.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      options: [...prev.options, { text: '', correct: false }],
                    }))
                  }
                  data-testid="button-add-option"
                >
                  <Plus size={14} /> Add option
                </button>
              </div>
            </div>
          )}

          {isTF && (
            <div className="form-group span-2">
              <label>Correct answer</label>
              <div className="options-editor">
                {['True', 'False'].map((value) => {
                  const current = form.options.find((o) => o.text === value);
                  return (
                    <label key={value} className="checkbox-line">
                      <input
                        type="radio"
                        name="tf-correct"
                        checked={Boolean(current?.correct)}
                        onChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            options: ['True', 'False'].map((v) => ({
                              text: v,
                              correct: v === value,
                            })),
                          }))
                        }
                      />
                      {value}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {form.question_type === 'blank' && (
            <div className="form-group span-2">
              <label htmlFor="q-answer">Expected answer</label>
              <input
                id="q-answer"
                type="text"
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                data-testid="input-question-answer"
              />
            </div>
          )}
        </div>

        {serverErrors && Object.keys(serverErrors).length > 0 && (
          <ul className="blocker-list" data-testid="question-server-errors">
            {Object.entries(serverErrors).flatMap(([field, messages]) =>
              messages.map((message) => (
                <li key={`${field}:${message}`}>
                  <strong>{field}</strong> — {message}
                </li>
              )),
            )}
          </ul>
        )}

        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={saveMutation.isPending}
            onClick={() => {
              const { error } = toPayload(form, exam.id);
              setClientError(error ?? null);
              if (!error) saveMutation.mutate();
            }}
            data-testid="button-save-question"
          >
            <Save size={15} /> {saveMutation.isPending ? 'Saving…' : editing ? 'Save question' : 'Add question'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog({
  exam,
  onClose,
}: {
  exam: AdminRealExam;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return Promise.reject(new Error('The pasted text is not valid JSON.'));
      }
      if (!Array.isArray(parsed))
        return Promise.reject(new Error('Expected a JSON array of question objects.'));

      const problems: string[] = [];
      const payloads: AdminQuestionInput[] = [];
      parsed.forEach((item, index) => {
        const n = index + 1;
        const row = item as Record<string, unknown>;
        if (!row || typeof row !== 'object') {
          problems.push(`Question ${n}: not an object.`);
          return;
        }
        if (typeof row.question_text !== 'string' || !row.question_text.trim()) {
          problems.push(`Question ${n}: "question_text" is required.`);
          return;
        }
        const type = typeof row.question_type === 'string' ? row.question_type : 'multiple_choice';
        if (!SUPPORTED_QUESTION_TYPES.some((t) => t.value === type)) {
          problems.push(`Question ${n}: unsupported question_type "${type}".`);
          return;
        }
        const payload: AdminQuestionInput = {
          exam_id: exam.id,
          question_type: type,
          question_text: String(row.question_text).trim(),
          points: Number(row.points) > 0 ? Number(row.points) : 1,
          difficulty: typeof row.difficulty === 'string' ? row.difficulty : 'medium',
        };
        if (typeof row.explanation === 'string') payload.explanation = row.explanation;
        if (type === 'multiple_choice') {
          const options = Array.isArray(row.options) ? (row.options as Record<string, unknown>[]) : [];
          const valid = options.filter((o) => typeof o?.option_text === 'string' && o.option_text.trim());
          if (valid.length < 2) {
            problems.push(`Question ${n}: multiple choice needs at least two options with "option_text".`);
            return;
          }
          if (!valid.some((o) => o.is_correct)) {
            problems.push(`Question ${n}: mark one option with "is_correct": true.`);
            return;
          }
          payload.options = valid.map((o) => ({
            question_option: String(o.option_text).trim(),
            option_text: String(o.option_text).trim(),
            option_type: 'mc' as const,
            is_correct: Boolean(o.is_correct),
          }));
        }
        if (type === 'blank' && typeof row.answer === 'string' && row.answer.trim()) {
          payload.answer = row.answer.trim();
        }
        payloads.push(payload);
      });

      if (problems.length > 0) {
        return Promise.reject(
          Object.assign(new Error(`${problems.length} question(s) need fixes — nothing was imported.`), {
            errors: { import: problems },
          }),
        );
      }
      return adminExamApi.bulkCreateQuestions(payloads);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', exam.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-exam-detail', exam.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      onClose();
    },
  });

  return (
    <div className="dialog-scrim" role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Import questions from JSON" data-testid="dialog-import">
        <div className="dialog-head">
          <h3>Import questions from JSON</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="dialog-message">
          Paste an array of question objects, for example:{' '}
          <code>
            {`[{"question_text": "…", "question_type": "multiple_choice", "points": 5, "difficulty": "medium", "options": [{"option_text": "A", "is_correct": true}]}]`}
          </code>
          . Everything is validated first; if any question is invalid, nothing is imported.
        </p>
        <textarea
          rows={10}
          className="code-textarea"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setParseError(null);
          }}
          spellCheck={false}
          data-testid="textarea-import"
        />
        <ErrorBox error={parseError ? new Error(parseError) : importMutation.error} testId="import-error" />
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={importMutation.isPending || !raw.trim()}
            onClick={() => importMutation.mutate()}
            data-testid="button-run-import"
          >
            <Upload size={15} /> {importMutation.isPending ? 'Importing…' : 'Validate & import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuestionsTab({ exam }: { exam: AdminRealExam }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ kind: 'add' | 'edit'; question?: AdminQuestionRow } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminQuestionRow | null>(null);
  const [passagesOpen, setPassagesOpen] = useState(false);

  const locked = attemptsExist(exam);
  const structureLocked = Boolean(exam.started_at && exam.started_at !== 'null');

  const questionsQuery = useQuery({
    queryKey: ['admin-exam-questions', exam.id],
    queryFn: ({ signal }) => adminExamApi.examQuestions(exam.id, signal),
    staleTime: 15_000,
  });
  const passagesQuery = useQuery({
    queryKey: ['admin-passages'],
    queryFn: ({ signal }) => adminExamApi.passages(signal),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exam-detail', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminExamApi.deleteQuestion(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) => adminExamApi.updateExam(exam.id, { question_ids: orderedIds }),
    onSuccess: invalidate,
  });

  const duplicateMutation = useMutation({
    mutationFn: (question: AdminQuestionRow) => {
      const { payload } = toPayload(formFromQuestion(question), exam.id);
      payload.question_text = `${question.question_text} (copy)`;
      return adminExamApi.createQuestion(payload);
    },
    onSuccess: invalidate,
  });

  const questions = useMemo(
    () =>
      [...(questionsQuery.data?.items ?? [])].sort(
        (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0),
      ),
    [questionsQuery.data],
  );
  const totalMarks = questionTotalMarks(questions);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((q) => q.id));
  };

  return (
    <div className="card">
      <div className="card-header questions-head">
        <div>
          <h2>Questions</h2>
          <small className="text-muted" data-testid="questions-summary">
            {questions.length} question{questions.length === 1 ? '' : 's'} · {totalMarks} total
            marks
          </small>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="button button-quiet button-sm"
            onClick={() => setPassagesOpen((value) => !value)}
            data-testid="button-toggle-passages"
          >
            <BookOpen size={14} /> Passages
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setImportOpen(true)}
            data-testid="button-import-questions"
          >
            <Download size={15} /> Import JSON
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setDialog({ kind: 'add' })}
            data-testid="button-add-question"
          >
            <Plus size={16} /> Add question
          </button>
        </div>
      </div>

      {passagesOpen && (
        <div className="card-body passages-panel">
          <h3>Reading passages</h3>
          <p className="text-muted">
            Passages are shared reading material; attach them to questions through the question
            form.
          </p>
          {passagesQuery.isLoading ? (
            <LoadingBlock label="Loading passages…" />
          ) : (passagesQuery.data ?? []).length === 0 ? (
            <small className="text-muted">No passages yet.</small>
          ) : (
            <ul className="passage-list" data-testid="list-passages">
              {(passagesQuery.data ?? []).map((passage) => (
                <li key={passage.id}>
                  <strong>{passage.title || `Passage #${passage.id}`}</strong>
                  <small>{(passage.content ?? '').slice(0, 140)}…</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card-body">
        {locked && (
          <NoticeBanner>
            Attempt history exists — questions are protected from editing, reordering and deletion.
          </NoticeBanner>
        )}
        <ErrorBox
          error={questionsQuery.error}
          onRetry={() => void questionsQuery.refetch()}
          testId="questions-error"
        />
        {reorderMutation.isError && <ErrorBox error={reorderMutation.error} testId="reorder-error" />}

        {questionsQuery.isLoading ? (
          <LoadingBlock label="Loading questions…" />
        ) : questions.length === 0 ? (
          <div className="empty-state">
            <ListPlus size={26} />
            <h3>No questions yet</h3>
            <p>Add the first question or import a JSON set to build this exam.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table" data-testid="table-questions">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th className="num">Marks</th>
                  <th>Difficulty</th>
                  <th>Passage</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question, index) => (
                  <tr key={question.id} data-testid={`row-question-${question.id}`}>
                    <td className="num">{index + 1}</td>
                    <td className="question-cell">
                      <span>{question.question_text}</span>
                      {question.options && question.options.length > 0 && (
                        <small className="row-subtext">
                          {question.options.length} option{question.options.length === 1 ? '' : 's'}
                        </small>
                      )}
                    </td>
                    <td>{QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}</td>
                    <td className="num">{question.points ?? '—'}</td>
                    <td>
                      <Status
                        tone={
                          question.difficulty === 'easy'
                            ? 'green'
                            : question.difficulty === 'hard'
                              ? 'red'
                              : 'amber'
                        }
                      >
                        {question.difficulty ?? '—'}
                      </Status>
                    </td>
                    <td>{question.passage?.title || (question.passage_id ? `#${question.passage_id}` : '—')}</td>
                    <td>{fmtDate(question.updated_at)}</td>
                    <td>
                      <div className="button-group">
                        <button
                          type="button"
                          className="icon-button"
                          title="Move up"
                          disabled={index === 0 || structureLocked || reorderMutation.isPending}
                          onClick={() => move(index, -1)}
                          data-testid={`button-question-up-${question.id}`}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Move down"
                          disabled={index === questions.length - 1 || structureLocked || reorderMutation.isPending}
                          onClick={() => move(index, 1)}
                          data-testid={`button-question-down-${question.id}`}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Edit question"
                          disabled={locked}
                          onClick={() => setDialog({ kind: 'edit', question })}
                          data-testid={`button-question-edit-${question.id}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Duplicate question"
                          disabled={locked || duplicateMutation.isPending}
                          onClick={() => duplicateMutation.mutate(question)}
                          data-testid={`button-question-duplicate-${question.id}`}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-danger"
                          title="Delete question"
                          disabled={locked}
                          onClick={() => setDeleting(question)}
                          data-testid={`button-question-delete-${question.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog && (
        <QuestionDialog
          exam={exam}
          editing={dialog.kind === 'edit' ? (dialog.question ?? null) : null}
          passages={passagesQuery.data ?? []}
          onClose={() => setDialog(null)}
        />
      )}
      {importOpen && <ImportDialog exam={exam} onClose={() => setImportOpen(false)} />}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this question?"
        message={
          <>
            <strong>{deleting?.question_text}</strong> will be removed from the exam. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete question"
        tone="danger"
        busy={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        testId="dialog-delete-question"
      />
    </div>
  );
}
