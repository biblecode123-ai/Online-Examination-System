export type Student = { name: string; id: string; institution: string; department: string; course: string; email: string };
export type Question = { id: string; type: 'single' | 'multiple' | 'boolean' | 'short'; text: string; marks: number; options?: string[] };
export type Examination = { id: string; title: string; course: string; subject: string; duration: number; marks: number; questionCount: number; scheduledStart: string; scheduledEnd: string; deadline: string; attemptLimit: number; status: 'upcoming' | 'open' | 'closed'; instructions: string[]; permissions: { review: boolean }; questions: Question[] };
export type Answer = string | string[];
export type Attempt = { id: string; examId: string; startedAt: string; expiresAt: string; answers: Record<string, Answer>; review: string[]; submittedAt?: string; reference?: string; state: 'in-progress' | 'submitted' };
export type Result = { id: string; attemptId: string; examId: string; score: number; total: number; percent: number; passed: boolean; releaseStatus: 'released' | 'pending'; reviewAllowed: boolean };
export type Notification = { id: string; title: string; detail: string; date: string; href: string };

const now = Date.now();
const offset = (hours: number) => new Date(now + hours * 3600000).toISOString();
export const student: Student = { name: 'Maya Chen', id: 'STU-204817', institution: 'Northbridge University', department: 'School of Computing', course: 'BSc Computer Science', email: 'maya.chen@northbridge.edu' };
export const examinations: Examination[] = [
  {
    id: 'cs204-midterm', title: 'Data Structures — Midterm Assessment', course: 'BSc Computer Science · Year 2', subject: 'CS204 · Data Structures', duration: 45, marks: 40, questionCount: 8,
    scheduledStart: offset(-2), scheduledEnd: offset(3), deadline: offset(3), attemptLimit: 1, status: 'open',
    instructions: ['This assessment contains 8 questions and is worth 40 marks.', 'You have 45 minutes from the moment you begin.', 'Your answers are saved in this browser as you work.', 'You may mark questions for review and return before submitting.', 'The timer continues if you leave this page. Browser controls cannot prevent all interruptions.'],
    permissions: { review: true },
    questions: [
      { id: 'q1', type: 'single', text: 'Which data structure provides amortized O(1) insertion at the end?', marks: 5, options: ['Binary search tree', 'Dynamic array', 'Linked list traversal', 'Heap'] },
      { id: 'q2', type: 'multiple', text: 'Select all properties of a binary search tree.', marks: 5, options: ['Left subtree values are smaller than the node', 'Every node has exactly two children', 'Right subtree values are greater than the node', 'In-order traversal yields sorted values'] },
      { id: 'q3', type: 'boolean', text: 'A stack follows the last-in, first-out principle.', marks: 5 },
      { id: 'q4', type: 'short', text: 'What is the time complexity of searching for a value in a balanced binary search tree?', marks: 5 },
      { id: 'q5', type: 'single', text: 'Which structure is most suitable for breadth-first graph traversal?', marks: 5, options: ['Stack', 'Queue', 'Hash map', 'Priority queue'] },
      { id: 'q6', type: 'multiple', text: 'Which operations are typically O(1) for a hash table on average?', marks: 5, options: ['Lookup by key', 'Insert by key', 'Sort all values', 'Delete by key'] },
      { id: 'q7', type: 'boolean', text: 'A min-heap guarantees that every parent is no greater than its children.', marks: 5 },
      { id: 'q8', type: 'short', text: 'Name the graph traversal algorithm that explores as far as possible along each branch before backtracking.', marks: 5 }
    ]
  },
  { id: 'math-final', title: 'Discrete Mathematics — Final', course: 'BSc Computer Science · Year 2', subject: 'MTH210 · Discrete Mathematics', duration: 90, marks: 60, questionCount: 12, scheduledStart: offset(28), scheduledEnd: offset(30), deadline: offset(30), attemptLimit: 1, status: 'upcoming', instructions: ['Read each question carefully.', 'A single attempt is permitted.'], permissions: { review: false }, questions: [] },
  { id: 'cs101-practice', title: 'Programming Foundations — Practice', course: 'BSc Computer Science · Year 1', subject: 'CS101 · Programming Foundations', duration: 30, marks: 20, questionCount: 5, scheduledStart: offset(-240), scheduledEnd: offset(-238), deadline: offset(-238), attemptLimit: 1, status: 'closed', instructions: ['This practice assessment is now closed.'], permissions: { review: false }, questions: [] }
];
export const notifications: Notification[] = [
  { id: 'n1', title: 'Assessment available', detail: 'Data Structures — Midterm is open until the deadline.', date: offset(-1), href: '/exams/cs204-midterm' },
  { id: 'n2', title: 'Upcoming assessment', detail: 'Discrete Mathematics — Final begins tomorrow.', date: offset(-2), href: '/exams/math-final' },
  { id: 'n3', title: 'Result published', detail: 'Programming Foundations result is ready to view.', date: offset(-48), href: '/results/result-practice' }
];
export const sampleResults: Result[] = [{ id: 'result-practice', attemptId: 'attempt-sample', examId: 'cs101-practice', score: 17, total: 20, percent: 85, passed: true, releaseStatus: 'released', reviewAllowed: false }];
