import { z } from 'zod';

const classFields = {
  name: z.string().trim().min(1), grade: z.string().trim().min(1), code: z.string().trim().min(1),
  academicYear: z.string().trim().min(1), description: z.string(), color: z.string(),
  teacherIds: z.array(z.string().min(1)).max(50),
};

export const createClassSchema = z.object({
  ...classFields,
  description: classFields.description.default(''),
  color: classFields.color.default('indigo'),
  teacherIds: classFields.teacherIds.optional(),
});
// Built from the fields without defaults, so a PATCH leaves missing fields alone.
export const updateClassSchema = z.object(classFields).partial();
