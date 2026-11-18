// Elimina definitivamente l'account dell'utente autenticato e tutti i suoi dati.
// Richiede il secret SUPABASE_SERVICE_ROLE_KEY (disponibile di default nelle Edge Functions).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return new Response(JSON.stringify({ error: 'Non autenticato' }), { status: 401, headers: cors });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // foto private
    const { data: files } = await admin.storage.from('progress-photos').list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from('progress-photos').remove(files.map((f) => `${user.id}/${f.name}`));
    await admin.from('user_docs').delete().eq('user_id', user.id);
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
