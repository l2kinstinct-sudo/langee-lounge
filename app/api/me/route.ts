import {NextResponse} from 'next/server';
import {requestUser, adminUser, serviceDb, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request: Request) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({user: null, isAdmin: false}, {headers: noCache});
  try {
    const db = serviceDb();
    const {data: profile} = await db.from('profiles').select('username').eq('id', user.id).maybeSingle();
    return NextResponse.json({user: {id: user.id, email: user.email, username: profile?.username || ''}, isAdmin: Boolean(await adminUser(request))}, {headers: noCache});
  } catch {return NextResponse.json({user: null, isAdmin:false, error:'Database not configured.'}, {status:503,headers:noCache});}
}
