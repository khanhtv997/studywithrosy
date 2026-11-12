import { z } from 'zod';

/** "email" accepts an email address or a short login name; it is matched against users.email. */
export const loginSchema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
export const googleLoginSchema = z.object({ credential: z.string().min(20).max(8000) });
