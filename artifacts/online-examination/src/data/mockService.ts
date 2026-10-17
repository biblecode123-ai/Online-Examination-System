import { examinations, sampleResults, student, type Attempt, type Result, type Student } from './sample';

const KEYS = { session: 'northbridge.student.session.v1', attempts: 'northbridge.student.attempts.v1', results: 'northbridge.student.results.v1' };
export class StorageFailure extends Error { constructor(message = 'Browser storage is unavailable. Changes cannot be saved or submitted in this prototype.') { super(message); this.name = 'StorageFailure'; } }
function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { throw new StorageFailure(); }
}
function write<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); const check = localStorage.getItem(key); if (check !== JSON.stringify(value)) throw new Error(); } catch { throw new StorageFailure(); }
}
export const mockService = {
  getSession(): Student | null { return read<Student | null>(KEYS.session, null); },
  signIn(): Student { write(KEYS.session, student); return student; },
  signOut(): void { try { localStorage.removeItem(KEYS.session); } catch { throw new StorageFailure(); } },
  getAttempts(): Attempt[] {
    const attempts = read<Attempt[]>(KEYS.attempts, []);
    const now = Date.now();
    let changed = false;
    const finalized = attempts.map(attempt => {
      if (attempt.state !== 'in-progress') return attempt;
      const exam = examinations.find(item => item.id === attempt.examId);
      const expired = Date.parse(attempt.expiresAt) <= now || !exam || Date.parse(exam.scheduledEnd) <= now || Date.parse(exam.deadline) <= now;
      if (!expired) return attempt;
      changed = true;
      return { ...attempt, state: 'submitted' as const, submittedAt: new Date(now).toISOString(), reference: attempt.reference ?? `NB-${now.toString(36).toUpperCase()}` };
    });
    if (changed) write(KEYS.attempts, finalized);
    return finalized;
  },
  getResults(): Result[] { return [...sampleResults, ...read<Result[]>(KEYS.results, [])]; },
  saveAttempt(attempt: Attempt): Attempt {
    const all = this.getAttempts();
    const current = all.find(item => item.id === attempt.id);
    if (current?.state === 'submitted') return current;
    const next = [...all.filter(item => item.id !== attempt.id), attempt]; write(KEYS.attempts, next); return attempt;
  },
  begin(examId: string): Attempt {
    const exam = examinations.find(item => item.id === examId);
    const now = Date.now();
    if (!exam || exam.status !== 'open' || now < Date.parse(exam.scheduledStart) || now > Date.parse(exam.scheduledEnd) || now > Date.parse(exam.deadline)) throw new Error('This assessment is outside its scheduled start/end window and cannot be started.');
    const attempts = this.getAttempts().filter(item => item.examId === examId);
    const existing = attempts.find(item => item.state === 'in-progress');
    if (existing) return existing;
    if (attempts.length >= exam.attemptLimit) throw new Error('The attempt limit for this assessment has been reached.');
    const expiresAt = Math.min(now + exam.duration * 60000, Date.parse(exam.scheduledEnd), Date.parse(exam.deadline));
    const attempt: Attempt = { id: `try-${now.toString(36)}`, examId, startedAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString(), answers: {}, review: [], state: 'in-progress' };
    return this.saveAttempt(attempt);
  },
  submit(attempt: Attempt): Attempt {
    const current = this.getAttempts().find(item => item.id === attempt.id);
    if (!current || current.state === 'submitted') return current ?? attempt;
    const submitted = { ...attempt, state: 'submitted' as const, submittedAt: new Date().toISOString(), reference: `NB-${Date.now().toString(36).toUpperCase()}` };
    return this.saveAttempt(submitted);
  }
};
