import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client (uses service role key).
 * Used in Vercel serverless API routes.
 */
export function getSupabase(): SupabaseClient {
  if (!serverClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase server credentials not configured');
    serverClient = createClient(url, key);
  }
  return serverClient;
}
