import type { Assessment, ItemAnalysis, Student, Submission, TopicMastery } from '../types/index';
import { isAnswerCorrect, isManuallyGraded } from '../../shared/grading';
import { translate } from '../i18n';
export { normalizeAnswer, normalizeTrueFalse, isAnswerCorrect, isManuallyGraded, gradeSubmission } from '../../shared/grading';

/**
 * Computes item analysis: for every question, how many students answered wrong,
 * error rate percentage, and what wrong answer option was chosen most often (distractor).
 */
export function computeItemAnalysis(
  assessment: Assessment,
  submissions: Submission[]
): ItemAnalysis[] {
  const result: ItemAnalysis[] = [];

  // Essays are graded by the teacher, so a right/wrong rate would be meaningless.
  for (const q of assessment.questions.filter(q => !isManuallyGraded(q))) {
    let correctCount = 0;
    let incorrectCount = 0;
    const distractorCounts: Record<string, number> = {};

    for (const sub of submissions) {
      const studentAns = sub.answers[q.id];
      const correct = isAnswerCorrect(q, studentAns);
      if (correct) {
        correctCount += 1;
      } else {
        incorrectCount += 1;
        if (studentAns) {
          const key = studentAns.trim().toUpperCase().charAt(0);
          distractorCounts[key] = (distractorCounts[key] || 0) + 1;
        } else {
          const blank = translate('(Bỏ trống)');
          distractorCounts[blank] = (distractorCounts[blank] || 0) + 1;
        }
      }
    }

    const totalAttempts = correctCount + incorrectCount;
    const errorRate = totalAttempts > 0 ? Math.round((incorrectCount / totalAttempts) * 100) : 0;

    // Find most common distractor
    let mostCommonDistractor: string | undefined;
    let maxDistractorCount = 0;
    for (const [key, count] of Object.entries(distractorCounts)) {
      if (count > maxDistractorCount) {
        maxDistractorCount = count;
        mostCommonDistractor = key;
      }
    }

    result.push({
      questionId: q.id,
      order: q.order,
      text: q.text,
      grammarTopic: q.grammarTopic || translate('Tổng hợp'),
      correctAnswer: q.correctAnswer,
      correctCount,
      incorrectCount,
      totalAttempts,
      errorRate,
      distractorCounts,
      mostCommonDistractor,
    });
  }

  return result;
}

/**
 * Computes knowledge gaps and grammar topic mastery from assessment submissions.
 */
export function computeKnowledgeGaps(
  assessment: Assessment,
  submissions: Submission[]
): TopicMastery[] {
  const topicMap: Record<
    string,
    { questionCount: number; totalAttempts: number; errorCount: number; correctCount: number }
  > = {};

  for (const q of assessment.questions.filter(q => !isManuallyGraded(q))) {
    const topic = (q.grammarTopic || translate('Kiến thức chung')).trim();
    if (!topicMap[topic]) {
      topicMap[topic] = { questionCount: 0, totalAttempts: 0, errorCount: 0, correctCount: 0 };
    }
    topicMap[topic].questionCount += 1;

    for (const sub of submissions) {
      const correct = isAnswerCorrect(q, sub.answers[q.id]);
      topicMap[topic].totalAttempts += 1;
      if (correct) {
        topicMap[topic].correctCount += 1;
      } else {
        topicMap[topic].errorCount += 1;
      }
    }
  }

  const result: TopicMastery[] = [];

  for (const [topic, data] of Object.entries(topicMap)) {
    const accuracyRate =
      data.totalAttempts > 0 ? Math.round((data.correctCount / data.totalAttempts) * 100) : 0;

    let status: 'strong' | 'moderate' | 'weak' = 'strong';
    let recommendation = translate('Học sinh nắm vững chủ điểm này.');

    if (accuracyRate < 60) {
      status = 'weak';
      recommendation = translate('Chủ điểm cần ôn tập khẩn cấp! Tỷ lệ sai lên tới {rate}%. Giáo viên nên dành 15-20 phút đầu giờ củng cố lại bài học.', { rate: 100 - accuracyRate });
    } else if (accuracyRate < 80) {
      status = 'moderate';
      recommendation = translate('Học sinh hiểu cơ bản nhưng vẫn còn vấp lỗi ở các câu bẫy hoặc trường hợp ngoại lệ.');
    }

    result.push({
      topic,
      questionCount: data.questionCount,
      totalAttempts: data.totalAttempts,
      errorCount: data.errorCount,
      accuracyRate,
      status,
      recommendation,
    });
  }

  // Sort: weakest topic first
  return result.sort((a, b) => a.accuracyRate - b.accuracyRate);
}

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
