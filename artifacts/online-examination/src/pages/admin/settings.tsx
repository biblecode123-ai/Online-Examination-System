import { useState } from 'react';
import { Link } from 'wouter';

export function AdminSettings() {
  const location = (typeof window !== 'undefined' ? window.location : { pathname: '', search: '' }) as any;
  const search = location.search || '';
  const examIdParam = new URLSearchParams(search).get('examId') as string | null;
  const [examId, setExamId] = useState<number | null>(null);

  return (
    <div className="page">
      <h1>{examId ? `Security Settings — Exam #${examId}` : 'Security & Exam Settings'}</h1>
      <Link href="/admin/exams">Back to Exams</Link>

      {examId ? (
        <div>
          <p>Exam ID: {examId}</p>
          <p>Security settings for this exam are managed per-exam.</p>
          <p>See /admin/exams/{examId} for full exam settings.</p>
        </div>
      ) : (
        <div>
          <p>Enter an exam ID to view its security settings.</p>
          <input
            defaultValue="11048"
            onChange={(e) => setExamId(Number(e.target.value) || null)}
          />
          <button onClick={() => setExamId(examId || null)}>Load Settings</button>
        </div>
      )}
    </div>
  );
}