import {NextResponse} from 'next/server';
import {AccessToken} from 'livekit-server-sdk';
import {randomUUID} from 'node:crypto';
import {requestUser, adminUser, serviceDb, sameOrigin, failure, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request: Request) {
  if(!sameOrigin(request)) return failure('Invalid request origin.',403);
  const key=process.env.LIVEKIT_API_KEY, secret=process.env.LIVEKIT_API_SECRET, url=process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if(!key || !secret || !url?.startsWith('wss://')) return failure('LiveKit is not configured.',503);
  let requestData: {role?:string;room?:string} = {};
  try {requestData=await request.json();}catch{return failure('Invalid request.');}
  // Only allow the main room and the public Duck Pond viewer room.
  // The client cannot request publishing privileges in Duck Pond.
  if(requestData.room && requestData.room!=='duck-pond') return failure('Unknown room.',400);
  const isPond=requestData.room==='duck-pond';
  const wantsHost=requestData.role==='host';
  if(isPond && wantsHost) return failure('Duck Pond viewers cannot broadcast.',403);
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
  const role=isPond ? 'pond-viewer' : wantsHost ? 'host' : user ? 'viewer' : 'guest';
  const token=new AccessToken(key,secret,{
    identity:`${role}-${randomUUID()}`,
    name:username,
    metadata:JSON.stringify({role,userId:user?.id || null}),
    ttl:'2h'
  });
  token.addGrant({
    roomJoin:true,
    room:isPond?'duck-pond':'langee-main',
    canSubscribe:true,
    canPublish:!isPond && wantsHost,
    canPublishData:!isPond && Boolean(user),
  });
  return NextResponse.json({token:await token.toJwt(),url,role},{headers:noCache});
}
