import type { Question } from './types';

/**
 * Normalizes answer text for loose comparison in fill_in_blank or sentence transformations
 */
export function normalizeAnswer(ans?: string): string {
  if (!ans) return '';
  return ans
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Check if a student's answer is correct for a specific question
 */
/** Maps T/F, True/False, Đúng/Sai (any case) to 'T' or 'F'; anything else to ''. */
export function normalizeTrueFalse(answer?: string): 'T' | 'F' | '' {
  const value = (answer || '').trim().toLowerCase();
  if (['t', 'true', 'đ', 'đúng', 'dung', 'yes'].includes(value)) return 'T';
  if (['f', 'false', 's', 'sai', 'no'].includes(value)) return 'F';
  return '';
}

/** Essays need a teacher; they never count as automatically correct. */
export const isManuallyGraded = (question: Pick<Question, 'type'>) => question.type === 'essay';

export function isAnswerCorrect(question: Question, studentAnswer?: string): boolean {
  if (!studentAnswer) return false;
  if (isManuallyGraded(question)) return false;
  if (question.type === 'true_false') {
    const expected = normalizeTrueFalse(question.correctAnswer);
    return expected !== '' && normalizeTrueFalse(studentAnswer) === expected;
  }
  
  if (question.type === 'multiple_choice' || question.type === 'reading_comprehension') {
    const cleanStudent = studentAnswer.trim().toUpperCase();
    const cleanCorrect = question.correctAnswer.trim().toUpperCase();
    
    // Check if student provided single letter "A" or "A. ..."
    if (cleanStudent === cleanCorrect) return true;
    if (cleanStudent.startsWith(cleanCorrect + '.') || cleanStudent.startsWith(cleanCorrect + ' ') || cleanStudent.startsWith(cleanCorrect + ':')) {
      return true;
    }
    // Or if cleanCorrect matches the beginning
    if (cleanCorrect.startsWith(cleanStudent) && cleanStudent.length === 1) {
      return true;
    }
    return false;
  }

  // Text fill-in / transformation
  const normStudent = normalizeAnswer(studentAnswer);
  const normCorrect = normalizeAnswer(question.correctAnswer);
  if (normStudent === normCorrect) return true;

  // Multiple acceptable answers are separated by "/" or ";" (not commas: sentences contain them)
  const alternatives = question.correctAnswer
    .split(/[/;]/)
    .map(a => normalizeAnswer(a))
    .filter(Boolean);
  return alternatives.includes(normStudent);
}

/**
 * Auto-grades a submission against an assessment's questions.
 * Returns scale-10 score (thang điểm 10) rounded to 1 decimal place.
 * Essay points count in the maximum but earn nothing here, so the score is a lower bound
 * until the teacher sets the final score.
 */
export function gradeSubmission(
  questions: Question[],
  answers: Record<string, string>
): {
  autoScore: number;
  details: Record<string, boolean>;
  correctTotal: number;
  totalQuestions: number;
} {
  if (!questions || questions.length === 0) {
    return { autoScore: 0, details: {}, correctTotal: 0, totalQuestions: 0 };
  }

  const details: Record<string, boolean> = {};
  let totalEarnedPoints = 0;
  let totalMaxPoints = 0;
  let correctTotal = 0;

  for (const q of questions) {
    const maxPts = q.points && q.points > 0 ? q.points : 1;
    totalMaxPoints += maxPts;

    const isCorrect = isAnswerCorrect(q, answers[q.id]);
    details[q.id] = isCorrect;
    if (isCorrect) {
      totalEarnedPoints += maxPts;
      correctTotal += 1;
    }
  }

  const rawRatio = totalMaxPoints > 0 ? totalEarnedPoints / totalMaxPoints : 0;
  const autoScore = Math.round(rawRatio * 10 * 10) / 10; // Round to 1 decimal

  return {
    autoScore,
    details,
    correctTotal,
    totalQuestions: questions.length,
  };
}

