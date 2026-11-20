-- I progetti Supabase recenti non concedono più in automatico i permessi sulle nuove tabelle.
-- Gli utenti autenticati devono poter leggere e scrivere user_docs (le regole RLS limitano comunque ai propri dati).
grant select, insert, update, delete on table public.user_docs to authenticated;
