import {createClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {noCache, sameOrigin, serviceDb} from '@/lib/server';

export const runtime = 'nodejs';

// Resolve the username ONLY on the server. The service-role key, member emails,
// and membership lookup never go to an unauthenticated visitor's browser.
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({error: 'Invalid request.'}, {status: 403, headers: noCache});
  }
  const genericError = () => NextResponse.json(
    {error: 'Invalid username or password.'},
    {status: 401, headers: noCache},
  );
  try {
    if (Number(request.headers.get('content-length') || '0') > 4096) return genericError();
    const body = await request.json() as {username?: unknown; password?: unknown};
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-z0-9_]{3,20}$/.test(username) || !password || password.length > 1024) return genericError();

    const adminDb = serviceDb();
    const {data: profile, error: lookupError} = await adminDb
      .from('profiles').select('id').eq('username', username).maybeSingle();
    if (lookupError) throw lookupError;
    if (!profile) return genericError();

    const {data: {user}, error: userError} = await adminDb.auth.admin.getUserById(profile.id);
    if (userError) throw userError;
    if (!user?.email) return genericError();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const auth = createClient(url, anonKey, {
      auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
    });
    const {data, error} = await auth.auth.signInWithPassword({email: user.email, password});
    if (error || !data.session) return genericError();

    // Only return valid tokens AFTER Supabase has verified the password.
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }, {headers: noCache});
  } catch {
    return NextResponse.json({error: 'Unable to sign in right now. Please try again.'}, {
      status: 500, headers: noCache,
    });
  }
}
