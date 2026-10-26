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
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { adminExamApi, type AdminQuestionInput } from '../../../lib/endpoints';
import { resolveQuestionImage } from '../../../lib/api';
import { ConfirmDialog, ErrorBox, LoadingBlock, NoticeBanner, Status } from '../../../components/shell';
import { RichTextEditor } from '../../../components/rich-text-editor';
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

interface MatchingPairDraft {
  left: string;
  right: string;
}

interface QuestionFormState {
  question_text: string;
  question_type: string;
  points: number;
  question_image: string;
  answer: string;
  passage_id: string;
  instructions: string;
  options: OptionDraft[];
  matching_pairs: MatchingPairDraft[];
  multiple_correct?: boolean;
}

export const SIMULATION_EXAMPLES = [
  {
    code: 'A',
    label: 'Ex A: MCQ Single Correct (ATP) — 2 pts',
    state: {
      question_text: 'What is the primary function of adenosine triphosphate (ATP) in cellular processes?',
      question_type: 'multiple_choice',
      points: 2,
      difficulty: 'medium',
      instructions: 'Select the single best answer.',
      explanation: 'ATP serves as the primary and direct molecular energy currency for cellular work and biochemical reactions.',
      question_image: '',
      answer: '',
      passage_id: '',
          options: [
        { text: 'Long-term storage of genetic information', correct: false },
        { text: 'Direct energy currency for biochemical reactions and cellular work', correct: true },
        { text: 'Structural component forming the lipid bilayer of cell membranes', correct: false },
        { text: 'Enzymatic catalyst for the synthesis of complex fatty acids', correct: false },
      ],
      matching_pairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    },
  },
  {
    code: 'B',
    label: 'Ex B: MCQ Multi-Correct (Blood) — 5 pts',
    state: {
      question_text: 'Which of the following are primary formed elements (cellular components) of human blood? (Select all that apply)',
      question_type: 'multiple_choice',
      points: 5,
      difficulty: 'hard',
      instructions: 'Select all correct answers.',
      explanation: 'Erythrocytes (red blood cells), leukocytes (white blood cells), and thrombocytes (platelets) constitute the formed elements of blood. Chondrocytes are cartilage cells.',
      question_image: '',
      answer: '',
      passage_id: '',
      multiple_correct: true,
      options: [
        { text: 'Erythrocytes (red blood cells)', correct: true },
        { text: 'Leukocytes (white blood cells)', correct: true },
        { text: 'Thrombocytes (platelets)', correct: true },
        { text: 'Chondrocytes (cartilage cells)', correct: false },
      ],
      matching_pairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    },
  },
  {
    code: 'C',
    label: 'Ex C: True/False (Heart) — 1 pt',
    state: {
      question_text: 'The human heart typically consists of four distinct muscular chambers: two upper atria and two lower ventricles.',
      question_type: 'true_false',
      points: 1,
      difficulty: 'easy',
      instructions: 'Indicate whether the statement is True or False.',
      explanation: 'The mammalian heart has four distinct chambers: right atrium, left atrium, right ventricle, and left ventricle.',
      question_image: '',
      answer: '',
      passage_id: '',
          options: [
        { text: 'True', correct: true },
        { text: 'False', correct: false },
      ],
      matching_pairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    },
  },
  {
    code: 'D',
    label: 'Ex D: Matching (Organelles) — 8 pts',
    state: {
      question_text: 'Match each cellular organelle with its primary biological function:',
      question_type: 'matching',
      points: 8,
      difficulty: 'medium',
      instructions: 'Match each organelle on the left with its corresponding biological function on the right.',
      explanation: 'Mitochondria generate ATP via oxidative phosphorylation, ribosomes synthesize polypeptides, and chloroplasts carry out photosynthesis in plant cells.',
      question_image: '',
      answer: '',
      passage_id: '',
          options: [],
      matching_pairs: [
        { left: 'Mitochondria', right: 'Energy production (ATP synthesis)' },
        { left: 'Ribosomes', right: 'Protein synthesis (translation)' },
        { left: 'Chloroplasts', right: 'Photosynthesis (light energy conversion)' },
      ],
    },
  },
  {
    code: 'E',
    label: 'Ex E: Fill-in-Blank (Cell) — 3 pts',
    state: {
      question_text: 'The fundamental structural and functional unit of all known living organisms is the ________.',
      question_type: 'blank',
      points: 3,
      difficulty: 'easy',
      instructions: 'Fill in the blank with the appropriate single biological term.',
      explanation: 'According to modern cell theory, the cell is the basic structural and functional unit of all living organisms.',
      question_image: '',
      answer: 'cell',
      passage_id: '',
          options: [],
      matching_pairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    },
  },
  {
    code: 'F',
    label: 'Ex F: Essay (Cardiovascular Pathway) — 10 pts',
    state: {
      question_text: 'Explain the systemic pathway of blood through the human cardiovascular system, contrasting oxygenated and deoxygenated blood flow from the left ventricle through return to the right atrium.',
      question_type: 'essay',
      points: 10,
      difficulty: 'hard',
      instructions: 'Detail the major chambers, vascular circuits, systemic capillary exchange, and blood oxygenation stages.',
      explanation: 'Scoring Rubric (10 pts total): (1) Left ventricle contraction and aortic ejection (2 pts); (2) Systemic capillary bed gas and nutrient exchange (3 pts); (3) Venous collection into superior/inferior vena cava (3 pts); (4) Deoxygenated return into right atrium (2 pts).',
      question_image: '',
      answer: '',
      passage_id: '',
          options: [],
      matching_pairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    },
  },
];

