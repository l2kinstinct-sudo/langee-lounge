import {createClient, type SupabaseClient} from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!browserClient) browserClient = createClient(url, key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  return browserClient;
}
