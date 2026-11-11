import { z } from 'zod';
export const submitSchema = z.object({
  assessmentId: z.string().min(1), studentId: z.string().min(1),
  answers: z.record(z.string(), z.string()), timeSpentSeconds: z.number().nonnegative().finite(),
});
export const reviewSchema = z.object({ finalScore: z.number().min(0).max(10).finite(), teacherFeedback: z.string().default('') });