const EMPTY_FORM: QuestionFormState = {
  question_text: '',
  question_type: 'multiple_choice',
  points: 1,
  question_image: '',
  answer: '',
  passage_id: '',
  instructions: '',
  options: [
    { text: '', correct: true },
    { text: '', correct: false },
  ],
  matching_pairs: [
    { left: '', right: '' },
    { left: '', right: '' },
  ],
};

/**
 * Question-level instruction text for the edit form.
 *
 * The list endpoint returns `instructions` (the question's own rows), while the
 * single-question GET returns `merged_instructions` (question + passage + section
 * rows). Only the question's own rows are shown here so editing a question never
 * rewrites the passage's instructions.
 */
function questionInstructionText(q: AdminQuestionRow): string {
  const source: unknown[] = Array.isArray(q.instructions)
    ? q.instructions
    : Array.isArray(q.merged_instructions)
      ? q.merged_instructions
      : [];
  const isOwn = (row: unknown) => {
    const ctx = String((row as { context_type?: unknown } | null)?.context_type ?? '');
    const type = String((row as { type?: unknown } | null)?.type ?? '');
    return ctx.endsWith('Question') || type === 'question';
  };
  const text = source
    .filter(isOwn)
    .map((row) => String((row as { content?: unknown }).content ?? '').trim())
    .filter(Boolean)
    .join('\n');
  if (text) return text;
  return typeof q.merged_instructions === 'string' ? q.merged_instructions : '';
}

function formFromQuestion(q: AdminQuestionRow): QuestionFormState {
  const instructions = questionInstructionText(q);

  let matchingPairs: MatchingPairDraft[] = [];
  if (q.matching_pairs && q.matching_pairs.length > 0) {
    matchingPairs = q.matching_pairs.map((mp) => ({ left: mp.left_item, right: mp.right_item }));
  } else if (q.question_type === 'matching' && q.answer) {
    try {
      const parsed = JSON.parse(q.answer);
      if (parsed && typeof parsed === 'object') {
        matchingPairs = Object.entries(parsed).map(([left, right]) => ({
          left,
          right: String(right),
        }));
      }
    } catch {
      // ignore
    }
  }
  if (matchingPairs.length < 2) {
    matchingPairs = [
      { left: '', right: '' },
      { left: '', right: '' },
    ];
  }

  const options =
    (q.options ?? []).length > 0
      ? q.options!.map((o) => ({ text: o.option_text, correct: Boolean(o.is_correct) }))
      : EMPTY_FORM.options.map((o) => ({ ...o }));

  const correctCount = options.filter((o) => o.correct).length;

  return {
    question_text: q.question_text ?? '',
    question_type: q.question_type ?? 'multiple_choice',
    points: Math.max(1, Math.round(Number(q.points) || 1)),
    question_image: q.question_image ?? '',
    answer: q.answer ?? '',
    passage_id: q.passage_id ? String(q.passage_id) : '',
    instructions: instructions ?? '',
    options,
    matching_pairs: matchingPairs,
  };
}

