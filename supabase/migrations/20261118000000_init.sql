-- Forma: schema iniziale
-- Documenti utente sincronizzati (local-first). Ogni riga appartiene a un solo utente.
create table if not exists public.user_docs (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in (
    'profile','settings','meta','templates','programs','sessions','foods','diary','recipes',
    'savedMeals','mealPlans','measurements','photos','cardio','wellness','chats','suggestions',
    'notifications','badges')),
  id text not null check (char_length(id) between 1 and 120),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, collection, id)
);

create index if not exists user_docs_pull_idx on public.user_docs (user_id, server_updated_at);
create index if not exists user_docs_collection_idx on public.user_docs (user_id, collection);

-- Il cursore di sincronizzazione è sempre deciso dal server
create or replace function public.touch_user_docs() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  -- last-write-wins: non sovrascrivere una versione più recente
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists user_docs_touch on public.user_docs;
create trigger user_docs_touch before insert or update on public.user_docs
for each row execute function public.touch_user_docs();

-- Row Level Security: ogni utente vede e modifica soltanto i propri dati
alter table public.user_docs enable row level security;

drop policy if exists "own docs select" on public.user_docs;
drop policy if exists "own docs insert" on public.user_docs;
drop policy if exists "own docs update" on public.user_docs;
drop policy if exists "own docs delete" on public.user_docs;
create policy "own docs select" on public.user_docs for select using (auth.uid() = user_id);
create policy "own docs insert" on public.user_docs for insert with check (auth.uid() = user_id);
create policy "own docs update" on public.user_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own docs delete" on public.user_docs for delete using (auth.uid() = user_id);

-- Realtime per la sincronizzazione istantanea tra dispositivi
do $$ begin
  alter publication supabase_realtime add table public.user_docs;
exception when others then null; end $$;

-- Storage privato per le foto dei progressi: percorso <user_id>/<file>
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos read" on storage.objects;
drop policy if exists "own photos write" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
create policy "own photos read" on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos write" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos update" on storage.objects for update
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
