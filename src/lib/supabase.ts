import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Browser-side Supabase client (uses anon key).
 * Used in React components for direct queries if needed.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase browser credentials not configured');
    browserClient = createClient(url, key);
  }
  return browserClient;
}
