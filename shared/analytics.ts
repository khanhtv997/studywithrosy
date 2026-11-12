import { isAnswerCorrect, isManuallyGraded } from './grading';
import type { Assessment, ItemAnalysis, Submission, TopicMastery } from './types';

/*
 * Labels below are Vietnamese source text, i.e. i18n keys: the server computes analytics without
 * knowing the reader's language, and the client passes them through t(). RECOMMEND_WEAK takes {rate}.
 */
export const BLANK_ANSWER = '(Bỏ trống)';
export const GENERAL_TOPIC = 'Tổng hợp';
export const GENERAL_KNOWLEDGE = 'Kiến thức chung';
export const RECOMMEND_STRONG = 'Học sinh nắm vững chủ điểm này.';
export const RECOMMEND_MODERATE = 'Học sinh hiểu cơ bản nhưng vẫn còn vấp lỗi ở các câu bẫy hoặc trường hợp ngoại lệ.';
export const RECOMMEND_WEAK = 'Chủ điểm cần ôn tập khẩn cấp! Tỷ lệ sai lên tới {rate}%. Giáo viên nên dành 15-20 phút đầu giờ củng cố lại bài học.';

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
          const blank = BLANK_ANSWER;
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
      grammarTopic: q.grammarTopic || GENERAL_TOPIC,
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
    const topic = (q.grammarTopic || GENERAL_KNOWLEDGE).trim();
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
    let recommendation = RECOMMEND_STRONG;

    if (accuracyRate < 60) {
      status = 'weak';
      recommendation = RECOMMEND_WEAK;
    } else if (accuracyRate < 80) {
      status = 'moderate';
      recommendation = RECOMMEND_MODERATE;
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
