import { z } from 'zod';

const role = z.enum(['admin', 'teacher', 'student']);
/** An email address, or a short login name such as "admin" or "giaovien". */
export const loginName = z.string().trim().toLowerCase()
  .refine(value => z.email().safeParse(value).success || /^[a-z0-9._-]{3,32}$/.test(value),
    'Use an email address or a login name of 3–32 letters, digits, dots, dashes or underscores');
export const createUserSchema = z.object({
  email: loginName, name: z.string().trim().min(1), role,
  password: z.string().min(8), studentId: z.string().nullable().optional(),
});
export const updateUserSchema = z.object({
  email: loginName.optional(), name: z.string().trim().min(1).optional(), role: role.optional(),
  studentId: z.string().nullable().optional(), active: z.boolean().optional(),
});
export const passwordSchema = z.object({ password: z.string().min(8) });
export const ownPasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
  .refine(d => d.newPassword !== d.currentPassword, { path: ['newPassword'], message: 'New password must differ from the current one' });
export const approvalSchema = z.object({
  approval: z.enum(['approved', 'rejected']),
  role: role.optional(),
  studentId: z.string().nullable().optional(),
});
