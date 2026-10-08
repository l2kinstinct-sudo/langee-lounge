import {createClient, type SupabaseClient} from '@supabase/supabase-js';

// Keep the current default (remembered sign-in) for existing Langee Lounge users.
// Unchecking Remember me stores the session in sessionStorage instead, which
// survives page refreshes but goes away when the browser tab is closed.
const REMEMBER_KEY = 'langee-lounge:remember-me';
let browserClient: SupabaseClient | null = null;

export function getRememberMe(): boolean {
  if (typeof window === 'undefined') return true;
  try {return window.localStorage.getItem(REMEMBER_KEY) !== 'false';}
  catch {return true;}
}

export function setRememberMe(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try {window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');}
  catch { /* Browser storage is disabled; sign-in will still work this visit. */ }
}

const sessionStorageAdapter = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      // Read old localStorage sessions for existing users only when remembering.
      // A user who opted out must NEVER load a persistent token on the next visit.
      if (!getRememberMe()) return window.sessionStorage.getItem(key);
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {return null;}
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      const preferred = getRememberMe() ? window.localStorage : window.sessionStorage;
      const alternative = getRememberMe() ? window.sessionStorage : window.localStorage;
      preferred.setItem(key, value);
      alternative.removeItem(key); // No persistent copy if Remember me is off.
    } catch { /* Storage disabled: leave persistence to the browser. */ }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {window.localStorage.removeItem(key);} catch {}
    try {window.sessionStorage.removeItem(key);} catch {}
  },
};

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!browserClient) browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: sessionStorageAdapter,
    },
  });
  return browserClient;
}
