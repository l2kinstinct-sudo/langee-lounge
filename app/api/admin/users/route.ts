import {NextResponse} from 'next/server';
import {adminUser, failure, noCache, serviceDb} from '@/lib/server';

export const runtime = 'nodejs';

/** Return only public usernames, only to Langee's authenticated admin account. */
export async function GET(request: Request) {
  if (!(await adminUser(request))) return failure('Admin required.', 403);
  const search = new URL(request.url).searchParams.get('search')?.trim().toLowerCase() || '';
  if (!/^[a-z0-9_]{0,30}$/.test(search)) return failure('Search can only contain letters, numbers, or underscores.');
  try {
    let query = serviceDb().from('profiles').select('username').order('username').limit(50);
    // Treat an underscore in a username as literal, not an SQL LIKE wildcard.
    if (search) query = query.ilike('username', `%${search.replace(/_/g, '\\_')}%`);
    const {data, error} = await query;
    if (error) throw error;
    return NextResponse.json({users: data || []}, {headers: noCache});
  } catch {
    return failure('Unable to load members right now.', 500);
  }
}
