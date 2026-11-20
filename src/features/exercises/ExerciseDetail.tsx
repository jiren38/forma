import { defaultPlanFor, isCardioExercise, templateCardio } from '@/lib/cardio';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, Plus, AlertTriangle, Wind, ListChecks, XCircle, Lightbulb, Trophy, Dumbbell, Info, Repeat, Shuffle, Target } from 'lucide-react';
import { getExercise, contentFor, variantsOf, alternativesOf, CATEGORY_LABEL, KIND_LABEL, MOVEMENT_LABEL, type Exercise } from '@/data/exercises';
import { MUSCLE_LABEL, EQUIPMENT_LABEL, INJURY_LABEL } from '@/lib/labels';
import { useMeta, useProfile, useSessions, useSettings, useTemplates, toggleFavorite, pushRecent, saveTemplate } from '@/app/data';
import { availableEquipment, prescription } from '@/lib/generator';
import { exerciseHistory, personalRecords } from '@/lib/stats';
import { PageHeader, Empty, Sheet, Segmented, useToast } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { fmtW, formatShortDate, uid, toDisplayWeight } from '@/lib/util';
import { ExerciseVisual, useExerciseMedia } from './media';
import { equipmentText } from './components';

const DIFF = ['', 'Facile', 'Intermedio', 'Avanzato'];

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const e = getExercise(id);
  const nav = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const profile = useProfile();
  const sessions = useSessions();
  const settings = useSettings();
  const templates = useTemplates();
  const [addOpen, setAddOpen] = useState(false);
  const [metric, setMetric] = useState<'e1rm' | 'weight' | 'volume' | 'reps'>('e1rm');
  const media = useExerciseMedia(e?.id);
  const [schematic, setSchematic] = useState(false);
  const units = settings.units;

  useEffect(() => { if (e) pushRecent(e.id); }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const eq = useMemo(() => (profile ? availableEquipment(profile) : undefined), [profile]);
  const hist = useMemo(() => (e ? exerciseHistory(sessions, e.id) : []), [sessions, e]);
  const pr = useMemo(() => (e ? personalRecords(sessions, e.id) : {}), [sessions, e]);

  if (!e) return <div className="page"><PageHeader title="Esercizio" back="/exercises" /><Empty icon={<Info />} title="Esercizio non trovato" action={<Link to="/exercises" className="btn">Torna alla libreria</Link>} /></div>;
  const c = contentFor(e);
  const fav = meta.favorites.includes(e.id);
  const risky = profile ? e.stress.filter((z) => profile.injuries?.includes(z)) : [];
  const available = eq ? e.equipment.every((q) => q === 'bodyweight' || eq.has(q)) : true;
  const variants = variantsOf(e);
  const alts = alternativesOf(e, eq as Set<string> | undefined);
  const weighted = e.tracking === 'weight_reps';

  async function addTo(tplId: string) {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    const p = prescription(profile?.goals ?? ['fitness'], profile?.level ?? 'beginner', e!.mechanic === 'compound', profile?.sessionStyle ?? 'long');
    // il cardio entra nella scheda con un piano (durata, velocità, pendenza, resistenza…), non con serie e ripetizioni
    const te = isCardioExercise(e) && profile ? templateCardio(e!.id, defaultPlanFor(e!.id, profile)) : { uid: uid('te_'), exerciseId: e!.id, ...p, targetWeight: null, notes: '' };
    await saveTemplate({ ...t, exercises: [...t.exercises, te] });
    setAddOpen(false);
    toast(`Aggiunto a “${t.name}”`);
  }

  const points = hist.map((h) => ({
    x: new Date(h.date).getTime(), label: formatShortDate(h.date),
    y: metric === 'e1rm' ? toDisplayWeight(h.e1rm, units)! : metric === 'weight' ? toDisplayWeight(h.bestWeight, units)! : metric === 'volume' ? toDisplayWeight(h.volume, units)! : h.totalReps,
  }));

  return (
    <div className="page stack">
      <PageHeader title={e.name} back sub={e.nameEn}
        right={<button className="icon-btn" onClick={() => { toggleFavorite(e.id); toast(fav ? 'Rimosso dai preferiti' : 'Aggiunto ai preferiti'); }} aria-pressed={fav} aria-label={fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
          <Heart size={20} fill={fav ? 'var(--accent)' : 'none'} color={fav ? 'var(--accent)' : 'currentColor'} />
        </button>} />

      <div className="ex-hero">
        <div className="stack-sm sticky-col">
          <ExerciseVisual exerciseId={e.id} preferSchematic={schematic} patternId={e.pattern} muscles={e.primary} controls label={e.name} />
          {media && <div className="segmented" role="radiogroup" aria-label="Tipo di animazione">{[['Realistica', false], ['Schematica', true]].map(([l, v]) => <button key={String(l)} role="radio" aria-checked={schematic === v} className={schematic === v ? 'on' : ''} onClick={() => setSchematic(v as boolean)}>{l as string}</button>)}</div>}
          {(!media || schematic) && <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Muscoli principali evidenziati</span></div>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary grow" onClick={() => (templates.length ? setAddOpen(true) : nav('/workouts'))}><Plus size={17} /> Aggiungi a una scheda</button>
          </div>
        </div>

        <div className="stack">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill accent">{CATEGORY_LABEL[e.category]}</span>
            <span className="pill">{KIND_LABEL[e.kind]}</span>
            <span className="pill">{MOVEMENT_LABEL[e.movement]}</span>
            <span className="pill">{DIFF[e.difficulty]}</span>
            <span className="pill">{e.mechanic === 'compound' ? 'Multiarticolare' : 'Monoarticolare'}</span>
            {e.unilateral && <span className="pill">Unilaterale</span>}
            {!available && <span className="pill orange">Attrezzatura non indicata nel profilo</span>}
          </div>

          {risky.length > 0 && (
            <div className="banner warn"><AlertTriangle size={18} /><span>Questo esercizio sollecita zone che hai segnalato ({risky.map((z) => INJURY_LABEL[z].toLowerCase()).join(', ')}). Valuta un’alternativa più confortevole e, in caso di dolore, interrompi e rivolgiti a un medico o fisioterapista.</span></div>
          )}

          <p className="text-2" style={{ lineHeight: 1.6 }}>{c.description}</p>

          <div className="card">
            <dl className="kv">
              <dt>Muscoli principali</dt><dd>{e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}</dd>
              <dt>Muscoli secondari</dt><dd>{e.secondary.length ? e.secondary.map((m) => MUSCLE_LABEL[m]).join(', ') : '–'}</dd>
              <dt>Attrezzatura</dt><dd>{equipmentText(e)}</dd>
            </dl>
          </div>

          <Section icon={<Target size={18} />} title="Posizione di partenza"><p style={{ lineHeight: 1.6 }}>{c.setup}</p></Section>
          <Section icon={<ListChecks size={18} />} title="Esecuzione passo passo"><ol className="steps">{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></Section>
          <Section icon={<Wind size={18} />} title="Respirazione"><p style={{ lineHeight: 1.6 }}>{c.breathing}</p></Section>
          <Section icon={<XCircle size={18} />} title="Errori comuni"><ul className="bullets bad">{c.mistakes.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>
          <Section icon={<Lightbulb size={18} />} title="Consigli utili"><ul className="bullets good">{c.tips.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>

          {/* Storico personale */}
          <Section icon={<Trophy size={18} />} title="I tuoi progressi">
            {hist.length === 0 ? <p className="small muted">Non hai ancora registrato questo esercizio. I record e il grafico compariranno dopo il primo allenamento.</p> : (
              <div className="stack-sm">
                <div className="grid-2">
                  {weighted && pr.weight && <div className="stat-tile"><div className="stat"><span className="l">Carico massimo</span><span className="v">{fmtW(pr.weight.value, units)}</span><span className="tiny muted">× {pr.weight.reps} · {formatShortDate(pr.weight.date)}</span></div></div>}
                  {weighted && pr.e1rm && <div className="stat-tile"><div className="stat"><span className="l">1RM stimato</span><span className="v">{fmtW(pr.e1rm.value, units)}</span><span className="tiny muted">formula di Epley</span></div></div>}
                  {pr.reps && <div className="stat-tile"><div className="stat"><span className="l">{e.tracking === 'time' ? 'Tempo massimo' : 'Ripetizioni massime'}</span><span className="v">{pr.reps.value}{e.tracking === 'time' ? ' s' : ''}</span><span className="tiny muted">{formatShortDate(pr.reps.date)}</span></div></div>}
                  {weighted && pr.volume && <div className="stat-tile"><div className="stat"><span className="l">Volume in una sessione</span><span className="v">{fmtW(pr.volume.value, units)}</span><span className="tiny muted">{formatShortDate(pr.volume.date)}</span></div></div>}
                </div>
                {hist.length >= 2 ? (
                  <>
                    {weighted && <Segmented label="Metrica" value={metric} onChange={setMetric} options={[{ value: 'e1rm', label: '1RM st.' }, { value: 'weight', label: 'Carico' }, { value: 'volume', label: 'Volume' }, { value: 'reps', label: 'Rip.' }]} />}
                    <LineChart ariaLabel={`Andamento ${e.name}`} points={weighted ? points : hist.map((h) => ({ x: new Date(h.date).getTime(), y: h.totalReps, label: formatShortDate(h.date) }))} format={(v) => (Math.round(v * 10) / 10).toString()} />
                  </>
                ) : <p className="tiny muted">Il grafico comparirà dalla seconda sessione.</p>}
                <div className="settings-group">
                  {[...hist].reverse().slice(0, 6).map((h) => (
                    <Link key={h.sessionId} to={`/session/${h.sessionId}`} className="list-item">
                      <span className="grow"><div className="li-title">{formatShortDate(h.date)}</div><div className="li-sub">{h.sets} serie · {h.totalReps} {e.tracking === 'time' ? 's' : 'rip.'}{weighted ? ` · migliore ${fmtW(h.bestWeight, units)} × ${h.bestReps}` : ''}</div></span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {variants.length > 0 && <Related title="Varianti" icon={<Repeat size={18} />} list={variants} />}
          {alts.length > 0 && <Related title="Alternative ed esercizi simili" icon={<Shuffle size={18} />} list={alts} />}
          <p className="hint">Le indicazioni tecniche sono di carattere generale. Se hai dolore, patologie o dubbi, chiedi a un professionista qualificato.</p>
        </div>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Aggiungi a una scheda">
        <div className="settings-group">
          {templates.map((t) => (
            <button key={t.id} className="list-item" onClick={() => addTo(t.id)}>
              <span className="li-icon"><Dumbbell size={18} /></span>
              <span className="grow"><div className="li-title">{t.name}</div><div className="li-sub">{t.exercises.length} esercizi{t.exercises.some((x) => x.exerciseId === e.id) ? ' · già presente' : ''}</div></span>
              <Plus size={18} className="muted" />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-title"><h3>{icon} {title}</h3></div>
      <div className="text-2">{children}</div>
    </section>
  );
}

function Related({ title, icon, list }: { title: string; icon: React.ReactNode; list: Exercise[] }) {
  const nav = useNavigate();
  return (
    <section>
      <div className="section-title" style={{ marginTop: 6 }}><span className="row" style={{ gap: 6 }}>{icon} {title}</span></div>
      <div className="hscroll">
        {list.map((x) => (
          <button key={x.id} className="ex-card" onClick={() => nav(`/exercises/${x.id}`)}>
            <ExerciseVisual exerciseId={x.id} patternId={x.pattern} muscles={x.primary} className="thumb" label={x.name} />
            <span className="n">{x.name}</span>
            <span className="tiny muted">{EQUIPMENT_LABEL[x.equipment.find((q) => q !== 'bodyweight') ?? 'bodyweight']}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
