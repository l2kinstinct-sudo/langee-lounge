'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track,type RemoteParticipant,type RemoteTrack} from 'livekit-client';
import type {TeamAssignment} from '@/lib/teams';
import LoungeChat from '@/components/LoungeChat';

type Props={admin:boolean; token:string|null; username:string|null; userId:string|null; assignments:Record<string,TeamAssignment>; openLogin:()=>void};

// Broadcast a single 9:16 composited camera track. A second simultaneous camera
// is not supported by every mobile browser/device; fall back to the rear camera.
function drawCover(ctx:CanvasRenderingContext2D,video:HTMLVideoElement,x:number,y:number,w:number,h:number){
  if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
  const sourceW=video.videoWidth,sourceH=video.videoHeight;
  const scale=Math.max(w/sourceW,h/sourceH);
  const cropW=w/scale,cropH=h/scale;
  ctx.drawImage(video,(sourceW-cropW)/2,(sourceH-cropH)/2,cropW,cropH,x,y,w,h);
}
async function cameraVideo(stream:MediaStream){
  const video=document.createElement('video');
  video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;
  await video.play();
  return video;
}

function senderInfo(participant:RemoteParticipant) {
  try {const m=JSON.parse(participant.metadata||'{}') as {role?:string;userId?:string|null};return {role:m.role||'guest',userId:m.userId||null};}
  catch{return {role:'guest',userId:null};}
}
export default function LiveStage({admin,token,username,userId,assignments,openLogin}:Props) {
  const [status,setStatus]=useState<'connecting'|'connected'|'offline'>('connecting');
  const [live,setLive]=useState(false);
  const [pondLive,setPondLive]=useState(false);
  const [pondAudioBlocked,setPondAudioBlocked]=useState(false);
  const [broadcasting,setBroadcasting]=useState(false);
  const [watchers,setWatchers]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [audioBlocked,setAudioBlocked]=useState(false);
  const activeRoomRef=useRef<Room|null>(null);
  const pondRoomRef=useRef<Room|null>(null);
  const connectionRef=useRef(0);
  const videoRef=useRef<HTMLDivElement>(null);
  const audioRef=useRef<HTMLDivElement>(null);
  const pondVideoRef=useRef<HTMLDivElement>(null);
  const pondAudioRef=useRef<HTMLDivElement>(null);
  const captureCleanup=useRef<(()=>void)|null>(null);
  const [cameraNotice,setCameraNotice]=useState('');

  const connect=useCallback(async (mode:'viewer'|'host')=>{
    const index=++connectionRef.current;
    const previous=activeRoomRef.current;
    activeRoomRef.current=null;
    captureCleanup.current?.();captureCleanup.current=null;
    if(previous)void previous.disconnect();
    videoRef.current?.replaceChildren();audioRef.current?.replaceChildren();
    // Duck Pond is in its own LiveKit room; reconnecting the main stream must not affect it.
    setStatus('connecting');setLive(false);setBroadcasting(false);setError('');setWatchers(0);setAudioBlocked(false);setCameraNotice('');
    let room:Room|null=null;
    try {
      const result=await fetch('/api/livekit/token',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({role:mode})});
      const data=await result.json() as {token?:string;url?:string;error?:string};
      if(!result.ok || !data.token || !data.url)throw new Error(data.error||'Unable to connect to the video stream.');
      if(index!==connectionRef.current)return;
      room=new Room({adaptiveStream:true,dynacast:true});
      const active=room;
      activeRoomRef.current=active;
      function update() {
        const people=[...active.remoteParticipants.values()];
        const host=people.some(p=>senderInfo(p).role==='host' && [...p.videoTrackPublications.values()].some(pub=>pub.source===Track.Source.Camera && !pub.isMuted));
        if(mode==='viewer')setLive(host);
        setWatchers(people.filter(p=>senderInfo(p).role!=='host').length+(mode==='viewer'?1:0));
      }
      function subscribed(track:RemoteTrack,_publication:unknown,participant:RemoteParticipant) {
        if(senderInfo(participant).role!=='host')return;
        if(track.kind===Track.Kind.Video){
          const el=track.attach() as HTMLVideoElement;el.className='stream-video';el.autoplay=true;el.playsInline=true;
          // Keep the viewer video fitted to the portrait frame even if the old CSS is cached.
          Object.assign(el.style,{display:'block',width:'100%',height:'100%',objectFit:'cover',backgroundColor:'#020705'});
          videoRef.current?.replaceChildren(el);setLive(true);
        }else if(track.kind===Track.Kind.Audio){
          const el=track.attach();el.autoplay=true;audioRef.current?.replaceChildren(el);
          setAudioBlocked(!active.canPlaybackAudio);
        }
        update();
      }
      active.on(RoomEvent.TrackSubscribed,subscribed);
      active.on(RoomEvent.TrackUnsubscribed,(track)=>{track.detach().forEach(el=>el.remove());update();});
      active.on(RoomEvent.ParticipantConnected,update);
      active.on(RoomEvent.ParticipantDisconnected,update);
      active.on(RoomEvent.TrackPublished,update);
      active.on(RoomEvent.TrackUnpublished,update);
      active.on(RoomEvent.TrackMuted,update);
      active.on(RoomEvent.TrackUnmuted,update);
      active.on(RoomEvent.AudioPlaybackStatusChanged,()=>setAudioBlocked(!active.canPlaybackAudio));
      active.on(RoomEvent.Disconnected,()=>{if(activeRoomRef.current===active){setStatus('offline');setLive(false);setBroadcasting(false);}});
      await active.connect(data.url,data.token);
      if(index!==connectionRef.current){void active.disconnect();return;}
      setStatus('connected');update();
      if(mode==='host'){
        // Phone browsers may allow only one of the two cameras to capture.
        // Publish one composited canvas track so viewers see the same image.
        let rear:MediaStream|null=null,front:MediaStream|null=null, microphone:MediaStream|null=null;
        let preview:HTMLVideoElement|null=null,face:HTMLVideoElement|null=null;
        let frame=0;
        try{
          const rearConstraints:MediaStreamConstraints={video:{facingMode:{ideal:'environment'},width:{ideal:720},height:{ideal:1280}},audio:false};
          rear=await navigator.mediaDevices.getUserMedia(rearConstraints);
          preview=await cameraVideo(rear);
          try{
            front=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'user'},width:{ideal:480},height:{ideal:640}},audio:false});
            face=await cameraVideo(front);
            // iOS Safari commonly stops/mutes the first camera when opening the second.
            if(rear.getVideoTracks().some(t=>t.readyState!=='live'||t.muted)){
              front.getTracks().forEach(t=>t.stop());front=null;face=null;
              rear.getTracks().forEach(t=>t.stop());
              rear=await navigator.mediaDevices.getUserMedia(rearConstraints);
              preview=await cameraVideo(rear);
            }
          }catch{
            front?.getTracks().forEach(t=>t.stop());front=null;face=null;
            if(rear.getVideoTracks().some(t=>t.readyState!=='live'||t.muted)){
              rear.getTracks().forEach(t=>t.stop());
              rear=await navigator.mediaDevices.getUserMedia(rearConstraints);
              preview=await cameraVideo(rear);
            }
          }
          if(!face)setCameraNotice('This browser cannot keep both cameras active. The stream will show the rear camera only; on iPhone, a native dual-camera broadcasting app is needed for the facecam bubble.');
          const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;canvas.className='stream-video';
          Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',objectFit:'cover'});
          const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Cannot create video canvas.');
          const mainVideo=preview,faceVideo=face;
          const render=()=>{
            ctx.fillStyle='#000';ctx.fillRect(0,0,720,1280);
            if(mainVideo)drawCover(ctx,mainVideo,0,0,720,1280);
            if(faceVideo&&front?.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted)){
              const cx=592,cy=140,radius=112;
              ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
              drawCover(ctx,faceVideo,cx-radius,cy-radius,radius*2,radius*2);ctx.restore();
              ctx.strokeStyle='#111';ctx.lineWidth=8;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
            }
            frame=requestAnimationFrame(render);
          };
          render();
          const composed=canvas.captureStream(24);
          microphone=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
          const sound=microphone.getAudioTracks()[0];
          const video=composed.getVideoTracks()[0];
          const stopTracks=()=>{cancelAnimationFrame(frame);composed.getTracks().forEach(t=>t.stop());rear?.getTracks().forEach(t=>t.stop());front?.getTracks().forEach(t=>t.stop());microphone?.getTracks().forEach(t=>t.stop());preview?.pause();face?.pause();};
          captureCleanup.current=stopTracks;
          if(index!==connectionRef.current){stopTracks();captureCleanup.current=null;void active.disconnect();return;}
          await active.localParticipant.publishTrack(video,{source:Track.Source.Camera,name:'portrait-dual-camera'});
          await active.localParticipant.publishTrack(sound,{source:Track.Source.Microphone});
          if(index!==connectionRef.current){stopTracks();captureCleanup.current=null;void active.disconnect();return;}
          videoRef.current?.replaceChildren(canvas);
          setBroadcasting(true);setLive(true);
        }catch(e){
          cancelAnimationFrame(frame);
          rear?.getTracks().forEach(t=>t.stop());front?.getTracks().forEach(t=>t.stop());microphone?.getTracks().forEach(t=>t.stop());
          captureCleanup.current?.();captureCleanup.current=null;
          throw e;
        }
      }
    }catch(e){if(room)void room.disconnect();if(index===connectionRef.current){activeRoomRef.current=null;setStatus('offline');setError(e instanceof Error?e.message:'Connection failed.');}}
  },[token]);

  useEffect(()=>{
    void connect('viewer');
    return ()=>{++connectionRef.current;captureCleanup.current?.();captureCleanup.current=null;const room=activeRoomRef.current;activeRoomRef.current=null;void room?.disconnect();};
  },[connect]);
  // Duck Pond is separate from the main video and Supabase chat.
  // Only join the LiveKit pond room when OBS's ingress is actually online.
  // Otherwise even an invisible/offline viewer would use LiveKit connection minutes.
  useEffect(()=>{
    let disposed=false;
    let pondRoom:Room|null=null;
    let connecting=false;
    const clearPond=()=>{
      pondVideoRef.current?.replaceChildren();
      pondAudioRef.current?.replaceChildren();
      setPondLive(false);
      setPondAudioBlocked(false);
    };
    const disconnectPond=()=>{
      const previous=pondRoom;
      pondRoom=null;
      pondRoomRef.current=null;
      if(previous)void previous.disconnect();
      clearPond();
    };
    const connectPond=async()=>{
      if(disposed||connecting||pondRoom)return;
      connecting=true;
      try{
        const response=await fetch('/api/livekit/token',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({role:'viewer',room:'duck-pond'}),
        });
        const data=await response.json() as {token?:string;url?:string;error?:string};
        if(!response.ok||!data.token||!data.url)throw new Error(data.error||'Duck Pond token unavailable.');
        if(disposed)return;
        const room=new Room({adaptiveStream:true,dynacast:true});
        pondRoom=room;pondRoomRef.current=room;
        const refresh=()=>{
          if(disposed||pondRoom!==room)return;
          const publishing=[...room.remoteParticipants.values()].some(person=>
            person.identity==='duck-pond-obs' && [...person.videoTrackPublications.values()].some(publication=>!publication.isMuted));
          if(!publishing)clearPond();
        };
        room.on(RoomEvent.TrackSubscribed,(track,_,participant)=>{
          if(disposed||pondRoom!==room||participant.identity!=='duck-pond-obs')return;
          if(track.kind===Track.Kind.Video){
            const video=track.attach() as HTMLVideoElement;
            video.className='pond-stream-video';video.autoplay=true;video.playsInline=true;
            Object.assign(video.style,{display:'block',width:'100%',height:'100%',objectFit:'contain'});
            pondVideoRef.current?.replaceChildren(video);setPondLive(true);
          }else if(track.kind===Track.Kind.Audio){
            const audio=track.attach();audio.autoplay=true;
            pondAudioRef.current?.replaceChildren(audio);
            setPondAudioBlocked(!room.canPlaybackAudio);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed,track=>{track.detach().forEach(el=>el.remove());refresh();});
        room.on(RoomEvent.TrackUnpublished,refresh);
        room.on(RoomEvent.TrackMuted,refresh);
        room.on(RoomEvent.ParticipantDisconnected,refresh);
        room.on(RoomEvent.AudioPlaybackStatusChanged,()=>{if(!disposed)setPondAudioBlocked(!room.canPlaybackAudio);});
        room.on(RoomEvent.Disconnected,()=>{if(!disposed && pondRoom===room)disconnectPond();});
        await room.connect(data.url,data.token);
        if(disposed||pondRoom!==room){void room.disconnect();return;}
        refresh();
      }catch(e){
        if(!disposed){console.warn('Duck Pond connection unavailable:',e);disconnectPond();}
      }finally{connecting=false;}
    };
    const checkStatus=async()=>{
      if(disposed)return;
      try{
        const response=await fetch('/api/livekit/pond-status');
        if(!response.ok)return; // Temporary API failure: don't tear down a live pond.
        const status=await response.json() as {live?:boolean};
        if(disposed)return;
        if(status.live){if(!pondRoom&&!connecting)void connectPond();}
        else disconnectPond();
      }catch{/* No new connection on network failure. */}
    };
    void checkStatus();
    const interval=setInterval(()=>{void checkStatus();},5000);
    return ()=>{
      disposed=true;clearInterval(interval);
      const current=pondRoom;
      pondRoom=null;pondRoomRef.current=null;
      void current?.disconnect();
    };
  },[]);

  useEffect(()=>{if(!admin && broadcasting)void connect('viewer');},[admin,broadcasting,connect]);

  async function start(){if(!admin||busy)return;setBusy(true);try{await connect('host');}finally{setBusy(false);}}
  async function stop(){if(busy)return;setBusy(true);try{await connect('viewer');}finally{setBusy(false);}}
  async function enableAudio(){try{await activeRoomRef.current?.startAudio();setAudioBlocked(false);}catch{setError('Could not enable sound.');}}
  async function enablePondAudio(){try{await pondRoomRef.current?.startAudio();setPondAudioBlocked(false);}catch{setPondAudioBlocked(true);}}
  return <>
    <style>{`
      .stage-layout.pond-live-layout{grid-template-columns:minmax(0,460px) minmax(0,1fr);grid-template-areas:'main pond' 'main chat';align-items:start;justify-content:center;gap:16px}
      .pond-live-layout>.stage-main{grid-area:main}
      .pond-live-layout>.pond-live-panel{grid-area:pond}
      .pond-live-layout>.chat-panel{grid-area:chat;height:min(435px,58vh);min-height:300px}
      .pond-live-panel{min-width:0;overflow:hidden;align-self:start}
      .pond-live-panel[hidden]{display:none!important}
      .pond-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px}
      .pond-topline h3{margin:2px 0 0;font-size:1.1rem}
      .pond-live-pill{display:inline-block;white-space:nowrap;background:#d82e3b;border-radius:6px;padding:4px 9px;font-size:.7rem;font-weight:900}
      .pond-video-frame{aspect-ratio:16/9;position:relative;overflow:hidden;background:#030c08}
      .pond-video-layer{position:absolute;inset:0}
      .pond-video-layer .pond-stream-video{width:100%;height:100%;display:block;object-fit:contain}
      @media(max-width:850px){
        .stage-layout.pond-live-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:'main' 'pond' 'chat'}
        .pond-live-layout>.stage-main{justify-self:center}
        .pond-live-layout>.chat-panel{height:460px;min-height:350px}
      }
    `}</style>
    <div className={`stage-layout${pondLive?' pond-live-layout':''}`}>
    {/* Force the whole player card to portrait proportions, not just the video inside it. */}
    <section className="stage-main card" style={{width:'100%',maxWidth:460,justifySelf:'center',marginInline:'auto'}}>
      <div className="stream-frame" style={{width:'100%',height:'auto',aspectRatio:'9 / 16',maxWidth:'none',overflow:'hidden',position:'relative'}}><div className="video-layer" style={{position:'absolute',inset:0,width:'100%',height:'100%'}} ref={videoRef}/>
        {!live&&<div className="stream-empty"><div className="orbit">◉</div><span className="eyebrow">LANGEE LIVE</span><h2>We&apos;re Between Breaks</h2><p>The stream will appear here when Langee goes live.</p></div>}
        {live&&<span className="live-chip">● LIVE</span>}
        {broadcasting&&<span className="preview-label">Your camera preview</span>}
        {audioBlocked&&<button type="button" className="audio-button" onClick={enableAudio}>🔊 Tap to enable sound</button>}
        <div className="hidden-audio" ref={audioRef}/>
      </div>
      <div className="player-meta"><span>● {live?'Streaming now':'Offline'}</span><span>👥 {watchers} watching</span></div>
      {error&&<div className="notice warning" role="alert">{error}</div>}
      {cameraNotice&&broadcasting&&<div className="notice warning" role="status">{cameraNotice}</div>}
      {admin&&<div className="stream-controls"><div><b>Stream controls</b><small>Only your admin account can start the camera.</small></div>{broadcasting?<button className="danger" onClick={stop} disabled={busy}>END LIVE</button>:<button className="primary" onClick={start} disabled={busy}>{busy?'CONNECTING…':'● GO LIVE'}</button>}</div>}
    </section>
    {/* Always mounted so LiveKit can attach pond video before the panel becomes visible. */}
    <section className="pond-live-panel card" aria-label="Duck Pond livestream" hidden={!pondLive}>
      <div className="pond-topline"><div><span className="eyebrow">THE DUCK POND</span><h3>Duck Pond Live</h3></div><span className="pond-live-pill">● LIVE</span></div>
      <div className="pond-video-frame"><div className="pond-video-layer" ref={pondVideoRef}/><div className="hidden-audio" ref={pondAudioRef}/>{pondAudioBlocked&&<button type="button" className="audio-button" onClick={enablePondAudio}>🔊 Tap to enable pond sound</button>}</div>
    </section>
    <LoungeChat token={token} username={username} assignments={assignments} openLogin={openLogin}/>
  </div>
  </>;
}
