import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnswerCorrect,
  gradeSubmission,
  computeItemAnalysis,
  computeKnowledgeGaps,
  normalizeAnswer,
  computeClassProgress,
} from './assessmentLogic';
import { Assessment, Question, Submission } from '../types/index';

test('normalizeAnswer removes punctuation and trims whitespace', () => {
  assert.equal(normalizeAnswer('  went.  '), 'went');
  assert.equal(normalizeAnswer('Has been working!'), 'has been working');
  assert.equal(normalizeAnswer(''), '');
});

test('isAnswerCorrect checks multiple choice letters and full strings correctly', () => {
  const mcQuestion: Question = {
    id: 'q1',
    order: 1,
    text: 'She _____ to London last summer.',
    type: 'multiple_choice',
    options: ['A. goes', 'B. went', 'C. has gone', 'D. will go'],
    correctAnswer: 'B',
    grammarTopic: 'Past Simple',
    explanation: 'Last summer indicates past simple.',
    points: 1,
  };

  assert.equal(isAnswerCorrect(mcQuestion, 'B'), true);
  assert.equal(isAnswerCorrect(mcQuestion, 'b'), true);
  assert.equal(isAnswerCorrect(mcQuestion, 'B. went'), true);
  assert.equal(isAnswerCorrect(mcQuestion, 'A'), false);
  assert.equal(isAnswerCorrect(mcQuestion, undefined), false);
});

test('gradeSubmission calculates scale of 10 accurately', () => {
  const questions: Question[] = [
    {
      id: 'q1',
      order: 1,
      text: 'Question 1',
      type: 'multiple_choice',
      correctAnswer: 'A',
      grammarTopic: 'Grammar',
      explanation: 'test',
      points: 1,
    },
    {
      id: 'q2',
      order: 2,
      text: 'Question 2',
      type: 'multiple_choice',
      correctAnswer: 'C',
      grammarTopic: 'Grammar',
      explanation: 'test',
      points: 1,
    },
  ];

  // 1 correct out of 2 = 5.0
  const result1 = gradeSubmission(questions, { q1: 'A', q2: 'D' });
  assert.equal(result1.autoScore, 5.0);
  assert.equal(result1.correctTotal, 1);
  assert.equal(result1.details['q1'], true);
  assert.equal(result1.details['q2'], false);

  // Both correct = 10.0
  const result2 = gradeSubmission(questions, { q1: 'A', q2: 'C' });
  assert.equal(result2.autoScore, 10.0);
  assert.equal(result2.correctTotal, 2);
});

test('computeItemAnalysis flags high error rate questions and most common distractor', () => {
  const dummyAssessment: Assessment = {
    id: 'a1',
    title: 'Midterm Test',
    type: 'exam',
    classIds: ['c1'],
    description: 'Test',
    durationMinutes: 45,
    dueDate: '2026-12-01',
    totalPoints: 10,
    createdAt: '2026-11-01',
    status: 'published',
    questions: [
      {
        id: 'q1',
        order: 1,
        text: 'Tricky question about Passive Voice',
        type: 'multiple_choice',
        correctAnswer: 'C',
        grammarTopic: 'Passive Voice',
        explanation: 'Was built is correct',
        points: 1,
      },
    ],
  };

  const dummySubmissions: Submission[] = [
    {
      id: 's1',
      assessmentId: 'a1',
      studentId: 'st1',
      studentName: 'Student 1',
      studentAvatar: '',
      submittedAt: '2026-11-02',
      answers: { q1: 'A' }, // Wrong (picked A)
      autoScore: 0,
      finalScore: null,
      isReviewed: false,
      teacherFeedback: '',
      status: 'pending_review',
      timeSpentSeconds: 300,
    },
    {
      id: 's2',
      assessmentId: 'a1',
      studentId: 'st2',
      studentName: 'Student 2',
      studentAvatar: '',
      submittedAt: '2026-11-02',
      answers: { q1: 'A' }, // Wrong (picked A)
      autoScore: 0,
      finalScore: null,
      isReviewed: false,
      teacherFeedback: '',
      status: 'pending_review',
      timeSpentSeconds: 280,
    },
    {
      id: 's3',
      assessmentId: 'a1',
      studentId: 'st3',
      studentName: 'Student 3',
      studentAvatar: '',
      submittedAt: '2026-11-02',
      answers: { q1: 'C' }, // Correct!
      autoScore: 10,
      finalScore: 10,
      isReviewed: true,
      teacherFeedback: 'Good job',
      status: 'published',
      timeSpentSeconds: 250,
    },
  ];

  const analysis = computeItemAnalysis(dummyAssessment, dummySubmissions);
  assert.equal(analysis.length, 1);
  assert.equal(analysis[0].incorrectCount, 2);
  assert.equal(analysis[0].correctCount, 1);
  assert.equal(analysis[0].errorRate, 67); // 2/3 = ~67%
  assert.equal(analysis[0].mostCommonDistractor, 'A');
});

