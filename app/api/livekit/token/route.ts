import {NextResponse} from 'next/server';
import {AccessToken} from 'livekit-server-sdk';
import {randomUUID} from 'node:crypto';
import {requestUser, adminUser, serviceDb, sameOrigin, failure, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request: Request) {
  if(!sameOrigin(request)) return failure('Invalid request origin.',403);
  const key=process.env.LIVEKIT_API_KEY, secret=process.env.LIVEKIT_API_SECRET, url=process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if(!key || !secret || !url?.startsWith('wss://')) return failure('LiveKit is not configured.',503);
  let requestData: {role?:string} = {};
  try {requestData=await request.json();}catch{return failure('Invalid request.');}
  const wantsHost=requestData.role==='host';
  const user=await requestUser(request);
  if(user && !user.email_confirmed_at) return failure('Confirm your email before joining chat.',403);
  if(wantsHost && !(await adminUser(request))) return failure('Admin account required to Go Live.',403);
  let username='Guest';
  if(user){
    try{
      const {data: profile}=await serviceDb().from('profiles').select('username').eq('id',user.id).single();
      if(!profile?.username) return failure('Complete your username profile first.',403);
      username=profile.username;
    }catch{return failure('Profile lookup unavailable.',503);}
  }
  const role=wantsHost ? 'host' : user ? 'viewer' : 'guest';
  const token=new AccessToken(key,secret,{
    identity:`${role}-${randomUUID()}`,
    name:username,
    metadata:JSON.stringify({role,userId:user?.id || null}),
    ttl:'2h'
  });
  token.addGrant({roomJoin:true,room:'langee-main',canSubscribe:true,canPublish:wantsHost,canPublishData:Boolean(user)});
  return NextResponse.json({token:await token.toJwt(),url,role},{headers:noCache});
}