/** Translate the form state into the backend's verified store/update payload.
 *
 * `examId` is only passed on create: the backend throws a 500 when exam_id is
 * echoed back on update (verified against the live API), and the dialog never
 * moves a question between exams anyway. On update an empty passage must be
 * sent as an explicit `null` — omitting the field keeps the old passage.
 */
function toPayload(
  form: QuestionFormState,
  examId: number | null,
): { payload: AdminQuestionInput; error?: string } {
  const text = form.question_text.trim();
  if (form.question_type !== 'matching' && !text)
    return { payload: {} as AdminQuestionInput, error: 'Question text is required.' };
  const points = Number(form.points);
  if (!Number.isFinite(points) || points <= 0 || !Number.isInteger(points))
    return { payload: {} as AdminQuestionInput, error: 'Maximum points must be an integer greater than zero.' };

  const base: AdminQuestionInput = {
    question_type: form.question_type,
    question_text: text,
    points,
  };
  if (examId !== null) base.exam_id = examId;
  // `instructions` is deliberately NOT part of this payload: the backend
  // ignores it silently (verified live). Instructions are synced through
  // /v1/instructions after the question saves — see syncQuestionInstructions.
  if (form.question_image.trim()) base.question_image = form.question_image.trim();
  if (form.passage_id) base.passage_id = Number(form.passage_id);
  else if (examId === null) base.passage_id = null;

  if (form.question_type === 'multiple_choice') {
    const options = form.options.filter((o) => o.text.trim());
    if (options.length < 2)
      return { payload: {} as AdminQuestionInput, error: 'Multiple-choice needs at least two options.' };
    const correctCount = options.filter((o) => o.correct).length;
    if (correctCount !== 1)
      return { payload: {} as AdminQuestionInput, error: 'Mark exactly one correct answer option.' };
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
  } else if (form.question_type === 'matching') {
    const validPairs = form.matching_pairs.filter((p) => p.left.trim() && p.right.trim());
    if (validPairs.length < 2) {
      return {
        payload: {} as AdminQuestionInput,
        error: 'Matching questions require at least two complete pairs (Left and Right items).',
      };
    }
    base.matching_pairs = validPairs.map((p) => ({
      left_item: p.left.trim(),
      right_item: p.right.trim(),
    }));
    const pairsMap: Record<string, string> = {};
    validPairs.forEach((p) => {
      pairsMap[p.left.trim()] = p.right.trim();
    });
    base.answer = JSON.stringify(pairsMap);
  } else if (form.question_type === 'blank') {
    if (!form.answer.trim())
      return { payload: {} as AdminQuestionInput, error: 'Provide the expected answer text.' };
    base.answer = form.answer.trim();
  }
  // essay: text-only question — no options, no answer key.
  return { payload: base };
}

/**
 * Keep the question's instruction row in step with the dialog's instructions box.
 *
 * The backend ignores `instructions` on POST/PUT /v1/questions, so the text is
 * written to the polymorphic /v1/instructions resource instead: create when the
 * box gains text, PUT when it changes, DELETE when it is cleared. The previous
 * row is read off the edited list row (`instructions`).
 */
async function syncQuestionInstructions(
  questionId: number | null,
  value: string,
  editing: AdminQuestionRow | null,
): Promise<void> {
  const content = value.trim();
  const existing = (editing?.instructions ?? []).find((row) => {
    const context = String(row.context_type ?? '');
    return !context || context.endsWith('Question');
  });

  if (!content) {
    if (existing) await adminExamApi.deleteQuestionInstruction(existing.id);
    return;
  }
  if (!questionId) return;
  if (!existing) await adminExamApi.createQuestionInstruction(questionId, content);
  else if (existing.content !== content)
    await adminExamApi.updateQuestionInstruction(existing.id, content);
}

