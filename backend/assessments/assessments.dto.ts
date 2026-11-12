import { z } from 'zod';
import { EXERCISE_FORMATS } from '../../shared/exercise-formats';
import { normalizeTrueFalse } from '../../shared/grading';
import type { ExerciseFormat } from '../../shared/types';

const QUESTION_TYPES = ['multiple_choice', 'fill_blank', 'reading_comprehension', 'sentence_transformation', 'true_false', 'essay'] as const;
const FORMATS = EXERCISE_FORMATS.map(f => f.value) as [ExerciseFormat, ...ExerciseFormat[]];

const questionSchema = z.object({
  id: z.string().min(1), order: z.number().int().positive(), text: z.string().trim().min(1),
  type: z.enum(QUESTION_TYPES),
  format: z.enum(FORMATS).optional(),
  options: z.array(z.string()).optional(),
  // Essays may have no model answer; every other type is checked in superRefine below.
  correctAnswer: z.string().trim(),
  grammarTopic: z.string().default(''), explanation: z.string().default(''),
  points: z.number().positive(), readingPassage: z.string().optional(),
}).superRefine((q, ctx) => {
  const choice = q.type === 'multiple_choice' || q.type === 'reading_comprehension';
  if (choice) {
    const options = q.options ?? [];
    if (options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Choice questions need at least 2 options' });
    const index = q.correctAnswer.toUpperCase().charCodeAt(0) - 65;
    if (!(index >= 0 && index < options.length)) ctx.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'Answer must be one of the option letters' });
  } else if (q.type === 'true_false') {
    if (!normalizeTrueFalse(q.correctAnswer)) ctx.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'True/false answer must be T or F' });
  } else if (q.type !== 'essay' && !q.correctAnswer) {
    ctx.addIssue({ code: 'custom', path: ['correctAnswer'], message: 'Answer is required' });
  }
});

const dateSchema = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid date');

/** Fields without defaults: the update schema is built from these so missing fields stay untouched. */
const assessmentFields = {
  title: z.string().trim().min(1), type: z.enum(['exam', 'homework']), classIds: z.array(z.string().min(1)).max(100),
  subject: z.enum(['english']),
  level: z.enum(['THCS', 'THPT']).optional(),
  description: z.string(), durationMinutes: z.number().int().nonnegative(),
  dueDate: dateSchema, questions: z.array(questionSchema).min(1),
  status: z.enum(['draft', 'published', 'closed']), allowRetry: z.boolean().optional(),
};

export const createAssessmentSchema = z.object({
  ...assessmentFields,
  subject: assessmentFields.subject.default('english'),
  description: assessmentFields.description.default(''),
  status: assessmentFields.status.default('draft'),
  classIds: assessmentFields.classIds.default([]),
});
// Not createAssessmentSchema.partial(): in zod 4 that still fills defaults, so a PATCH with only
// { classIds } would reset status to "draft" and wipe the description.
export const updateAssessmentSchema = z.object(assessmentFields).partial();

export const annotationsSchema = z.object({
  highlights: z.array(z.object({
    id: z.string().min(1).max(64),
    block: z.string().min(1).max(200),
    start: z.number().int().min(0).max(1_000_000),
    end: z.number().int().min(1).max(1_000_000),
    color: z.enum(['yellow', 'green', 'pink', 'blue']),
    note: z.string().max(4000).optional(),
  }).refine(h => h.end > h.start, 'Highlight must not be empty')).max(3000),
  notes: z.record(z.string().max(200), z.string().max(8000)).refine(n => Object.keys(n).length <= 1000, 'Too many notes'),
  drawings: z.array(z.object({
    id: z.string().min(1).max(64),
    anchor: z.string().min(1).max(200),
    tool: z.enum(['pen', 'marker']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().min(1).max(40),
    points: z.array(z.number().finite().min(-100_000).max(1_000_000)).min(2).max(6000),
  })).max(2000).refine(list => list.reduce((sum, s) => sum + s.points.length, 0) <= 400_000, 'Too much drawing').default([]),
});

export const shareSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(50) });

export const copySchema = z.object({
  classIds: z.array(z.string().min(1)).max(100).default([]),
  status: z.enum(['draft', 'published']).default('draft'),
  dueDate: dateSchema.optional(),
});
