'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {BY_CODE,TEAMS,logo,type TeamAssignment} from '@/lib/teams';
import {supabaseBrowser} from '@/lib/supabase';

type Message = {id:string;user_id:string;username:string;role:'host'|'viewer';body:string;created_at:string};
type Props={token:string|null;username:string|null;assignments:Record<string,TeamAssignment>;openLogin:()=>void};
const when=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function mergeMessages(current:Message[],incoming:Message[]):Message[]{
  const byId=new Map(current.map(message=>[message.id,message]));
  for(const item of incoming)if(item?.id && typeof item.body==='string')byId.set(item.id,item);
  return [...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-100);
}
function TeamBadges({userId,assignments}:{userId:string;assignments:Props['assignments']}){
  const [expanded,setExpanded]=useState(false);
  const codes=TEAMS.filter(team=>assignments[team.code]?.userId===userId).map(team=>team.code);
  if(!codes.length)return null;
  return <span className="team-badges">
    {codes.length===1?<span className="single-team"><img src={logo(codes[0])} alt=""/><span>{BY_CODE[codes[0]].name}</span></span>:<>
      {codes.slice(0,3).map(code=><img className="team-badge-logo" src={logo(code)} title={BY_CODE[code].name} alt={BY_CODE[code].name} key={code}/>)}
      {codes.length>3&&<button type="button" className="more-teams" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>+{codes.length-3}</button>}
      {expanded&&<span className="badge-popup"><b>Teams in this break</b>{codes.map(code=><span key={code}><img src={logo(code)} alt=""/>{BY_CODE[code].name}</span>)}</span>}
    </>}
  </span>;
}
export default function LoungeChat({token,username,assignments,openLogin}:Props){
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [subscribed,setSubscribed]=useState(false);
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const scrollBottom=useRef<HTMLDivElement>(null);
  const lastSent=useRef(0);
  const append=useCallback((message:Message)=>setMessages(current=>mergeMessages(current,[message])),[]);

  useEffect(()=>{
    const db=supabaseBrowser();
    if(!db){setError('Chat is not configured.');return;}
    let closed=false;
    // Subscribe before fetching history; the ID merge prevents missed or duplicate messages.
    const channel=db.channel('langee-chat-database-v1')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'lounge_chat_messages'},payload=>{
        if(!closed)append(payload.new as Message);
      })
      .subscribe(state=>{
        if(closed)return;
        setSubscribed(state==='SUBSCRIBED');
        if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')setError('Chat reconnecting. Refresh if messages stop updating.');
        if(state==='SUBSCRIBED')setError('');
      });
    void fetch('/api/chat/messages',{cache:'no-store'})
      .then(async response=>{
        const data=await response.json() as {messages?:Message[];error?:string};
        if(!response.ok)throw new Error(data.error||'Could not load chat.');
        if(!closed)setMessages(previous=>mergeMessages(previous,data.messages||[]));
      })
      .catch(e=>{if(!closed)setError(e instanceof Error?e.message:'Could not load chat.');});
    return ()=>{closed=true;void db.removeChannel(channel);};
  },[append]);

  useEffect(()=>{scrollBottom.current?.scrollIntoView({block:'nearest'});},[messages]);
  async function send(event:FormEvent){
    event.preventDefault();
    const body=draft.trim();
    const db=supabaseBrowser();
    if(!body||!token||!username||sending||Date.now()-lastSent.current<1000||!db)return;
    setSending(true);setError('');
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session)throw new Error('Please sign in again to chat.');
      const response=await fetch('/api/chat/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({body})});
      const result=await response.json() as {message?:Message;error?:string};
      if(!response.ok||!result.message)throw new Error(result.error||'Could not send message.');
      lastSent.current=Date.now();
      append(result.message); // The realtime event will be de-duplicated automatically.
      setDraft('');
    }catch(e){setError(e instanceof Error?e.message:'Could not send message.');}
    finally{setSending(false);}
  }
  return <aside className="chat-panel card">
    <div className="chat-header"><div><span className="eyebrow">BREAK CHAT</span><h3>Talk with the Lounge</h3></div><span className="chat-status">{subscribed?'● Connected':'◌ Connecting'}</span></div>
    <div className="chat-messages" aria-live="polite"><div className="chat-message"><b className="host-name">Langee Lounge</b><p>Welcome to the Lounge! Make an account to join chat.</p></div>
      {messages.map(m=><div className="chat-message" key={m.id}><div className="chat-user"><div className="avatar">{m.username.slice(0,1).toUpperCase()}</div><div><div className="chat-name"><b className={m.role==='host'?'host-name':''}>{m.username}</b>{m.role==='host'&&<span className="host-tag">HOST</span>}<small>{when(m.created_at)}</small></div><TeamBadges userId={m.user_id} assignments={assignments}/></div></div><p>{m.body}</p></div>)}<div ref={scrollBottom}/>
    </div>
    {error&&<div className="notice warning" role="status" style={{margin:'6px 12px',padding:'8px 10px'}}>{error}</div>}
    {token&&username?<form className="chat-compose" onSubmit={send}><div className="signed-in">Chatting as <b>{username}</b></div><div className="send-row"><input aria-label="Chat message" value={draft} maxLength={250} onChange={e=>setDraft(e.target.value)} placeholder="Type a message…"/><button className="primary" disabled={sending||!draft.trim()}>{sending?'SENDING…':'SEND'}</button></div><small>Chat is shared live and recent messages remain available after refreshing.</small></form>:<div className="chat-compose"><p>Want to chat? Create a username or sign in.</p><button type="button" className="primary" onClick={openLogin}>SIGN IN / CREATE ACCOUNT</button></div>}
  </aside>;
}
