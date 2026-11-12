import type { Assessment, Student, Submission } from '../types/index';
export { normalizeAnswer, normalizeTrueFalse, isAnswerCorrect, isManuallyGraded, gradeSubmission } from '../../shared/grading';
export { computeItemAnalysis, computeKnowledgeGaps } from '../../shared/analytics';

/**
 * Overall classroom learning progress metrics
 */
export function computeClassProgress(
  students: Student[],
  assessments: Assessment[],
  submissions: Submission[]
) {
  const totalStudents = students.length;
  if (totalStudents === 0) {
    return {
      avgClassScore: 0,
      completionRate: 0,
      scoreDistribution: { excellent: 0, good: 0, average: 0, low: 0 },
      studentsNeedingSupport: [],
    };
  }

  // Calculate scores from published submissions
  const publishedSubs = submissions.filter(s => s.status === 'published' && s.finalScore !== null);
  const avgClassScore =
    publishedSubs.length > 0
      ? Math.round(
          (publishedSubs.reduce((acc, s) => acc + (s.finalScore || 0), 0) / publishedSubs.length) * 10
        ) / 10
      : 0;

  // Expected submissions
  const totalPublishedAssessments = assessments.filter(a => a.status !== 'draft').length;
  const expectedSubmissions = totalStudents * Math.max(1, totalPublishedAssessments);
  const completionRate = Math.min(
    100,
    Math.round((submissions.length / Math.max(1, expectedSubmissions)) * 100)
  );

  const distribution = { excellent: 0, good: 0, average: 0, low: 0 };
  const studentsNeedingSupport: Student[] = [];

  for (const s of students) {
    // A student with no reviewed submission has no grade yet; do not flag them as weak.
    if (s.completedCount === 0) continue;
    if (s.averageScore >= 8.5) distribution.excellent += 1;
    else if (s.averageScore >= 7.0) distribution.good += 1;
    else if (s.averageScore >= 5.0) distribution.average += 1;
    else {
      distribution.low += 1;
      studentsNeedingSupport.push(s);
    }
  }

  return {
    avgClassScore,
    completionRate,
    scoreDistribution: distribution,
    studentsNeedingSupport,
  };
}