test('computeKnowledgeGaps categorizes weak topics when error rate is high', () => {
  const dummyAssessment: Assessment = {
    id: 'a1',
    title: 'Grammar Test',
    type: 'exam',
    classIds: ['c1'],
    description: '',
    durationMinutes: 30,
    dueDate: '2026-12-01',
    totalPoints: 10,
    createdAt: '2026-11-01',
    status: 'published',
    questions: [
      {
        id: 'q1',
        order: 1,
        text: 'Preposition of time',
        type: 'multiple_choice',
        correctAnswer: 'A',
        grammarTopic: 'Prepositions',
        explanation: 'At 7 oclock',
        points: 1,
      },
    ],
  };

  const dummySubmissions: Submission[] = [
    {
      id: 's1',
      assessmentId: 'a1',
      studentId: 'st1',
      studentName: 'St 1',
      studentAvatar: '',
      submittedAt: '',
      answers: { q1: 'B' }, // wrong
      autoScore: 0,
      finalScore: null,
      isReviewed: false,
      teacherFeedback: '',
      status: 'pending_review',
      timeSpentSeconds: 100,
    },
    {
      id: 's2',
      assessmentId: 'a1',
      studentId: 'st2',
      studentName: 'St 2',
      studentAvatar: '',
      submittedAt: '',
      answers: { q1: 'C' }, // wrong
      autoScore: 0,
      finalScore: null,
      isReviewed: false,
      teacherFeedback: '',
      status: 'pending_review',
      timeSpentSeconds: 100,
    },
  ];

  const gaps = computeKnowledgeGaps(dummyAssessment, dummySubmissions);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].topic, 'Prepositions');
  assert.equal(gaps[0].status, 'weak');
  assert.equal(gaps[0].accuracyRate, 0);
});

test('isAnswerCorrect accepts listed alternatives but not a fragment split at a comma', () => {
  const question: Question = {
    id: 'q-st', order: 1, text: 'Rewrite: My advice is to study harder.', type: 'sentence_transformation',
    correctAnswer: 'If I were you, I would study harder / You should study harder', grammarTopic: 'Advice', explanation: '', points: 1,
  };
  assert.equal(isAnswerCorrect(question, 'If I were you, I would study harder.'), true);
  assert.equal(isAnswerCorrect(question, 'you should study harder'), true);
  assert.equal(isAnswerCorrect(question, 'I would study harder'), false);
});

test('computeClassProgress does not count students without grades as needing support', () => {
  const base = { classId: 'c', email: '', avatar: '', totalAssigned: 0, weakTopics: [], status: 'good' as const };
  const progress = computeClassProgress([
    { ...base, id: 'new', name: 'New', code: 'N', averageScore: 0, completedCount: 0 },
    { ...base, id: 'low', name: 'Low', code: 'L', averageScore: 3, completedCount: 2 },
  ], [], []);
  assert.deepEqual(progress.studentsNeedingSupport.map(s => s.id), ['low']);
});

test('true/false questions accept T/F, True/False and Đúng/Sai', () => {
  const q: Question = { id: 'tf', order: 1, text: 'The writer is a teacher.', type: 'true_false', correctAnswer: 'T', grammarTopic: 'Reading', explanation: '', points: 1 };
  assert.equal(isAnswerCorrect(q, 'T'), true);
  assert.equal(isAnswerCorrect(q, 'true'), true);
  assert.equal(isAnswerCorrect(q, 'Đúng'), true);
  assert.equal(isAnswerCorrect(q, 'F'), false);
  assert.equal(isAnswerCorrect(q, 'maybe'), false);
});

test('essay questions are never auto-correct and lower the automatic score', () => {
  const mc: Question = { id: 'mc', order: 1, text: 'x', type: 'multiple_choice', options: ['A. a', 'B. b'], correctAnswer: 'A', grammarTopic: '', explanation: '', points: 1 };
  const essay: Question = { id: 'es', order: 2, text: 'Write...', type: 'essay', correctAnswer: '', grammarTopic: '', explanation: '', points: 1 };
  assert.equal(isAnswerCorrect(essay, 'A long paragraph'), false);
  assert.equal(gradeSubmission([mc, essay], { mc: 'A', es: 'text' }).autoScore, 5);
  assert.equal(computeItemAnalysis({ questions: [mc, essay] } as Assessment, []).length, 1);
});
