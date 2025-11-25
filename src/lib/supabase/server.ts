import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';
import { getServerEnv } from '@/lib/env';

declare const global: {
  __supabaseClient?: ReturnType<typeof createSupabaseAdminClient>;
};

const createSupabaseAdminClient = () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });
};

export const getSupabaseAdminClient = () => {
  if (process.env.NODE_ENV === 'production') {
    return createSupabaseAdminClient();
  }

  if (!global.__supabaseClient) {
    global.__supabaseClient = createSupabaseAdminClient();
  }

  return global.__supabaseClient;
};

