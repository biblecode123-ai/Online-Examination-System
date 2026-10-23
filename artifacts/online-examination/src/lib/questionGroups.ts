import type { QuestionPayload, SectionContent } from './types';

/**
 * One contiguous run of questions that share the same section, reading
 * passage record and question-level instruction. Groups drive the student
 * attempt layout: the shared instruction renders once at the top of the
 * group, the shared passage once before its questions, and each question
 * keeps its own answer controls.
 */
export interface QuestionGroup {
  /** Indexes into the ordered question list, ascending. */
  indices: number[];
  sectionId: number | null;
  passage: QuestionPayload['passage'];
  /** Shared question-level instruction text, or null when the group has none. */
  instruction: string | null;
}

/**
 * Deterministically group questions for shared-content rendering.
 *
 * Groups follow the exam's configured question order exactly (the array the
 * API returned — questions are never reordered) and a new group starts
 * whenever the exam structure changes: a different section, a different
 * passage record (grouped by passage ID, never by title or matching text),
 * or a different instruction. Because runs are contiguous, a passage or
 * instruction reused in a separate part of the exam renders again as its own
 * group instead of merging unrelated questions across the exam.
 *
 * The student payload exposes instructions as merged text (no instruction
 * record IDs), so instruction grouping compares the exact instruction string
 * of adjacent questions: an equal string continues a group, any change —
 * including a question without instructions — starts a new one. Questions
 * without a passage or instruction therefore never inherit shared content
 * from their neighbours.
 */
export function buildQuestionGroups(
  questions: QuestionPayload[],
  sections: SectionContent[],
): QuestionGroup[] {
  const sectionIdByQuestionId = new Map<number, number>();
  for (const section of sections) {
    for (const questionId of section.question_ids ?? []) {
      if (!sectionIdByQuestionId.has(questionId)) {
        sectionIdByQuestionId.set(questionId, section.id);
      }
    }
  }

  const groups: QuestionGroup[] = [];
  questions.forEach((question, index) => {
    const sectionId = sectionIdByQuestionId.get(question.id) ?? null;
    const passageId = question.passage?.id ?? null;
    const instruction = question.instructions?.trim() || null;
    const previous = groups[groups.length - 1];
    const continues =
      previous !== undefined &&
      previous.sectionId === sectionId &&
      (previous.passage?.id ?? null) === passageId &&
      previous.instruction === instruction;

    if (continues) {
      previous.indices.push(index);
      // Later rows may carry the full passage payload; keep the richest copy.
      if (!previous.passage?.content && question.passage?.content) {
        previous.passage = question.passage;
      }
      return;
    }

    groups.push({
      indices: [index],
      sectionId,
      passage: question.passage ?? null,
      instruction,
    });
  });
  return groups;
}

/** Human-readable answer-type label for a question (student view). */
export function questionTypeLabel(question: QuestionPayload): string {
  if (question.question_type === 'essay' || question.question_type === 'blank') {
    return 'WRITE YOUR ANSWER';
  }
  if (question.question_type === 'matching') return 'MATCH THE ITEMS';
  if (question.question_type === 'true_false') return 'TRUE OR FALSE';
  if (
    question.multiple_correct ||
    question.options.length > 4 ||
    Boolean(question.instructions?.toLowerCase().includes('all that apply'))
  ) {
    return 'SELECT ALL THAT APPLY';
  }
  return 'SELECT ONE';
}
