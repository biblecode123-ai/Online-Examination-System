import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '../../lib/endpoints';
import { Users, UserPlus, Trash2, Search } from 'lucide-react';

export function TeacherAssignments() {
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<number>(1);
  const [search, setSearch] = useState('');

  const { data: exams } = useQuery({
    queryKey: ['teacher-exams'],
    queryFn: () => teacherApi.listRealExams({ page: 1, perPage: 50 }),
  });

  const { data: students } = useQuery({
    queryKey: ['department-students', selectedDepartment],
    queryFn: () => teacherApi.getDepartmentStudents(selectedDepartment, { search }),
    enabled: !!selectedDepartment,
  });

  const { data: assignedStudents } = useQuery({
    queryKey: ['assigned-students', selectedExam],
    queryFn: () => teacherApi.getAssignedStudents(selectedExam || 0),
    enabled: !!selectedExam,
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Student Assignments</h1>
        <p>Assign students to your Real Exams</p>
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
        </div>
        <div className="card-body">
          {selectedExam ? (
            <div className="assignment-section">
              <h3>Department Student Picker</h3>
              <div className="form-row">
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(parseInt(e.target.value))}
                  className="select"
                >
                  <option value={1}>Computer Science</option>
                  <option value={2}>Mathematics</option>
                  <option value={3}>Physics</option>
                </select>
                <div className="search-bar">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="student-list">
                {students?.data?.map((student) => (
                  <div key={student.id} className="student-item">
                    <input type="checkbox" id={`student-${student.id}`} />
                    <label htmlFor={`student-${student.id}`}>
                      <strong>{student.name}</strong>
                      <small>{student.email}</small>
                    </label>
                  </div>
                ))}
              </div>

              <button className="button button-primary">
                <UserPlus size={16} /> Assign Selected Students
              </button>

              <h3>Currently Assigned</h3>
              <div className="assigned-list">
                {assignedStudents?.data?.map((student) => (
                  <div key={student.id} className="student-item">
                    <strong>{student.name}</strong>
                    <small>{student.email}</small>
                    <button className="icon-button text-danger">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p>Select an exam to view and manage student assignments.</p>
          )}
        </div>
      </div>
    </div>
  );
}
