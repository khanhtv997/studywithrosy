import { z } from 'zod';

/** "email" accepts an email address or a short login name; it is matched against users.email. */
export const loginSchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
export const googleLoginSchema = z.object({ credential: z.string().min(20).max(8000), profile: z.unknown().optional() });

/** Vietnamese phone numbers: 0xxxxxxxxx or +84xxxxxxxxx; spaces, dots and dashes are ignored. */
export const phoneField = z.string().trim()
  .transform(value => value.replace(/[\s.\-()]/g, ''))
  .refine(value => /^(\+84|0)\d{9,10}$/.test(value), 'Phone number is not valid');
const profileFields = {
  name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: phoneField,
  school: z.string().trim().min(2, 'School name is too short').max(200),
};
export const registerSchema = z.object({
  ...profileFields,
  email: z.string().trim().toLowerCase().pipe(z.email('Email is not valid')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export const googleProfileSchema = z.object(profileFields);
