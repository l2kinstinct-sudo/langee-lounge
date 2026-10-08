'use client';

import {useCallback,useEffect,useState,type FormEvent,type ChangeEvent} from 'react';
import {type Session} from '@supabase/supabase-js';
import LiveStage from '@/components/LiveStage';
import {supabaseBrowser} from '@/lib/supabase';
import {TEAMS,logo,type LoungeState,type BreakData} from '@/lib/teams';

const db=supabaseBrowser();
type Tab='home'|'breaks'|'hits';
type Identity={id:string;email:string;username:string};

export default function HomePage(){
  const [tab,setTab]=useState<Tab>('home');
  const [session,setSession]=useState<Session|null>(null);
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [admin,setAdmin]=useState(false);
  const [authReady,setAuthReady]=useState(false);
  const [authOpen,setAuthOpen]=useState(false);
  const [register,setRegister]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [handle,setHandle]=useState('');
  const [authBusy,setAuthBusy]=useState(false);
  const [authError,setAuthError]=useState('');
  const [state,setState]=useState<LoungeState>({current:null,breaks:[],assignments:{},hits:[]});
  const [stateError,setStateError]=useState('');
  const [banner,setBanner]=useState('');
  const [teamUser,setTeamUser]=useState<Record<string,string>>({});
  const [breakName,setBreakName]=useState('');
  const [breakDate,setBreakDate]=useState('');
  const [breakReplay,setBreakReplay]=useState('');
  const [image,setImage]=useState<File|null>(null);
  const [hitName,setHitName]=useState('');
  const [hitTeam,setHitTeam]=useState('');
  const [hitCustomer,setHitCustomer]=useState('');
  const [hitBreak,setHitBreak]=useState('');
  const [adminBusy,setAdminBusy]=useState(false);

  const refresh=useCallback(async()=>{
    try{
      const res=await fetch('/api/state',{cache:'no-store'});
      const json=await res.json() as LoungeState & {error?:string};
      if(!res.ok)throw new Error(json.error || 'Unable to load lounge data.');
      setState(json);setStateError('');
    }catch(e){setStateError(e instanceof Error?e.message:'Site data unavailable.');}
  },[]);

  useEffect(()=>{
    void refresh();
    const interval=window.setInterval(()=>void refresh(),12000);
    return ()=>window.clearInterval(interval);
  },[refresh]);

  useEffect(()=>{
    if(!db){setAuthReady(true);return;}
    void db.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true);});
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!session){setIdentity(null);setAdmin(false);return;}
    let cancelled=false;
    void fetch('/api/me',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'})
      .then(r=>r.json()).then(d=>{if(!cancelled){setIdentity(d.user || null);setAdmin(Boolean(d.isAdmin));}})
      .catch(()=>{if(!cancelled){setIdentity(null);setAdmin(false);}});
    return ()=>{cancelled=true;};
  },[session?.access_token]);

  const notify=(message:string)=>{setBanner(message);setTimeout(()=>setBanner(old=>old===message?'':old),6000);};
  async function authenticate(event:FormEvent){
    event.preventDefault();setAuthBusy(true);setAuthError('');
    if(!db){setAuthError('Supabase must be configured in Vercel first.');setAuthBusy(false);return;}
    try{
      if(register){
        const username=handle.trim().toLowerCase();
        if(!/^[a-z0-9_]{3,20}$/.test(username))throw new Error('Username: 3–20 letters, numbers, or underscores.');
        if(password.length<8)throw new Error('Password must be at least 8 characters.');
        const {data,error}=await db.auth.signUp({email:email.trim(),password,options:{data:{username}}});
        if(error)throw error;
        if(data.session){setAuthOpen(false);notify('Account created! Welcome to the Lounge.');}
        else{setAuthOpen(false);notify('Check your email to confirm your account, then sign in.');}
      }else{
        const {error}=await db.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;
        setAuthOpen(false);notify('You are signed in.');
      }
      setPassword('');
    }catch(e){setAuthError(e instanceof Error?e.message:'Account request failed.');}
    finally{setAuthBusy(false);}
  }
  async function logout(){await db?.auth.signOut();setSession(null);setIdentity(null);setAdmin(false);notify('Signed out.');}

  async function adminPost(url:string,data:object|FormData){
    if(!session?.access_token)throw new Error('Please sign back in.');
    const isForm=data instanceof FormData;
    const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,...(isForm?{}:{'Content-Type':'application/json'})},body:isForm?data:JSON.stringify(data)});
    const json=await res.json() as {error?:string};
    if(!res.ok)throw new Error(json.error||'Request failed.');
    await refresh();
  }
  async function assign(team:string,remove=false){
    if(adminBusy)return;
    if(remove && !window.confirm(`Remove ${state.assignments[team]?.username} from ${team}?`))return;
    if(!remove && !teamUser[team]?.trim()){notify('Enter a registered username first.');return;}
    setAdminBusy(true);
    try{await adminPost('/api/admin/team',{team,username:teamUser[team] || '',remove});notify(remove?'Team is available again.':'Team assigned successfully.');}
    catch(e){notify(e instanceof Error?e.message:'Unable to update team.');}
    finally{setAdminBusy(false);}
  }
  async function newBreak(event:FormEvent){
    event.preventDefault();
    if(!window.confirm('Start a new break? The current break moves to Past Breaks and all 32 team spots become available.'))return;
    setAdminBusy(true);
    try{await adminPost('/api/admin/break',{name:breakName,date:breakDate,replay:breakReplay});setBreakName('');setBreakDate('');setBreakReplay('');notify('New break is live. All teams reset.');}
    catch(e){notify(e instanceof Error?e.message:'Could not create break.');}
    finally{setAdminBusy(false);}
  }
  async function publishHit(event:FormEvent){
    event.preventDefault();if(!image)return;
    const form=new FormData();form.append('image',image);form.append('name',hitName);form.append('team',hitTeam);form.append('customer',hitCustomer);form.append('break',hitBreak);
    setAdminBusy(true);
    try{await adminPost('/api/admin/hit',form);notify('Hit published to the Lounge.');setImage(null);setHitName('');setHitTeam('');setHitCustomer('');setHitBreak('');
      const el=document.getElementById('hit-image') as HTMLInputElement|null;if(el)el.value='';}
    catch(e){notify(e instanceof Error?e.message:'Unable to publish hit.');}
    finally{setAdminBusy(false);}
  }
  const count=Object.keys(state.assignments).length;
  return <>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={()=>setTab('home')}>LANGEE <span>LOUNGE</span><small>THE BREAK ROOM · FOOTBALL CARDS</small></button><div className="header-actions">{identity?<><span className="welcome">👤 {identity.username}{admin?' · ADMIN':''}</span><button className="secondary" onClick={logout}>LOG OUT</button></>:<button className="primary" onClick={()=>setAuthOpen(true)}>SIGN IN / JOIN</button>}</div></div></header>
    <main className="site-container"><nav className="main-nav" aria-label="Main navigation"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}>⌂ Home</button><button className={tab==='breaks'?'active':''} onClick={()=>setTab('breaks')}>🏈 Breaks</button><button className={tab==='hits'?'active':''} onClick={()=>setTab('hits')}>🔥 Hits</button></nav>
    {banner&&<div className="notice" role="status">{banner}</div>}
    {stateError&&<div className="notice warning" role="status">Database setup pending: {stateError} <span>Existing site data was not changed.</span></div>}
    {tab==='home'&&<>
      <section className="intro"><div><span className="eyebrow">WELCOME TO THE LOUNGE</span><h1>Break night starts here<span>.</span></h1><p>Football breaks, big hits, and the crew together in one place.</p></div><div className="intro-pill">● THE HOME OF LANGEE BREAKS</div></section>
      {authReady&&<LiveStage admin={admin} token={session?.access_token||null} username={identity?.username||null} userId={identity?.id||null} assignments={state.assignments} openLogin={()=>setAuthOpen(true)}/>}
      <div className="content-split"><section className="teams-section"><div className="section-heading"><div><span className="eyebrow">CURRENT BREAK</span><h2>🏈 {state.current?.name||'Football Breaks'}</h2><p>All 32 NFL teams · one spot per team</p></div><div className="spot-counter">{32-count}<span> / 32 OPEN</span></div></div>
      <div className="team-grid">{TEAMS.map(team=>{const owner=state.assignments[team.code];return <article key={team.code} className={`team-card ${owner?'assigned':''}`}><div className="team-identity"><img loading="lazy" src={logo(team.code)} alt={`${team.name} logo`}/><div><b>{team.name}</b><small>{owner?`ASSIGNED · ${owner.username}`:'AVAILABLE'}</small></div></div><div className={`spot-tag ${owner?'taken':''}`}>{owner?'TAKEN':'1 SPOT'}</div></article>;})}</div><p className="muted">Teams are assigned by Langee to registered accounts. There is no checkout or payment system on this website.</p>
      </section><aside className="side-stack"><section className="card pond-card"><span className="eyebrow">THE DUCK POND</span><div className="pond-icon">🦆</div><h3>Waiting for the race</h3><p>The separate pond livestream will show here once the Discord stream connection is built.</p><span className="pill">COMING NEXT</span></section><section className="card about-card"><span className="eyebrow">ABOUT THE LOUNGE</span><h3>Pull up a chair.</h3><p>Watch the breaks here. Create a free username to join chat and show your assigned teams next to your name.</p><p>🎥 On-site streaming</p><p>💬 Real account-based live chat</p><p>🏈 All 32 NFL teams</p></section></aside></div>
      {admin&&<section className="card admin-section"><div className="section-heading"><div><span className="eyebrow">ADMIN · TEAM MANAGER</span><h2>Give / remove teams</h2><p>Assign a team by the member&apos;s exact username. Updates appear for everyone.</p></div></div><div className="admin-team-list">{TEAMS.map(team=><div className="admin-team-row" key={team.code}><div className="admin-team-info"><img src={logo(team.code)} alt=""/><div><b>{team.name}</b><small>{state.assignments[team.code]?.username||'Available'}</small></div></div><div className="admin-actions"><input aria-label={`Username for ${team.name}`} value={teamUser[team.code]||''} placeholder="Username" onChange={e=>setTeamUser(old=>({...old,[team.code]:e.target.value}))}/><button className="primary small" disabled={adminBusy} onClick={()=>void assign(team.code)}>GIVE</button><button className="danger small" disabled={adminBusy||!state.assignments[team.code]} onClick={()=>void assign(team.code,true)}>REMOVE</button></div></div>)}</div></section>}
    </>}
    {tab==='breaks'&&<section className="standalone"><span className="eyebrow">FOOTBALL BREAKS</span><h1>Breaks & replays</h1><p className="lead">Current and past breaks. A new break resets all 32 spots without deleting history.</p><div className="section-heading"><h2>Current break</h2></div><div className="breaks-grid">{state.current?<BreakCard value={state.current}/>:<div className="empty-panel">No current break yet.</div>}</div><div className="section-heading push-down"><h2>Past breaks</h2></div><div className="breaks-grid">{state.breaks.filter(b=>b.status==='past').length?state.breaks.filter(b=>b.status==='past').map(b=><BreakCard key={b.id} value={b}/>):<div className="empty-panel">Past breaks will appear here.</div>}</div>
    {admin&&<form className="card admin-form" onSubmit={newBreak}><span className="eyebrow">ADMIN</span><h3>Start new break</h3><p>The current break becomes a past break. Teams start available.</p><input required minLength={3} placeholder="Football Break #2" value={breakName} onChange={e=>setBreakName(e.target.value)}/><input type="date" value={breakDate} onChange={e=>setBreakDate(e.target.value)}/><input type="url" placeholder="Replay URL for new break (optional)" value={breakReplay} onChange={e=>setBreakReplay(e.target.value)}/><button className="primary" disabled={adminBusy}>START NEW BREAK</button></form>}
    </section>}
    {tab==='hits'&&<section className="standalone"><span className="eyebrow">THE WALL OF FIRE</span><h1>🔥 Big hits</h1><p className="lead">Biggest pulls from the Langee Lounge.</p>{state.hits.length?<><article className="card featured-hit"><img src={state.hits[0].image_url} alt={state.hits[0].name}/><div><span className="eyebrow">FEATURED HIT</span><h2>{state.hits[0].name}</h2><p>{[state.hits[0].break_name,state.hits[0].team].filter(Boolean).join(' · ')}</p><p>{state.hits[0].customer?`Pulled by ${state.hits[0].customer}`:''}</p></div></article><div className="hits-grid">{state.hits.slice(1).map(hit=><article className="card hit-card" key={hit.id}><img src={hit.image_url} alt={hit.name}/><div><b>{hit.name}</b><small>{[hit.break_name,hit.team].filter(Boolean).join(' · ')}</small></div></article>)}</div></>:<div className="empty-panel big-empty"><h2>🏆 The hit wall is waiting</h2><p>Langee can publish the first pull from his admin account.</p></div>}
      {admin&&<form className="card admin-form" onSubmit={publishHit}><span className="eyebrow">ADMIN</span><h3>Publish a hit</h3><label>Card photo (JPG, PNG, WebP; max 5 MB)<input type="file" id="hit-image" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e:ChangeEvent<HTMLInputElement>)=>setImage(e.target.files?.[0]||null)}/></label><input required placeholder="Card / hit name" value={hitName} onChange={e=>setHitName(e.target.value)}/><input placeholder="Break number" value={hitBreak} onChange={e=>setHitBreak(e.target.value)}/><input placeholder="NFL team" value={hitTeam} onChange={e=>setHitTeam(e.target.value)}/><input placeholder="Customer (optional)" value={hitCustomer} onChange={e=>setHitCustomer(e.target.value)}/><button className="primary" disabled={adminBusy}>PUBLISH HIT</button></form>}
    </section>}
    </main>
    <footer>LANGEE <span>LOUNGE</span> <small>Wear your team. Bring the crew.</small></footer>
    {authOpen&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAuthOpen(false);}}><section className="card auth-dialog" role="dialog" aria-modal="true" aria-label={register?'Create account':'Sign in'}><button className="close" aria-label="Close" onClick={()=>setAuthOpen(false)}>✕</button><span className="eyebrow">YOUR LOUNGE ACCOUNT</span><h2>{register?'Create your username':'Welcome back'}</h2><p>{register?'Sign up so everyone knows who you are in chat.':'Sign in to chat and show your teams.'}</p><form onSubmit={authenticate}>{register&&<label>Username<input required minLength={3} maxLength={20} autoComplete="username" value={handle} onChange={e=>setHandle(e.target.value)} placeholder="CardCollector22"/></label>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength={register?8:1} type="password" autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{authError&&<div className="notice warning" role="alert">{authError}</div>}<button className="primary" disabled={authBusy}>{authBusy?'ONE MOMENT…':register?'CREATE ACCOUNT':'SIGN IN'}</button></form><button className="auth-switch" onClick={()=>{setRegister(!register);setAuthError('');}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button></section></div>}
  </>;
}

function BreakCard({value}:{value:BreakData}){return <article className="card break-card"><span className="eyebrow">{value.status==='current'?'CURRENT BREAK':'PAST BREAK'}</span><h3>{value.name}</h3><div className="break-info"><span>📅 {value.scheduled_date||'Date TBD'}</span><span>🏈 32 NFL teams</span></div>{value.replay_url?<a href={value.replay_url} target="_blank" rel="noreferrer">▶ WATCH REPLAY</a>:<p className="muted">Replay not available yet.</p>}</article>;}
