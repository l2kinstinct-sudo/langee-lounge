import {NextResponse} from 'next/server';
import {adminUser, failure, sameOrigin, serviceDb, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request: Request) {
  if(!sameOrigin(request))return failure('Invalid origin.',403);
  if(!(await adminUser(request)))return failure('Admin required.',403);
  let body:{name?:string;date?:string;replay?:string}={};
  try{body=await request.json();}catch{return failure('Invalid request.');}
  const name=String(body.name||'').trim().slice(0,100);
  if(name.length<3)return failure('Enter a break name.');
  const date=body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const replay=body.replay && /^https:\/\//.test(body.replay) ? body.replay.slice(0,1000):null;
  try {
    const db=serviceDb();
    const {error:olderr}=await db.from('breaks').update({status:'past'}).eq('status','current');
    if(olderr)throw olderr;
    const {error}=await db.from('breaks').insert({name,status:'current',scheduled_date:date,replay_url:replay});
    if(error)throw error;
    return NextResponse.json({ok:true},{headers:noCache});
  } catch(e){return failure(e instanceof Error ? e.message : 'Could not create break.',500);}
}
