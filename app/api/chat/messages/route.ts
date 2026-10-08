import {NextResponse} from 'next/server';
import {adminUser,failure,noCache,requestUser,sameOrigin,serviceDb} from '@/lib/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const fields='id,user_id,username,role,body,created_at';

export async function GET(){
  try{
    const {data,error}=await serviceDb().from('lounge_chat_messages')
      .select(fields).order('created_at',{ascending:false}).limit(80);
    if(error)throw error;
    return NextResponse.json({messages:(data||[]).reverse()},{headers:noCache});
  }catch{return failure('Chat database is not set up yet.',503);}
}

export async function POST(request:Request){
  if(!sameOrigin(request))return failure('Invalid request origin.',403);
  const user=await requestUser(request);
  if(!user)return failure('Sign in to send messages.',401);
  if(!user.email_confirmed_at)return failure('Confirm your email before chatting.',403);
  let body='';
  try{const data=await request.json() as {body?:unknown};body=typeof data.body==='string'?data.body.trim():'';}
  catch{return failure('Invalid message.');}
  if(!body||body.length>250)return failure('Messages must contain 1–250 characters.');
  try{
    // User ID comes from the verified access token. Username comes from profiles;
    // neither can be forged by sending custom browser request fields.
    const role=(await adminUser(request))?'host':'viewer';
    const {data,error}=await serviceDb().rpc('post_langee_chat',{
      p_user_id:user.id,p_role:role,p_body:body
    });
    if(error){
      if(/wait before|too quickly/i.test(error.message))return failure('Please wait a moment before sending another message.',429);
      throw error;
    }
    return NextResponse.json({message:data},{headers:noCache});
  }catch{return failure('Could not send chat message. Check the chat database setup.',503);}
}
