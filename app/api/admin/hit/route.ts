import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {adminUser, failure, sameOrigin, serviceDb, noCache} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request: Request) {
  if(!sameOrigin(request))return failure('Invalid origin.',403);
  if(!(await adminUser(request)))return failure('Admin required.',403);
  try {
    const form=await request.formData();
    const file=form.get('image');
    const name=String(form.get('name')||'').trim().slice(0,120);
    if(!name || !(file instanceof File))return failure('Name and photo are required.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return failure('Use JPG, PNG or WebP.');
    if(file.size>5_000_000)return failure('Maximum image size is 5 MB.');
    const suffix=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`hits/${randomUUID()}.${suffix}`;
    const db=serviceDb();
    const {error:uploadError}=await db.storage.from('hit-photos').upload(path,Buffer.from(await file.arrayBuffer()),{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    const {data:url}=db.storage.from('hit-photos').getPublicUrl(path);
    const {error}=await db.from('hits').insert({name,image_url:url.publicUrl,team:String(form.get('team')||'').slice(0,80),customer:String(form.get('customer')||'').slice(0,80),break_name:String(form.get('break')||'').slice(0,100)});
    if(error){await db.storage.from('hit-photos').remove([path]);throw error;}
    return NextResponse.json({ok:true},{headers:noCache});
  }catch(e){return failure(e instanceof Error?e.message:'Could not upload hit.',500);}
}
