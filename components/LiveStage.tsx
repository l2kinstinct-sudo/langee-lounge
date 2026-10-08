'use client';

import {useEffect,useRef,useState} from 'react';
import {Room,RoomEvent,Track} from 'livekit-client';
import type {TeamAssignment} from '@/lib/teams';
import LoungeChat from '@/components/LoungeChat';

type Props={
  admin:boolean;
  token:string|null;
  username:string|null;
  userId:string|null;
  assignments:Record<string,TeamAssignment>;
  openLogin:()=>void;
};

const STREAM_URL='https://stream.langeelounge.com/langee/?autoplay=true&muted=true&controls=true&playsInline=true';

export default function LiveStage({admin,token,username,assignments,openLogin}:Props) {
  const [live,setLive]=useState(false);
  const [pondLive,setPondLive]=useState(false);
  const [pondAudioBlocked,setPondAudioBlocked]=useState(false);
  const pondRoomRef=useRef<Room|null>(null);
  const pondVideoRef=useRef<HTMLDivElement>(null);
  const pondAudioRef=useRef<HTMLDivElement>(null);

  // MediaMTX is broadcast by OBS, not by the website's LiveKit room.
  // Never connect regular watchers to Langee's old LiveKit room.
  useEffect(()=>{
    let disposed=false;
    const checkMain=async()=>{
      try{
        const response=await fetch('/api/stream/status',{cache:'no-store'});
        if(!response.ok)throw new Error('Stream status unavailable');
        const result=await response.json() as {live?:boolean};
        if(!disposed)setLive(result.live===true);
      }catch{
        // A temporary network problem should not tear down an active player.
      }
    };
    void checkMain();
    const timer=setInterval(()=>{void checkMain();},12000);
    return ()=>{disposed=true;clearInterval(timer);};
  },[]);

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

  async function enablePondAudio(){
    try{await pondRoomRef.current?.startAudio();setPondAudioBlocked(false);}
    catch{setPondAudioBlocked(true);}
  }

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
      <section className="stage-main card" style={{width:'100%',maxWidth:460,justifySelf:'center',marginInline:'auto'}}>
        <div className="stream-frame" style={{width:'100%',height:'auto',aspectRatio:'9 / 16',maxWidth:'none',overflow:'hidden',position:'relative'}}>
          {live ? <iframe
            title="Langee main live stream"
            src={STREAM_URL}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            scrolling="no"
            style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0,display:'block',background:'#020705'}}
          /> : <div className="stream-empty">
            <div className="orbit">◉</div>
            <span className="eyebrow">LANGEE LIVE</span>
            <h2>We&apos;re Between Breaks</h2>
            <p>The stream will appear here when Langee starts streaming from OBS.</p>
          </div>}
          {live&&<span className="live-chip">● LIVE</span>}
        </div>
        <div className="player-meta"><span>● {live?'Streaming now':'Offline'}</span><span>Live from OBS</span></div>
        {admin&&<div className="stream-controls"><div><b>Main stream controls</b><small>Start or stop Langee's main livestream in OBS on his Windows PC. Duck Pond is separate.</small></div></div>}
      </section>
      <section className="pond-live-panel card" aria-label="Duck Pond livestream" hidden={!pondLive}>
        <div className="pond-topline"><div><span className="eyebrow">THE DUCK POND</span><h3>Duck Pond Live</h3></div><span className="pond-live-pill">● LIVE</span></div>
        <div className="pond-video-frame"><div className="pond-video-layer" ref={pondVideoRef}/><div className="hidden-audio" ref={pondAudioRef}/>{pondAudioBlocked&&<button type="button" className="audio-button" onClick={enablePondAudio}>🔊 Tap to enable pond sound</button>}</div>
      </section>
      <LoungeChat token={token} username={username} assignments={assignments} openLogin={openLogin}/>
    </div>
  </>;
}
