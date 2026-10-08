-- Langee Lounge: paste this entire file into Supabase SQL Editor and run ONCE.
-- All changes from the website go through authenticated server routes.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create or replace function public.create_langee_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare handle text;
begin
  handle := lower(trim(coalesce(new.raw_user_meta_data ->> 'username','')));
  if handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must have 3 to 20 letters, numbers, or underscores';
  end if;
  insert into public.profiles (id,username) values (new.id,handle);
  return new;
end;
$$;
drop trigger if exists on_langee_auth_signup on auth.users;
create trigger on_langee_auth_signup after insert on auth.users
for each row execute procedure public.create_langee_profile();

create table if not exists public.breaks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check(status in ('current','past')) default 'current',
  scheduled_date date,
  replay_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists one_current_langee_break on public.breaks (status) where status='current';
insert into public.breaks (name,status)
select 'Football Break #1','current'
where not exists(select 1 from public.breaks where status='current');

create table if not exists public.team_assignments (
  break_id uuid not null references public.breaks(id) on delete cascade,
  team_code text not null check (team_code in (
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB',
    'HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG',
    'NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'
  )),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (break_id,team_code)
);
create index if not exists team_assignments_user_idx on public.team_assignments(user_id);

create table if not exists public.hits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  team text,
  customer text,
  break_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.breaks enable row level security;
alter table public.team_assignments enable row level security;
alter table public.hits enable row level security;

-- Usernames are public (the chat displays them); email/password remain private in auth.users.
drop policy if exists "public profile names" on public.profiles;
create policy "public profile names" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "public breaks" on public.breaks;
create policy "public breaks" on public.breaks for select to anon, authenticated using (true);
drop policy if exists "public team assignments" on public.team_assignments;
create policy "public team assignments" on public.team_assignments for select to anon, authenticated using (true);
drop policy if exists "public hits" on public.hits;
create policy "public hits" on public.hits for select to anon, authenticated using (true);

-- No client-side INSERT/UPDATE/DELETE policies: only the verified server-side admin can write.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hit-photos','hit-photos',true,5000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5000000, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- Object uploads performed by server service role. No public upload/write policy.
