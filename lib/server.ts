import {createClient, type User} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';

export const noCache = {'Cache-Control': 'no-store'};
export function failure(message: string, status = 400) {return NextResponse.json({error: message}, {status, headers: noCache});}
export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration missing.');
  return createClient(url, key, {auth: {autoRefreshToken: false, persistSession: false}});
}
export async function requestUser(request: Request): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwt = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!url || !key || !jwt) return null;
  const auth = createClient(url, key, {auth: {autoRefreshToken: false, persistSession: false}});
  const {data: {user}, error} = await auth.auth.getUser(jwt);
  return error ? null : user;
}
export async function adminUser(request: Request): Promise<User | null> {
  const user = await requestUser(request);
  if (!user || !user.email_confirmed_at || !user.email) return null;
  // The second admin is optional. Both users still need verified Supabase accounts.
  const adminEmails = [process.env.ADMIN_EMAIL, process.env.ADMIN_EMAIL_2]
    .map(email => email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
  return adminEmails.includes(user.email.trim().toLowerCase()) ? user : null;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {return new URL(origin).host === new URL(request.url).host;} catch {return false;}
}
