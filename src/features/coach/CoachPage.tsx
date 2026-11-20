import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles, Check, X, Trash2, Info, Cpu } from 'lucide-react';
import {
  useActiveProgram, useCardio, useChats, useDiary, useMeasurements, useProfile, useSessions, useSettings, useSuggestions, useTemplates, useWellness, saveTemplate,
} from '@/app/data';
import { useAuth } from '@/app/auth';
import { store } from '@/db/store';
import { supabase } from '@/db/supabase';
import { buildContext, localCoachReply, type CoachData } from '@/lib/coach-local';
import { PageHeader, Confirm, useToast, Chips } from '@/components/ui';
import { getExercise } from '@/data/exercises';
import { uid } from '@/lib/util';
import type { ChatMessage, ChatThread, Suggestion, WorkoutTemplate } from '@/lib/types';

const THREAD = 'main';
const PROMPTS = [
  'Come sto andando?',
  'Posso aumentare i carichi?',
  'Analizza la mia costanza',
  'Come vanno calorie e proteine?',
  'Come sta il mio recupero?',
  'Quali muscoli sto trascurando?',
];

/** Rende **grassetto** e righe; il testo resta testo (nessun HTML interpretato). */
function Rich({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => <span key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') && p.endsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : p)}{'\n'}</span>)}</>;
}

export default function CoachPage() {
  const toast = useToast();
  const { state } = useAuth();
  const profile = useProfile()!;
  const settings = useSettings();
  const program = useActiveProgram();
  const templates = useTemplates();
  const sessions = useSessions();
  const diary = useDiary();
  const wellness = useWellness();
  const measurements = useMeasurements();
  const cardio = useCardio();
  const chats = useChats();
  const suggestions = useSuggestions().filter((s) => s.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const thread: ChatThread = chats.find((c) => c.id === THREAD) ?? { id: THREAD, title: 'Coach', messages: [], updatedAt: new Date().toISOString() };
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [clear, setClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const cloud = state.status === 'ready' && state.mode === 'cloud' && !!supabase;
  const data: CoachData = { profile, settings, program, templates, sessions, diary, wellness, measurements, cardio };

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread.messages.length, busy]);

  async function persist(messages: ChatMessage[]) {
    await store.put('chats', THREAD, { ...thread, messages: messages.slice(-80), updatedAt: new Date().toISOString() });
  }
  async function storeSuggestions(list: Suggestion[]) {
    for (const s of list) if (!store.get('suggestions', s.id)) await store.put('suggestions', s.id, s);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const userMsg: ChatMessage = { id: uid('msg_'), role: 'user', content: q, createdAt: new Date().toISOString() };
    const history = [...thread.messages, userMsg];
    await persist(history);
    setBusy(true);
    let reply: ChatMessage | null = null;
    try {
      if (cloud) {
        try {
          const { data: res, error } = await supabase!.functions.invoke('coach', { body: { messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })), context: buildContext(data) } });
          if (error || !res || res.error) throw new Error(res?.error ?? error?.message ?? 'errore');
          const sugg: Suggestion[] = (res.suggestions ?? []).map((s: any) => {
            const patch: Record<string, unknown> = {};
            for (const k of ['sets', 'repMin', 'repMax', 'restSec', 'targetWeight'] as const) if (s[k] != null) patch[k] = s[k];
            if (s.replaceExerciseId && getExercise(s.replaceExerciseId)) patch.exerciseId = s.replaceExerciseId;
            return { id: uid('ai_'), kind: s.replaceExerciseId ? 'swap' : 'progression', title: String(s.title ?? 'Suggerimento del coach'), body: String(s.reason ?? ''), createdAt: new Date().toISOString(), status: 'pending', action: { type: 'update_template_exercise', templateId: s.templateId, uid: s.exerciseUid, patch } } as Suggestion;
          }).filter((s: Suggestion) => s.action && store.get<WorkoutTemplate>('templates', s.action.templateId)?.exercises.some((e) => e.uid === s.action!.uid));
          await storeSuggestions(sugg);
          reply = { id: uid('msg_'), role: 'assistant', content: String(res.text || 'Ho preparato alcune proposte qui sotto.'), createdAt: new Date().toISOString(), source: 'ai' };
        } catch {
          const r = localCoachReply(q, data);
          await storeSuggestions(r.suggestions);
          reply = { id: uid('msg_'), role: 'assistant', content: `${r.text}\n\n(Il coach AI non è raggiungibile in questo momento: risposta generata dall’analisi locale dei tuoi dati.)`, createdAt: new Date().toISOString(), source: 'local' };
        }
      } else {
        const r = localCoachReply(q, data);
        await storeSuggestions(r.suggestions);
        reply = { id: uid('msg_'), role: 'assistant', content: r.text, createdAt: new Date().toISOString(), source: 'local' };
      }
    } finally {
      if (reply) await persist([...history, reply]);
      setBusy(false);
    }
  }

  async function accept(s: Suggestion) {
    const a = s.action;
    if (a?.type === 'update_template_exercise') {
      const t = store.get<WorkoutTemplate>('templates', a.templateId);
      if (!t || !t.exercises.some((e) => e.uid === a.uid)) { toast('La scheda o l’esercizio non esistono più', 'error'); await store.put('suggestions', s.id, { ...s, status: 'dismissed' }); return; }
      await saveTemplate({ ...t, exercises: t.exercises.map((e) => (e.uid === a.uid ? { ...e, ...a.patch } : e)) });
    }
    await store.put('suggestions', s.id, { ...s, status: 'accepted' });
    toast('Modifica applicata alla scheda');
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--nav-h, 64px))' }}>
      <PageHeader title="Coach" back sub={cloud ? 'Personal trainer AI basato sui tuoi dati' : 'Analisi dei tuoi dati'} right={thread.messages.length ? <button className="icon-btn ghost" onClick={() => setClear(true)} aria-label="Cancella conversazione"><Trash2 size={18} /></button> : undefined} />
      {!cloud && (
        <div className="banner" style={{ marginBottom: 12 }}><Cpu size={18} /><span>Stai usando il coach locale: risposte basate su regole e sui tuoi dati, senza inviare nulla all’esterno. Il coach AI conversazionale si attiva con l’account cloud quando l’app è collegata al backend.</span></div>
      )}

      {suggestions.length > 0 && (
        <section className="stack-sm" style={{ marginBottom: 14 }} aria-label="Suggerimenti da confermare">
          <div className="section-title" style={{ marginTop: 0 }}>Proposte da confermare · {suggestions.length}</div>
          {suggestions.slice(0, 5).map((s) => {
            const t = s.action ? templates.find((x) => x.id === s.action!.templateId) : undefined;
            return (
              <div key={s.id} className="card" style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Sparkles size={18} className="accent" style={{ flexShrink: 0, marginTop: 2 }} /><div className="grow"><b>{s.title}</b><p className="small text-2" style={{ marginTop: 4 }}>{s.body}</p>{t && <div className="tiny muted" style={{ marginTop: 4 }}>Scheda: <Link to={`/workouts/template/${t.id}`} className="accent">{t.name}</Link></div>}</div></div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn sm grow" onClick={async () => { await store.put('suggestions', s.id, { ...s, status: 'dismissed' }); toast('Proposta ignorata', 'info'); }}><X size={15} /> Ignora</button>
                  {s.action && <button className="btn sm primary grow" onClick={() => accept(s)}><Check size={15} /> Applica</button>}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="chat grow" aria-live="polite">
        {thread.messages.length === 0 && (
          <div className="card center stack-sm" style={{ padding: 20 }}>
            <Sparkles size={28} className="accent" style={{ margin: '0 auto' }} />
            <b>Chiedimi qualcosa sui tuoi allenamenti</b>
            <p className="small text-2">Analizzo storico, record, schede, alimentazione e recupero. Le modifiche alle schede ti vengono sempre proposte: decidi tu se applicarle.</p>
          </div>
        )}
        {thread.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}><Rich text={m.content} />{m.role === 'assistant' && <span className="src">{m.source === 'ai' ? 'Coach AI' : 'Analisi locale'}</span>}</div>
        ))}
        {busy && <div className="bubble assistant typing" aria-label="Il coach sta scrivendo"><span /><span /><span /></div>}
        <div ref={end} />
      </div>

      <Chips style={{ marginBottom: 6 }}>
        {PROMPTS.map((p) => <button key={p} className="chip" disabled={busy} onClick={() => ask(p)}>{p}</button>)}
      </Chips>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input className="input grow" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Es. alternative allo squat con bilanciere" aria-label="Messaggio per il coach" maxLength={1000} />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()} aria-label="Invia"><Send size={18} /></button>
      </form>
      <p className="tiny muted center row" style={{ gap: 4, justifyContent: 'center' }}><Info size={12} /> Indicazioni generali, non sostituiscono medici, fisioterapisti o nutrizionisti.</p>
      <Confirm open={clear} onClose={() => setClear(false)} title="Cancellare la conversazione?" confirmLabel="Cancella" danger onConfirm={() => store.put('chats', THREAD, { ...thread, messages: [], updatedAt: new Date().toISOString() })} />
    </div>
  );
}
