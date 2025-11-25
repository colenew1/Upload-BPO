import { z } from 'zod';

const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Service role key is required'),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(10),
  PREVIEW_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type PublicEnv = z.infer<typeof publicSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedPublicEnv: PublicEnv | null = null;

export const getServerEnv = (): ServerEnv => {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() can only be used on the server');
  }

  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }

  return cachedServerEnv;
};

export const getPublicEnv = (): PublicEnv => {
  if (!cachedPublicEnv) {
    cachedPublicEnv = publicSchema.parse(process.env);
  }

  return cachedPublicEnv;
};

