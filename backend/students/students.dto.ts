import { z } from 'zod';
export const createStudentSchema = z.object({
  // Many pupils have no email; the field may be left empty.
  name: z.string().trim().min(1), code: z.string().trim().min(1), email: z.union([z.email(), z.literal('')]).default(''),
  avatar: z.string().default(''), classId: z.string().min(1),
});

const MAX_FILE_BASE64 = 14_000_000; // about 10 MB of .xlsx
export const importPreviewSchema = z.object({ classId: z.string().min(1), fileBase64: z.string().min(1).max(MAX_FILE_BASE64), createAccounts: z.boolean().default(true) });
export const importCommitSchema = z.object({
  classId: z.string().min(1),
  createAccounts: z.boolean().default(true),
  rows: z.array(z.object({
    row: z.number().int().positive().optional(),
    name: z.string().trim(), code: z.string().trim(), email: z.string().trim(),
  })).min(1).max(1000),
});
