import {NextResponse} from 'next/server';
import {adminUser, failure, sameOrigin, serviceDb, noCache} from '@/lib/server';
import {BY_CODE} from '@/lib/teams';
export const runtime='nodejs';
export async function POST(request: Request) {
  if(!sameOrigin(request))return failure('Invalid origin.',403);
  if(!(await adminUser(request)))return failure('Admin required.',403);
  let body: {team?:string;username?:string;remove?:boolean}={};
  try{body=await request.json();}catch{return failure('Invalid input.');}
  const code=String(body.team||'').toUpperCase();
  if(!BY_CODE[code])return failure('Unknown NFL team.');
  try {
    const db=serviceDb();
    const {data:brk,error:breakErr}=await db.from('breaks').select('id').eq('status','current').single();
    if(breakErr || !brk)return failure('No current break.',409);
    if(body.remove){
      const {error}=await db.from('team_assignments').delete().eq('break_id',brk.id).eq('team_code',code);
      if(error)throw error;
      return NextResponse.json({ok:true},{headers:noCache});
    }
    const name=String(body.username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(name))return failure('Enter a registered username (3–20 letters/numbers/underscores).');
    const {data:owner}=await db.from('profiles').select('id,username').eq('username',name).maybeSingle();
    if(!owner)return failure('Username not found. Ask them to create an account first.',404);
    const {error}=await db.from('team_assignments').upsert({break_id:brk.id,team_code:code,user_id:owner.id},{onConflict:'break_id,team_code'});
    if(error)throw error;
    return NextResponse.json({ok:true,username:owner.username},{headers:noCache});
  } catch(err){return failure(err instanceof Error ? err.message : 'Could not change team.',500);}
}
