import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '../../lib/endpoints';
import { CheckCircle, Clock, Download, Search } from 'lucide-react';

export function TeacherGrading() {
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');

  const { data: exams } = useQuery({
    queryKey: ['teacher-exams'],
    queryFn: () => teacherApi.listRealExams({ page: 1, perPage: 50 }),
  });

  const { data: attempts } = useQuery({
    queryKey: ['exam-attempts', selectedExam, filter],
    queryFn: () => teacherApi.getAttempts(selectedExam || 0, { filter }),
    enabled: !!selectedExam,
  });

  const handleExport = async () => {
    if (!selectedExam) return;
    try {
      const blob = await teacherApi.exportResults(selectedExam);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam_${selectedExam}_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Essay Grading</h1>
        <p>Grade essay and matching questions for your exams</p>
      </div>

      <div className="card">
        <div className="card-header">
          <select
            value={selectedExam || ''}
            onChange={(e) => setSelectedExam(e.target.value ? parseInt(e.target.value) : null)}
            className="select"
          >
            <option value="">Select Exam</option>
            {exams?.data?.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.exam_title}
              </option>
            ))}
          </select>
          {selectedExam && (
            <button className="button button-secondary" onClick={handleExport}>
              <Download size={16} /> Export Results
            </button>
          )}
        </div>
        <div className="card-body">
          {selectedExam ? (
            <>
              <div className="filters-row">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="select"
                >
                  <option value="all">All Attempts</option>
                  <option value="pending">Pending Grading</option>
                  <option value="graded">Graded</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="attempts-list">
                {attempts?.data?.map((attempt) => (
                  <div key={attempt.id} className="attempt-item">
                    <div className="attempt-header">
                      <strong>Attempt #{attempt.id}</strong>
                      <span className="badge badge-blue">
                        {attempt.attempt_status || attempt.status}
                      </span>
                    </div>
                    <div className="attempt-details">
                      <div>
                        <small>Student:</small>
                        <span>{(attempt as any).user?.name || 'Unknown'}</span>
                      </div>
                      <div>
                        <small>Score:</small>
                        <span>{attempt.score || 0}%</span>
                      </div>
                      <div>
                        <small>Submitted:</small>
                        <span>{attempt.end_time || 'N/A'}</span>
                      </div>
                    </div>
                    <button className="button button-primary">
                      <CheckCircle size={16} /> Grade Attempt
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>Select an exam to view attempts and grade essay questions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
