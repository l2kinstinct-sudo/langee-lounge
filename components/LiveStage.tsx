'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Room,RoomEvent,Track,type RemoteParticipant,type RemoteTrack} from 'livekit-client';
import {BY_CODE,TEAMS,logo,type TeamAssignment} from '@/lib/teams';

type Chat = {id:string; name:string; userId:string|null; role:string; text:string; time:string};
type Props={admin:boolean; token:string|null; username:string|null; userId:string|null; assignments:Record<string,TeamAssignment>; openLogin:()=>void};
const clock=()=>new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function senderInfo(participant:RemoteParticipant) {
  try {const m=JSON.parse(participant.metadata||'{}') as {role?:string;userId?:string|null};return {role:m.role||'guest',userId:m.userId||null};}
  catch{return {role:'guest',userId:null};}
}
function TeamBadges({userId,assignments}:{userId:string|null; assignments:Props['assignments']}) {
  const [expanded,setExpanded]=useState(false);
  const codes=userId?TEAMS.filter(t=>assignments[t.code]?.userId===userId).map(t=>t.code):[];
  if(!codes.length)return null;
  return <span className="team-badges">
    {codes.length===1 ? <span className="single-team"><img src={logo(codes[0])} alt=""/><span>{BY_CODE[codes[0]].name}</span></span> : <>
      {codes.slice(0,3).map(code=><img className="team-badge-logo" src={logo(code)} title={BY_CODE[code].name} alt={BY_CODE[code].name} key={code}/>)}
      {codes.length>3 && <button type="button" className="more-teams" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>+{codes.length-3}</button>}
      {expanded && <span className="badge-popup"><b>Teams in this break</b>{codes.map(code=><span key={code}><img src={logo(code)} alt=""/>{BY_CODE[code].name}</span>)}</span>}
    </>}
  </span>;
}

