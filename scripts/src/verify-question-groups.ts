/**
 * Verification for buildQuestionGroups against the spec's acceptance rules:
 *  - grouping by passage ID (not title/text), contiguous runs, order preserved
 *  - instruction change (or absence) starts a new group
 *  - section boundary starts a new group
 *  - same passage reused in a later part -> separate group (displayed again)
 *  - questions without passage/instruction stay ungrouped (singletons)
 * Run: node scripts/node_modules/.bin/tsx scripts/src/verify-question-groups.ts
 */
import {
  buildQuestionGroups,
  questionTypeLabel,
} from '../../artifacts/online-examination/src/lib/questionGroups';
import type { QuestionPayload, SectionContent } from '../../artifacts/online-examination/src/lib/types';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function q(
  id: number,
  opts: { passageId?: number; passageTitle?: string; passageContent?: string; instructions?: string } = {},
): QuestionPayload {
  return {
    id,
    question_text: `Question ${id}`,
    question_type: 'multiple_choice',
    options: [{ id: id * 10, option_text: 'A' }],
    instructions: opts.instructions ?? null,
    passage: opts.passageId
      ? {
          id: opts.passageId,
          title: opts.passageTitle ?? null,
          content: opts.passageContent ?? null,
        }
      : null,
  };
}

// Scenario 1 — three questions share passage 7; question 4 has no passage.
{
  const questions = [
    q(1, { passageId: 7, passageTitle: 'Education', passageContent: 'Full text' }),
    q(2, { passageId: 7 }),
    q(3, { passageId: 7 }),
    q(4),
  ];
  const groups = buildQuestionGroups(questions, []);
  check(
    'S1 shared passage groups 1-3, question 4 alone',
    groups.length === 2 &&
      groups[0].indices.join(',') === '0,1,2' &&
      groups[0].passage?.id === 7 &&
      groups[1].indices.join(',') === '3' &&
      groups[1].passage === null,
    JSON.stringify(groups.map((g) => ({ i: g.indices, p: g.passage?.id ?? null }))),
  );
  // Richest passage payload wins when early rows lack content.
  const rich = [
    q(1, { passageId: 7 }),
    q(2, { passageId: 7, passageContent: 'Full text' }),
  ];
  const richGroups = buildQuestionGroups(rich, []);
  check('S1b passage content taken from richest row', richGroups[0].passage?.content === 'Full text');
}

// Scenario 2 — different passage ID begins a new group (even with same title).
{
  const questions = [
    q(1, { passageId: 7, passageTitle: 'Same title' }),
    q(2, { passageId: 8, passageTitle: 'Same title' }),
  ];
  const groups = buildQuestionGroups(questions, []);
  check(
    'S2 different passage ID -> new group (titles ignored)',
    groups.length === 2 && groups[0].passage?.id === 7 && groups[1].passage?.id === 8,
  );
}

// Scenario 3 — same instruction continues a group; change or absence breaks it.
{
  const questions = [
    q(1, { instructions: 'Choose the single best answer.' }),
    q(2, { instructions: 'Choose the single best answer.' }),
    q(3),
    q(4, { instructions: 'Choose the single best answer.' }),
  ];
  const groups = buildQuestionGroups(questions, []);
  check(
    'S3 instruction runs are contiguous; absence breaks the run',
    groups.length === 3 &&
      groups[0].indices.join(',') === '0,1' &&
      groups[0].instruction === 'Choose the single best answer.' &&
      groups[1].indices.join(',') === '2' &&
      groups[1].instruction === null &&
      groups[2].indices.join(',') === '3',
    JSON.stringify(groups.map((g) => ({ i: g.indices, ins: g.instruction }))),
  );
}

// Scenario 4 — instructions AND passage together; instruction renders before passage ordering data.
{
  const questions = [
    q(1, { passageId: 3, passageContent: 'Read me', instructions: 'Answer all that apply.' }),
    q(2, { passageId: 3, instructions: 'Answer all that apply.' }),
    q(3, { passageId: 3, instructions: 'Answer all that apply.' }),
  ];
  const groups = buildQuestionGroups(questions, []);
  check(
    'S4 instruction + passage on one group of three',
    groups.length === 1 &&
      groups[0].indices.length === 3 &&
      groups[0].instruction === 'Answer all that apply.' &&
      groups[0].passage?.id === 3,
  );
}

// Scenario 5 — section boundary splits a same-passage run.
{
  const sections = [
    { id: 10, question_ids: [1, 2] } as SectionContent,
    { id: 20, question_ids: [3, 4] } as SectionContent,
  ];
  const questions = [
    q(1, { passageId: 7 }),
    q(2, { passageId: 7 }),
    q(3, { passageId: 7 }),
    q(4, { passageId: 7 }),
  ];
  const groups = buildQuestionGroups(questions, sections);
  check(
    'S5 section boundary splits the passage group',
    groups.length === 2 &&
      groups[0].sectionId === 10 &&
      groups[0].indices.join(',') === '0,1' &&
      groups[1].sectionId === 20 &&
      groups[1].indices.join(',') === '2,3',
  );
}

// Scenario 6 — same passage reused non-adjacently is NOT merged (no reordering).
{
  const questions = [
    q(1, { passageId: 7 }),
    q(2),
    q(3, { passageId: 7 }),
  ];
  const groups = buildQuestionGroups(questions, []);
  check(
    'S6 non-adjacent reuse stays two separate groups, order preserved',
    groups.length === 3 &&
      groups[0].indices.join(',') === '0' &&
      groups[1].indices.join(',') === '1' &&
      groups[2].indices.join(',') === '2',
    JSON.stringify(groups.map((g) => g.indices)),
  );
}

// Scenario 7 — question type label heuristics unchanged.
check(
  'S7 questionTypeLabel basics',
  questionTypeLabel({ ...q(1), question_type: 'essay' }) === 'WRITE YOUR ANSWER' &&
    questionTypeLabel({ ...q(1), question_type: 'matching' }) === 'MATCH THE ITEMS' &&
    questionTypeLabel({ ...q(1), question_type: 'true_false' }) === 'TRUE OR FALSE' &&
    questionTypeLabel(q(1)) === 'SELECT ONE' &&
    questionTypeLabel({ ...q(1), multiple_correct: true }) === 'SELECT ALL THAT APPLY' &&
    questionTypeLabel({ ...q(1), instructions: 'select all that apply' }) === 'SELECT ALL THAT APPLY',
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll grouping checks passed.');