function QuestionDialog({
  exam,
  editing,
  passages,
  onClose,
}: {
  exam: AdminRealExam;
  editing: AdminQuestionRow | null;
  passages: { id: number; title?: string | null; content?: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuestionFormState>(
    editing ? formFromQuestion(editing) : EMPTY_FORM,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  // Passage attachment is opt-in: the checkbox gates the whole passage UI,
  // and unchecking it drops any previously assigned passage.
  const [usePassage, setUsePassage] = useState(Boolean(form.passage_id));
  const [passageSearch, setPassageSearch] = useState('');
  const [newPassage, setNewPassage] = useState({ title: '', content: '' });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exam-detail', exam.id] });
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { payload, error } = toPayload(form, editing ? null : exam.id);
      if (error) throw new Error(error);
      const saved = editing
        ? await adminExamApi.updateQuestion(editing.id, payload)
        : await adminExamApi.createQuestion(payload);
      await syncQuestionInstructions(saved.id ?? editing?.id ?? null, form.instructions, editing);
      return saved;
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const createPassageMutation = useMutation({
    mutationFn: () => {
      const title = newPassage.title.trim();
      const content = newPassage.content.trim();
      if (!content) return Promise.reject(new Error('Write the passage text before saving.'));
      return adminExamApi.createPassage(title ? { title, content } : { content });
    },
    onSuccess: (passage) => {
      queryClient.invalidateQueries({ queryKey: ['admin-passages'] });
      setForm((prev) => ({ ...prev, passage_id: String(passage.id) }));
      setNewPassage({ title: '', content: '' });
      setPassageSearch('');
      setClientError(null);
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

  const handleTypeChange = (newType: string) => {
    if (newType === form.question_type) return;
    const hasOptions = form.options.some((o) => o.text.trim());
    const hasPairs = form.matching_pairs.some((p) => p.left.trim() || p.right.trim());
    const hasBlank = Boolean(form.answer.trim());
    if ((hasOptions || hasPairs || hasBlank) && editing) {
      if (
        !window.confirm(
          `Switching question type to "${QUESTION_TYPE_LABEL[newType] ?? newType}" will replace incompatible answer configuration. Proceed?`,
        )
      ) {
        return;
      }
    }
    setForm((prev) => ({
      ...prev,
      question_type: newType,
      options:
        newType === 'multiple_choice' && prev.options.length === 0
          ? [
              { text: '', correct: true },
              { text: '', correct: false },
            ]
          : prev.options,
      matching_pairs:
        newType === 'matching' && prev.matching_pairs.length === 0
          ? [
              { left: '', right: '' },
              { left: '', right: '' },
            ]
          : prev.matching_pairs,
    }));
  };

  const isOptionsType = form.question_type === 'multiple_choice';
  const isTF = form.question_type === 'true_false';
  const isMatching = form.question_type === 'matching';
  const isBlank = form.question_type === 'blank';
  const isEssay = form.question_type === 'essay';
  // Shared media (reading passage + image) is only offered for types where it
  // reads naturally — matching and blank questions are pair/text exercises.
  // Any values already set are preserved in state and sent with the payload.
  const showSharedMedia = !isMatching && !isBlank;

  // Searchable passage picker: filter by title or content, capped for perf.
  const filteredPassages = useMemo(() => {
    const query = passageSearch.trim().toLowerCase();
    if (!query) return passages.slice(0, 40);
    return passages
      .filter(
        (passage) =>
          (passage.title ?? '').toLowerCase().includes(query) ||
          (passage.content ?? '').toLowerCase().includes(query),
      )
      .slice(0, 40);
  }, [passages, passageSearch]);

  const attachedPassage = passages.find((passage) => String(passage.id) === form.passage_id);
  // Existing questions return a storage-relative path; freshly picked files are data URLs.
  const imagePreviewSrc = resolveQuestionImage(form.question_image);

  const serverErrors =
    saveMutation.error instanceof Error && 'errors' in saveMutation.error
      ? (saveMutation.error as { errors?: Record<string, string[]> }).errors
      : undefined;

  return (
    <div className="dialog-scrim" role="presentation">
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit question' : 'Add question'}
        data-testid="dialog-question-form"
      >
        <div className="dialog-head">
          <h3>{editing ? `Edit question #${editing.id}` : 'Add a question'}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
            data-testid="button-close-question-dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="dialog-body">
          {/* ─── Simulation Examples Quick Loader ─── */}
          <div
            style={{
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
            data-testid="simulation-examples-loader"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={16} style={{ color: 'var(--primary, #3b82f6)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Load Simulation Example:</span>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {SIMULATION_EXAMPLES.map((ex) => (
                <button
                  key={ex.code}
                  type="button"
                  className="button button-secondary button-sm"
                  title={ex.label}
                  onClick={() => {
                    setForm({
                      ...EMPTY_FORM,
                      ...ex.state,
                    });
                    setUsePassage(false);
                    setClientError(null);
                  }}
                  data-testid={`button-load-example-${ex.code.toLowerCase()}`}
                >
                  Ex {ex.code} ({ex.state.points}pt)
                </button>
              ))}
            </div>
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
                onChange={(e) => handleTypeChange(e.target.value)}
                data-testid="select-question-type"
              >
                {SUPPORTED_QUESTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                Supports MCQ, True/False, Matching, Blank, and Essay formats.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="q-points">Maximum points</label>
              <input
                id="q-points"
                type="number"
                min={1}
                step={1}
                value={form.points}
                onChange={(e) =>
                  setForm({ ...form, points: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                data-testid="input-question-points"
              />
              <small className="field-hint">
                Independently configurable maximum points for this question.
              </small>
            </div>

            <div className="form-group span-2">
              <label htmlFor="q-instructions">Question instructions (optional)</label>
              <input
                id="q-instructions"
                type="text"
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="e.g. Select all that apply, or Answer in 200 words or less"
                data-testid="input-question-instructions"
              />
            </div>

{!isMatching && (
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
          )}



            {showSharedMedia && (
            <div className="form-group span-2 passage-attachment">
              <label className="passage-toggle" htmlFor="q-passage-toggle">
                <input
                  id="q-passage-toggle"
                  type="checkbox"
                  checked={usePassage}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUsePassage(checked);
                    if (!checked) {
                      setForm((prev) => ({ ...prev, passage_id: '' }));
                      setClientError(null);
                    }
                  }}
                  data-testid="checkbox-question-passage"
                />
                <span>
                  <strong>Needs a reading passage</strong>
                  <small>
                    Write a passage once and attach questions to it — students see the passage a
                    single time above the group of questions that share it.
                  </small>
                </span>
              </label>

              {usePassage && (
                <div className="passage-attach" data-testid="passage-attach-panel">
                  {form.passage_id && (
                    <div className="passage-attached" data-testid="passage-attached-chip">
                      <BookOpen size={14} />
                      <span>
                        Attached: <strong>{attachedPassage?.title || `Passage #${form.passage_id}`}</strong>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove passage"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, passage_id: '' }));
                          setUsePassage(false);
                        }}
                        data-testid="button-detach-passage"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="passage-search">
                    <Search size={14} />
                    <input
                      type="search"
                      value={passageSearch}
                      placeholder="Search passages by title or content…"
                      onChange={(e) => setPassageSearch(e.target.value)}
                      aria-label="Search passages"
                      data-testid="input-passage-search"
                    />
                  </div>

                  {filteredPassages.length === 0 ? (
                    <small className="text-muted passage-empty" data-testid="passage-search-empty">
                      {passages.length === 0
                        ? 'No passages yet — write the first one below.'
                        : `No passages match “${passageSearch.trim()}”.`}
                    </small>
                  ) : (
                    <ul className="passage-picker" data-testid="passage-picker-list">
                      {filteredPassages.map((passage) => {
                        const selected = String(passage.id) === form.passage_id;
                        return (
                          <li key={passage.id}>
                            <button
                              type="button"
                              className={`passage-option${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() =>
                                setForm((prev) => ({ ...prev, passage_id: String(passage.id) }))
                              }
                              data-testid={`passage-option-${passage.id}`}
                            >
                              <strong>{passage.title || `Passage #${passage.id}`}</strong>
                              <small>
                                {(passage.content ?? '').slice(0, 140) || 'Empty passage'}
                              </small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="passage-new">
                    <div className="passage-new-label">or write a new passage</div>
                    <input
                      type="text"
                      placeholder="Passage title (optional)"
                      value={newPassage.title}
                      onChange={(e) =>
                        setNewPassage((prev) => ({ ...prev, title: e.target.value }))
                      }
                      data-testid="input-passage-title"
                    />
                    <RichTextEditor
                      rows={5}
                      ariaLabel="Passage content"
                      testId="textarea-passage-content"
                      placeholder="Write the reading passage students will see. Tables, headings, lists and images are supported — a question can refer to any of it."
                      value={newPassage.content}
                      onChange={(content) => setNewPassage((prev) => ({ ...prev, content }))}
                    />
                    <div className="passage-new-actions">
                      <small className="field-hint">
                        Saved passages are reusable by any question in any exam.
                      </small>
                      <button
                        type="button"
                        className="button button-secondary button-sm"
                        disabled={createPassageMutation.isPending || !newPassage.content.trim()}
                        onClick={() => createPassageMutation.mutate()}
                        data-testid="button-create-passage"
                      >
                        <Plus size={14} />{' '}
                        {createPassageMutation.isPending ? 'Saving…' : 'Create & attach'}
                      </button>
                    </div>
                    <ErrorBox error={createPassageMutation.error} testId="passage-create-error" />
                  </div>
                </div>
              )}
            </div>
            )}

            {showSharedMedia && (
            <div className="form-group span-2">
              <label htmlFor="q-image">Question image (optional)</label>
              <input
                id="q-image"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => setForm({ ...form, question_image: String(reader.result ?? '') });
                    reader.readAsDataURL(file);
                  }
                }}
                data-testid="input-question-image"
              />
              {imagePreviewSrc && (
                <img src={imagePreviewSrc} alt="preview" style={{ maxWidth: 240, marginTop: 8, borderRadius: 8 }} />
              )}
            </div>
            )}



            {/* ─── Multiple Choice Options ─── */}
            {isOptionsType && (
              <div className="form-group span-2">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <label style={{ margin: 0 }}>Answer options</label>

                </div>
                <small className="field-hint" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {form.multiple_correct
                    ? 'Check all options that are correct. Students must select all correct options.'
                    : 'Pick the single correct answer option.'}
                </small>
                <div className="options-editor" data-testid="options-editor">
                  {form.options.map((option, index) => (
                    <div className="option-line" key={index}>
                      <input
                        type='radio'
                        name="correct-option"
                        checked={option.correct}
                        onChange={() => {
                          if (form.multiple_correct) {
                            setOption(index, { correct: !option.correct }, false);
                          } else {
                            setOption(index, { correct: true }, true);
                          }
                        }}
                        aria-label={`Mark option ${index + 1} correct`}
                        data-testid={`correct-choice-${index}`}
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

            {/* ─── True / False ─── */}
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

            {/* ─── Matching Pairs ─── */}
            {isMatching && (
              <div className="form-group span-2">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <label style={{ margin: 0 }}>Matching pairs (Left Item ↔ Right Match)</label>
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        matching_pairs: [...prev.matching_pairs, { left: '', right: '' }],
                      }))
                    }
                    data-testid="button-add-matching-pair"
                  >
                    <Plus size={14} /> Add pair
                  </button>
                </div>
                <small className="field-hint" style={{ display: 'block', marginBottom: '0.75rem' }}>
                  Enter each item on the left and its matching partner on the right. Students will see the
                  right matches shuffled.
                </small>
                <div className="matching-pairs-editor" data-testid="matching-pairs-editor">
                  {form.matching_pairs.map((pair, index) => (
                    <div key={index} className="matching-pair-row">
                      <input
                        type="text"
                        placeholder={`Left Item ${index + 1} (e.g. Mitochondria)`}
                        value={pair.left}
                        onChange={(e) => {
                          const next = [...form.matching_pairs];
                          next[index] = { ...next[index], left: e.target.value };
                          setForm({ ...form, matching_pairs: next });
                        }}
                        data-testid={`input-matching-left-${index}`}
                      />
                      <span className="pair-separator" style={{ color: 'var(--text-muted)' }}>↔</span>
                      <input
                        type="text"
                        placeholder={`Right Match ${index + 1} (e.g. ATP production)`}
                        value={pair.right}
                        onChange={(e) => {
                          const next = [...form.matching_pairs];
                          next[index] = { ...next[index], right: e.target.value };
                          setForm({ ...form, matching_pairs: next });
                        }}
                        data-testid={`input-matching-right-${index}`}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove pair ${index + 1}`}
                        disabled={form.matching_pairs.length <= 2}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            matching_pairs: prev.matching_pairs.filter((_, i) => i !== index),
                          }))
                        }
                        data-testid={`button-remove-matching-pair-${index}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Fill in the Blank ─── */}
            {isBlank && (
              <div className="form-group span-2">
                <label htmlFor="q-answer">Expected answer</label>
                <input
                  id="q-answer"
                  type="text"
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  placeholder="The expected correct answer word or phrase"
                  data-testid="input-question-answer"
                />
                <small className="field-hint">
                  Evaluation is case-insensitive and trims leading/trailing spaces.
                </small>
              </div>
            )}

            {/* ─── Essay ─── */}
            {isEssay && (
              <div className="form-group span-2">
                <div
                  style={{
                    background: 'var(--bg-subtle, #f8fafc)',
                    padding: '0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Essay questions allow open-ended student text submissions up to 10,000 characters. They
                  are evaluated manually by the instructor using the scoring rubric provided above.
                </div>
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

        </div>
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
              const passageError =
                showSharedMedia && usePassage && !form.passage_id
                  ? 'Pick a passage from the list above, create one below, or uncheck "Needs a reading passage".'
                  : null;
              const message = passageError ?? error ?? null;
              setClientError(message);
              if (!message) saveMutation.mutate();
            }}
            data-testid="button-save-question"
          >
            <Save size={15} />{' '}
            {saveMutation.isPending
              ? 'Saving…'
              : editing
                ? 'Save question'
                : 'Add question'}
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
        if (type === 'matching') {
          const pairs = Array.isArray(row.matching_pairs) ? (row.matching_pairs as Record<string, unknown>[]) : [];
          const validPairs = pairs.filter(
            (p) =>
              typeof p?.left_item === 'string' &&
              p.left_item.trim() &&
              typeof p?.right_item === 'string' &&
              p.right_item.trim(),
          );
          if (validPairs.length < 2) {
            problems.push(
              `Question ${n}: matching requires at least two complete pairs with "left_item" and "right_item".`,
            );
            return;
          }
          payload.matching_pairs = validPairs.map((p) => ({
            left_item: String(p.left_item).trim(),
            right_item: String(p.right_item).trim(),
          }));
          const pairsMap: Record<string, string> = {};
          validPairs.forEach((p) => {
            pairsMap[String(p.left_item).trim()] = String(p.right_item).trim();
          });
          payload.answer = JSON.stringify(pairsMap);
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
        <div className="dialog-body">
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
        </div>
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

  const seedMutation = useMutation({
    mutationFn: () => {
      const payloads = SIMULATION_EXAMPLES.map((ex) => {
        const { payload } = toPayload(
          {
            ...EMPTY_FORM,
            ...ex.state,
          },
          exam.id,
        );
        return payload;
      });
      return adminExamApi.bulkCreateQuestions(payloads);
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
            points
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
            disabled={locked || structureLocked || seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
            title="Seed all 6 benchmark simulation questions (Examples A through F)"
            data-testid="button-seed-simulation"
          >
            <ListPlus size={14} /> {seedMutation.isPending ? 'Seeding…' : 'Seed Examples A–F'}
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
            form. They support headings, tables, lists and images — edit one below to change it
            everywhere it is used.
          </p>
          <PassageLibrary />
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
                  <th className="num">Max Points</th>
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
                          {question.options.filter((o) => o.is_correct).length > 1 && ' · Multi-select'}
                        </small>
                      )}
                      {question.matching_pairs && question.matching_pairs.length > 0 && (
                        <small className="row-subtext">
                          {question.matching_pairs.length} matching pair{question.matching_pairs.length === 1 ? '' : 's'}
                        </small>
                      )}
                    </td>
                    <td>{QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}</td>
                    <td className="num" data-testid={`question-points-${question.id}`}>{question.points ?? 1}</td>
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

/**
 * Passage library — the shared reading-material manager behind the "Passages"
 * toggle. Passages are reused by every question in every exam, so they are
 * edited here once and everywhere updates. PUT/DELETE /v1/passages/{id} are
 * confirmed allowed on the live API (OPTIONS: GET,HEAD,PUT,DELETE).
 */
function PassageLibrary() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ title: string; content: string }>({ title: '', content: '' });
  const [deleting, setDeleting] = useState<{ id: number; label: string } | null>(null);

  const passagesQuery = useQuery({
    queryKey: ['admin-passages'],
    queryFn: ({ signal }) => adminExamApi.passages(signal),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-passages'] });

  const saveMutation = useMutation({
    mutationFn: (id: number) => adminExamApi.updatePassage(id, { content: draft.content, title: draft.title }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminExamApi.deletePassage(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  if (passagesQuery.isLoading) return <LoadingBlock label="Loading passages…" />;

  const passages = passagesQuery.data ?? [];
  if (passages.length === 0) return <small className="text-muted">No passages yet.</small>;

  return (
    <>
      <ErrorBox error={passagesQuery.error} onRetry={() => void passagesQuery.refetch()} />
      <ul className="passage-list" data-testid="list-passages">
        {passages.map((passage) => {
          const editing = editingId === passage.id;
          const label = passage.title || `Passage #${passage.id}`;
          if (!editing) {
            return (
              <li key={passage.id} className="passage-list-item">
                <div className="passage-list-body">
                  <strong>{label}</strong>
                  <small>{(passage.content ?? '').slice(0, 140)}…</small>
                </div>
                <div className="passage-list-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit passage ${label}`}
                    data-testid={`button-edit-passage-${passage.id}`}
                    onClick={() => {
                      setEditingId(passage.id);
                      setDraft({ title: passage.title ?? '', content: passage.content ?? '' });
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete passage ${label}`}
                    data-testid={`button-delete-passage-${passage.id}`}
                    onClick={() => setDeleting({ id: passage.id, label })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          }
          return (
            <li key={passage.id} className="passage-list-item passage-editing">
              <input
                type="text"
                value={draft.title}
                placeholder="Passage title (optional)"
                aria-label="Passage title"
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                data-testid={`input-passage-title-${passage.id}`}
              />
              <RichTextEditor
                rows={6}
                ariaLabel="Passage content"
                testId={`textarea-passage-content-${passage.id}`}
                value={draft.content}
                onChange={(content) => setDraft((prev) => ({ ...prev, content }))}
              />
              <ErrorBox error={saveMutation.error} testId={`passage-save-error-${passage.id}`} />
              <div className="passage-new-actions">
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={() => setEditingId(null)}
                  data-testid={`button-cancel-passage-${passage.id}`}
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary button-sm"
                  disabled={saveMutation.isPending || !draft.content.trim()}
                  onClick={() => saveMutation.mutate(passage.id)}
                  data-testid={`button-save-passage-${passage.id}`}
                >
                  <Save size={14} /> {saveMutation.isPending ? 'Saving…' : 'Save passage'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete passage"
        message={
          <>
            <strong>{deleting?.label}</strong> will be removed. Questions that still reference it
            keep the reference until you attach another passage.
          </>
        }
        confirmLabel="Delete passage"
        tone="danger"
        busy={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        testId="dialog-delete-passage"
      />
    </>
  );
}