export default function LiveStage({admin,token,username,userId,assignments,openLogin}:Props) {
  const [status,setStatus]=useState<'connecting'|'connected'|'offline'>('connecting');
  const [live,setLive]=useState(false);
  const [broadcasting,setBroadcasting]=useState(false);
  const [watchers,setWatchers]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [audioBlocked,setAudioBlocked]=useState(false);
  const [messages,setMessages]=useState<Chat[]>([]);
  const [draft,setDraft]=useState('');
  const activeRoomRef=useRef<Room|null>(null);
  const connectionRef=useRef(0);
  const lastSent=useRef(0);
  const videoRef=useRef<HTMLDivElement>(null);
  const audioRef=useRef<HTMLDivElement>(null);
  const messagesEnd=useRef<HTMLDivElement>(null);

  const addMessage=useCallback((message:Chat)=>setMessages(previous=>[...previous.slice(-119),message]),[]);
  const connect=useCallback(async (mode:'viewer'|'host')=>{
    const index=++connectionRef.current;
    const previous=activeRoomRef.current;
    activeRoomRef.current=null;
    if(previous)void previous.disconnect();
    videoRef.current?.replaceChildren();audioRef.current?.replaceChildren();
    setStatus('connecting');setLive(false);setBroadcasting(false);setError('');setWatchers(0);setAudioBlocked(false);
    let room:Room|null=null;
    try {
      const result=await fetch('/api/livekit/token',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({role:mode})});
      const data=await result.json() as {token?:string;url?:string;error?:string};
      if(!result.ok || !data.token || !data.url)throw new Error(data.error||'Unable to join live chat.');
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
          const el=track.attach();el.className='stream-video';el.autoplay=true;el.playsInline=true;
          videoRef.current?.replaceChildren(el);setLive(true);
        }else if(track.kind===Track.Kind.Audio){
          const el=track.attach();el.autoplay=true;audioRef.current?.replaceChildren(el);
          setAudioBlocked(!active.canPlaybackAudio);
        }
        update();
      }
      function received(payload:Uint8Array,from:RemoteParticipant|undefined,_kind:unknown,topic?:string){
        if(topic!=='langee-chat'||!from)return;
        try {
          const data=JSON.parse(new TextDecoder().decode(payload)) as {type?:string;id?:string;text?:string};
          if(data.type!=='chat'||typeof data.text!=='string'||!data.text.trim())return;
          const info=senderInfo(from);
          if(!info.userId)return; // Anonymous viewers cannot send trusted chat.
          addMessage({id:data.id?.slice(0,70)||crypto.randomUUID(),name:from.name||'Member',userId:info.userId,role:info.role,text:data.text.slice(0,250),time:clock()});
        }catch{/* discard invalid packets */}
      }
      active.on(RoomEvent.TrackSubscribed,subscribed);
      active.on(RoomEvent.TrackUnsubscribed,(track)=>{track.detach().forEach(el=>el.remove());update();});
      active.on(RoomEvent.ParticipantConnected,update);
      active.on(RoomEvent.ParticipantDisconnected,update);
      active.on(RoomEvent.TrackPublished,update);
      active.on(RoomEvent.TrackUnpublished,update);
      active.on(RoomEvent.TrackMuted,update);
      active.on(RoomEvent.TrackUnmuted,update);
      active.on(RoomEvent.DataReceived,received);
      active.on(RoomEvent.AudioPlaybackStatusChanged,()=>setAudioBlocked(!active.canPlaybackAudio));
      active.on(RoomEvent.Disconnected,()=>{if(activeRoomRef.current===active){setStatus('offline');setLive(false);setBroadcasting(false);}});
      await active.connect(data.url,data.token);
      if(index!==connectionRef.current){void active.disconnect();return;}
      setStatus('connected');update();
      if(mode==='host'){
        await active.localParticipant.enableCameraAndMicrophone();
        if(index!==connectionRef.current){void active.disconnect();return;}
        const camera=active.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if(camera){const el=camera.attach();el.className='stream-video';el.muted=true;el.autoplay=true;el.playsInline=true;videoRef.current?.replaceChildren(el);}
        setBroadcasting(true);setLive(true);
      }
    }catch(e){if(room)void room.disconnect();if(index===connectionRef.current){activeRoomRef.current=null;setStatus('offline');setError(e instanceof Error?e.message:'Connection failed.');}}
  },[token,addMessage]);

  useEffect(()=>{
    void connect('viewer');
    return ()=>{++connectionRef.current;const room=activeRoomRef.current;activeRoomRef.current=null;void room?.disconnect();};
  },[connect]);
  useEffect(()=>{if(!admin && broadcasting)void connect('viewer');},[admin,broadcasting,connect]);
  useEffect(()=>{messagesEnd.current?.scrollIntoView({block:'nearest'});},[messages]);

  async function start(){if(!admin||busy)return;setBusy(true);try{await connect('host');}finally{setBusy(false);}}
  async function stop(){if(busy)return;setBusy(true);try{await connect('viewer');}finally{setBusy(false);}}
  async function enableAudio(){try{await activeRoomRef.current?.startAudio();setAudioBlocked(false);}catch{setError('Could not enable sound.');}}
  async function send(event:FormEvent){
    event.preventDefault();
    const text=draft.trim();const room=activeRoomRef.current;
    if(!text||!token||!username||!room||status!=='connected'||Date.now()-lastSent.current<1000)return;
    lastSent.current=Date.now();
    const packet={type:'chat',id:crypto.randomUUID(),text:text.slice(0,250)};
    try {
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(packet)),{reliable:true,topic:'langee-chat'});
      addMessage({id:packet.id,name:username,userId,role:admin?'host':'viewer',text:packet.text,time:clock()});
      // Local token is verified server-side; display its own profile id, not arbitrary text.
      setDraft('');
    }catch{setError('Message could not be sent. Try reconnecting.');}
  }
  return <div className="stage-layout">
    <section className="stage-main card">
      <div className="stream-frame"><div className="video-layer" ref={videoRef}/>
        {!live&&<div className="stream-empty"><div className="orbit">◉</div><span className="eyebrow">LANGEE LIVE</span><h2>We&apos;re Between Breaks</h2><p>The stream will appear here when Langee goes live.</p></div>}
        {live&&<span className="live-chip">● LIVE</span>}
        {broadcasting&&<span className="preview-label">Your camera preview</span>}
        {audioBlocked&&<button type="button" className="audio-button" onClick={enableAudio}>🔊 Tap to enable sound</button>}
        <div className="hidden-audio" ref={audioRef}/>
      </div>
      <div className="player-meta"><span>● {live?'Streaming now':'Offline'}</span><span>👥 {watchers} watching</span></div>
      {error&&<div className="notice warning" role="alert">{error}</div>}
      {admin&&<div className="stream-controls"><div><b>Stream controls</b><small>Only your admin account can start the camera.</small></div>{broadcasting?<button className="danger" onClick={stop} disabled={busy}>END LIVE</button>:<button className="primary" onClick={start} disabled={busy}>{busy?'CONNECTING…':'● GO LIVE'}</button>}</div>}
    </section>
    <aside className="chat-panel card"><div className="chat-header"><div><span className="eyebrow">BREAK CHAT</span><h3>Talk with the Lounge</h3></div><span className="chat-status">{status==='connected'?'● Connected':status==='connecting'?'◌ Connecting':'○ Offline'}</span></div>
      <div className="chat-messages" aria-live="polite"><div className="chat-message"><b className="host-name">Langee Lounge</b><p>Welcome to the Lounge! Make an account to join chat.</p></div>
        {messages.map(m=><div className="chat-message" key={m.id}><div className="chat-user"><div className="avatar">{m.name.slice(0,1).toUpperCase()}</div><div><div className="chat-name"><b className={m.role==='host'?'host-name':''}>{m.name}</b>{m.role==='host'&&<span className="host-tag">HOST</span>}<small>{m.time}</small></div><TeamBadges userId={m.userId} assignments={assignments}/></div></div><p>{m.text}</p></div>)}<div ref={messagesEnd}/>
      </div>
      {token&&username?<form className="chat-compose" onSubmit={send}><div className="signed-in">Chatting as <b>{username}</b></div><div className="send-row"><input aria-label="Chat message" value={draft} maxLength={250} onChange={e=>setDraft(e.target.value)} disabled={status!=='connected'} placeholder={status==='connected'?'Type a message…':'Connecting…'}/><button className="primary" disabled={status!=='connected'||!draft.trim()}>SEND</button></div><small>Live messages are shared with viewers, but not stored after the stream.</small></form>:<div className="chat-compose"><p>Want to chat? Create a username or sign in.</p><button className="primary" onClick={openLogin}>SIGN IN / CREATE ACCOUNT</button></div>}
    </aside>
  </div>;
}
