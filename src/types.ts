export interface SubjectScore {
  subjectId: string;
  subjectName: string;
  caScore: number | null; // 100% Raw
  caConverted: number | null; // 50%
  examScore: number | null; // 100% Raw
  examConverted: number | null; // 50%
  subjectTotal: number | null; // 100% Total
}

export interface Learner {
  id: string;
  name: string;
  scores: Record<string, SubjectScore>;
  overallTotal: number;
  averageScore: number;
  grade: string;
  position: number;
}

export interface ClassData {
  classLevel: 'Class 4' | 'Class 5';
  learners: Learner[];
}

export interface AssessmentMetadata {
  schoolName: string;
  emisCode: string;
  circuit: string;
  district: string;
  academicYear: string;
  term: string;
  teacherNameClass4: string;
  teacherNameClass5: string;
}
