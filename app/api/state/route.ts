import {NextResponse} from 'next/server';
import {serviceDb, failure, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function GET() {
  try {
    const db=serviceDb();
    const {data: breaks, error: e1} = await db.from('breaks').select('id,name,status,scheduled_date,replay_url,created_at').order('created_at',{ascending:false}).limit(50);
    if (e1) throw e1;
    const current=(breaks || []).find(b=>b.status==='current') || null;
    const {data: teams, error: e2} = current ? await db.from('team_assignments').select('team_code,user_id').eq('break_id',current.id) : {data: [],error:null};
    if(e2) throw e2;
    const users=[...new Set((teams||[]).map(t=>t.user_id))];
    const {data: profiles,error:e3} = users.length ? await db.from('profiles').select('id,username').in('id',users) : {data:[],error:null};
    if(e3) throw e3;
    const names=Object.fromEntries((profiles || []).map(p=>[p.id,p.username]));
    const assignments=Object.fromEntries((teams||[]).map(t=>[t.team_code,{userId:t.user_id,username:names[t.user_id] || 'Member'}]));
    const {data:hits,error:e4}=await db.from('hits').select('id,name,image_url,team,customer,break_name,created_at').order('created_at',{ascending:false}).limit(100);
    if(e4) throw e4;
    return NextResponse.json({current,breaks:breaks||[],assignments,hits:hits||[]},{headers:noCache});
  } catch(err) {return failure(err instanceof Error ? err.message : 'Could not load site data.',503);}
}
