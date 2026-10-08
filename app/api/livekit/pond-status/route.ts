import {NextResponse} from 'next/server';
import {RoomServiceClient} from 'livekit-server-sdk';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  const cloud=process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key=process.env.LIVEKIT_API_KEY;
  const secret=process.env.LIVEKIT_API_SECRET;
  if(!cloud||!key||!secret)return NextResponse.json({live:false},{status:503});
  try{
    const url=cloud.replace(/^wss:/,'https:').replace(/^ws:/,'http:');
    const service=new RoomServiceClient(url,key,secret);
    const participants=await service.listParticipants('duck-pond');
    // This is OBS/WHIP's ingress identity, not a viewer or another admin.
    const live=participants.some(person=>person.identity==='duck-pond-obs');
    return NextResponse.json({live},{headers:{'Cache-Control':'public, s-maxage=2, stale-while-revalidate=2'}});
  }catch{
    // The room may not exist yet when OBS is stopped; that is normal.
    return NextResponse.json({live:false},{headers:{'Cache-Control':'public, s-maxage=2, stale-while-revalidate=2'}});
  }
}
