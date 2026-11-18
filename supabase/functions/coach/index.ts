// Personal trainer virtuale: Edge Function che chiama Claude con il contesto reale dell'utente.
// Secrets richiesti: ANTHROPIC_API_KEY  (supabase secrets set ANTHROPIC_API_KEY=...)
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Sei "Coach", il personal trainer virtuale dell'app Forma. Rispondi sempre in italiano, in modo chiaro, concreto e motivante ma sobrio.
Regole:
- Basa ogni risposta sui DATI REALI dell'utente forniti nel contesto JSON (profilo, storico allenamenti, record, schede, nutrizione, benessere). Cita numeri concreti quando servono. Se un dato manca, dillo e spiega cosa registrare.
- Sii prudente: progressioni graduali (in genere +2,5% / +1-2,5 kg o +1 ripetizione), rispetta livello, recupero e infortuni dichiarati.
- Non formulare diagnosi mediche e non sostituire medici, fisioterapisti, personal trainer o nutrizionisti: in presenza di dolore, infortuni o condizioni cliniche invita a rivolgersi a un professionista.
- Non modificare mai le schede direttamente. Se vuoi proporre una modifica concreta a un esercizio di una scheda esistente, usa lo strumento propose_template_change: l'utente dovrà confermarla nell'app.
- Risposte brevi e scansionabili (elenchi puntati quando utili), massimo ~250 parole salvo richiesta esplicita.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'propose_template_change',
    description: "Propone una modifica a un esercizio di una scheda dell'utente (serie, ripetizioni, recupero, carico target, oppure sostituzione dell'esercizio). La modifica NON viene applicata: l'utente la vedrà come suggerimento da accettare o rifiutare.",
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        templateId: { type: 'string', description: 'id della scheda (dal contesto)' },
        exerciseUid: { type: 'string', description: "uid dell'esercizio nella scheda (dal contesto)" },
        title: { type: 'string', description: 'titolo breve del suggerimento' },
        reason: { type: 'string', description: 'motivazione basata sui dati' },
        sets: { type: ['integer', 'null'] },
        repMin: { type: ['integer', 'null'] },
        repMax: { type: ['integer', 'null'] },
        restSec: { type: ['integer', 'null'] },
        targetWeight: { type: ['number', 'null'], description: 'kg' },
        replaceExerciseId: { type: ['string', 'null'], description: "id di un esercizio della libreria per sostituirlo" },
      },
      required: ['templateId', 'exerciseUid', 'title', 'reason', 'sets', 'repMin', 'repMax', 'restSec', 'targetWeight', 'replaceExerciseId'],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    // Solo utenti autenticati
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'Non autenticato' }, 401);
    if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 503);

    const { messages, context } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[]; context: unknown };
    if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages mancante' }, 400);

    const client = new Anthropic();
    const convo: Anthropic.Beta.BetaMessageParam[] = messages.slice(-20).map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
    const system = `${SYSTEM}\n\nData odierna: ${new Date().toISOString().slice(0, 10)}\nCONTESTO UTENTE (JSON):\n${JSON.stringify(context).slice(0, 60000)}`;
    const suggestions: unknown[] = [];
    let text = '';

    for (let i = 0; i < 4; i++) {
      const res = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        tools: tools as any,
        messages: convo,
      } as any);
      if (res.stop_reason === 'refusal') { text ||= 'Non posso aiutarti con questa richiesta.'; break; }
      for (const b of res.content) if (b.type === 'text') text += b.text;
      const uses = res.content.filter((b: any) => b.type === 'tool_use') as any[];
      if (res.stop_reason !== 'tool_use' || !uses.length) break;
      convo.push({ role: 'assistant', content: res.content as any });
      convo.push({
        role: 'user',
        content: uses.map((u) => {
          suggestions.push(u.input);
          return { type: 'tool_result', tool_use_id: u.id, content: "Suggerimento registrato: l'utente lo vedrà e potrà accettarlo o rifiutarlo." };
        }),
      });
    }
    return json({ text, suggestions });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Troppe richieste, riprova tra poco.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Errore AI ${e.status}` }, 502);
    return json({ error: String(e) }, 500);
  }
});
