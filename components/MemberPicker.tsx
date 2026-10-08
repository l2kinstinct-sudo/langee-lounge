'use client';

import {useEffect, useId, useRef, useState} from 'react';

type Member = {username: string};
type Props = {
  teamName: string;
  accessToken: string;
  value: string;
  onSelect: (username: string) => void;
  disabled?: boolean;
};

/** Accessible expandable member list. Only the verified admin can query accounts. */
export default function MemberPicker({teamName, accessToken, value, onSelect, disabled=false}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open || !accessToken) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({search: search.trim()});
        const response = await fetch(`/api/admin/users?${params}`, {
          headers: {Authorization: `Bearer ${accessToken}`},
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json() as {users?: Member[], error?: string};
        if (!response.ok) throw new Error(result.error || 'Could not load members.');
        if (!controller.signal.aborted) setMembers(result.users || []);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Could not load members.');
          setMembers([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 180 : 0);
    return () => {clearTimeout(timer); controller.abort();};
  }, [open, search, accessToken]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function handlePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [open]);

  function choose(username: string) {
    onSelect(username);
    setOpen(false);
    setSearch('');
  }

  return <div ref={containerRef} style={{minWidth:145, flex:'1 1 170px', maxWidth:240}}>
    <button
      type="button"
      className="secondary"
      disabled={disabled}
      aria-expanded={open}
      aria-controls={listId}
      aria-label={`Choose registered member for ${teamName}`}
      onClick={() => {setOpen(!open); if (!open) setSearch('');}}
      style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:7,textAlign:'left',minWidth:0}}
    >
      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{value ? `@${value}` : 'Select member'}</span>
      <span aria-hidden="true">{open?'▴':'▾'}</span>
    </button>
    {open && <div id={listId} style={{marginTop:7,padding:8,border:'1px solid #386a48',borderRadius:12,background:'#0b2013',boxShadow:'0 8px 20px #0008'}}>
      <input
        ref={inputRef}
        type="search"
        value={search}
        aria-label={`Search registered members for ${teamName}`}
        placeholder="Search usernames…"
        onChange={event => setSearch(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {event.preventDefault();setOpen(false);}
          if (event.key === 'Enter' && members.length === 1 && !loading) {event.preventDefault();choose(members[0].username);}
        }}
        style={{width:'100%',minWidth:0,boxSizing:'border-box'}}
      />
      <div style={{maxHeight:200,overflowY:'auto',marginTop:7,display:'grid',gap:3}}>
        {loading && <small style={{padding:8}}>Searching…</small>}
        {!loading && error && <small role="alert" style={{padding:8,color:'#ffb9b9'}}>{error}</small>}
        {!loading && !error && members.length === 0 && <small style={{padding:8}}>No registered members found.</small>}
        {!loading && !error && members.map(member => <button
          type="button"
          key={member.username}
          onClick={() => choose(member.username)}
          style={{textAlign:'left',padding:'10px 9px',borderRadius:8,background:member.username===value?'#255b37':'#173322',color:'#ecfff2',border:'1px solid #34583e',fontWeight:700,overflowWrap:'anywhere'}}
        >{member.username===value?'✓ ':''}@{member.username}</button>)}
      </div>
      {!loading && !error && members.length === 50 && <small style={{display:'block',padding:'7px 3px 2px',color:'#a5c6ac'}}>Search to find more members.</small>}
    </div>}
  </div>;
}
