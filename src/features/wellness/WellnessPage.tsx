import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Droplets, Footprints, HeartPulse, RefreshCw, Moon, BatteryMedium, Brain, Smile, Activity, ChevronLeft, ChevronRight, Bell, Info, Minus, Plus, StretchHorizontal } from 'lucide-react';
import { useCardio, useMeta, useSessions, useSettings, useWellness } from '@/app/data';
import { runHealthShortcut } from '@/features/health/HealthPage';
import { store } from '@/db/store';
import { readiness } from '@/lib/insights';
import { muscleSets, completedSessions } from '@/lib/stats';
import { MAIN_MUSCLES, MUSCLE_LABEL } from '@/lib/labels';
import { addDays, dayKey, fmtN, formatLongDate, fromKey } from '@/lib/util';
import { SectionHero } from '@/design/SectionHero';
import { PageHeader, Ring, NumberInput, useToast } from '@/components/ui';
import { BarChart } from '@/components/charts';
import type { MuscleGroup, WellnessDay } from '@/lib/types';

const SCALE = [1, 2, 3, 4, 5];
const SORE = ['Nessuno', 'Lieve', 'Medio', 'Forte'];

function hoursBetween(bed?: string | null, wake?: string | null) {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let d = wh * 60 + wm - (bh * 60 + bm);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 4) / 4;
}

export default function WellnessPage() {
  const toast = useToast();
  const [date, setDate] = useState(dayKey());
  // apertura diretta di una sezione (dal riepilogo giornaliero in Home): ?focus=water|sleep|checkin
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const f = sp.get('focus');
    if (!f) return;
    const el = document.getElementById(`w-${f}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('focus-flash');
      setTimeout(() => el.classList.remove('focus-flash'), 2200);
    }
    setSp({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = useSettings();
  const wellness = useWellness();
  const sessions = useSessions();
  const cardio = useCardio();
  const health = useMeta().health;
  const w: WellnessDay = wellness.find((x) => x.date === date) ?? { id: date, date, waterMl: 0 };
  const patch = (p: Partial<WellnessDay>) => store.put('wellness', date, { ...w, ...(store.get<WellnessDay>('wellness', date) ?? {}), ...p, id: date, date });
  const r = readiness(w, sessions, settings.sleepGoalH, cardio);
  const isToday = date === dayKey();
  const last7 = Array.from({ length: 7 }, (_, i) => { const k = dayKey(addDays(fromKey(date), i - 6)); return { k, d: wellness.find((x) => x.date === k) }; });
  const stepDays = last7.filter((x) => x.d?.steps != null && x.k !== dayKey());
  const stepsAvg = stepDays.length ? Math.round(stepDays.reduce((a, x) => a + (x.d!.steps ?? 0), 0) / stepDays.length) : null;
  const recent = muscleSets(sessions, 3);
  const lastSession = completedSessions(sessions).slice(-1)[0];
  const daysSince = lastSession ? Math.round((Date.now() - new Date(lastSession.startedAt).getTime()) / 86400000) : null;

  // Indicazioni di recupero: regole prudenti, nessuna diagnosi
  const tips: string[] = [];
  if (w.sleepHours != null && w.sleepHours < settings.sleepGoalH - 1) tips.push('Hai dormito meno del tuo obiettivo: oggi privilegia una sessione moderata e cerca di anticipare l’orario in cui vai a letto.');
  if ((w.waterMl ?? 0) < settings.waterGoalMl * 0.5 && isToday && new Date().getHours() >= 15) tips.push('Sei sotto metà dell’obiettivo d’acqua: bevi regolarmente nel resto della giornata.');
  const sore = Object.entries(w.soreness ?? {}).filter(([, v]) => (v ?? 0) >= 2).map(([k]) => k as MuscleGroup);
  if (sore.length) tips.push(`Indolenzimento marcato a: ${sore.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}. Se possibile allena altri distretti o fai lavoro leggero e mobilità su queste zone.`);
  const heavy = (Object.entries(recent) as [MuscleGroup, number][]).filter(([, v]) => v >= 8).map(([k]) => k);
  if (heavy.length) tips.push(`Negli ultimi 3 giorni hai lavorato molto su ${heavy.slice(0, 3).map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}: lascia 48-72 ore prima di caricarli di nuovo intensamente.`);
  if (w.stress != null && w.stress >= 4) tips.push('Stress elevato: una camminata, esercizi di respirazione o stretching leggero possono aiutare. Un allenamento molto intenso può non essere la scelta migliore oggi.');
  if (daysSince !== null && daysSince >= 6) tips.push(`Sono passati ${daysSince} giorni dall’ultimo allenamento: riprendi gradualmente.`);
  if (!tips.length && r.score !== null) tips.push('Nessun segnale particolare: segui il programma e ascolta le sensazioni durante l’allenamento.');

  return (
    <div className="page stack">
      <SectionHero section="wellness" compact title="Benessere" desc="Sonno, idratazione, energia e indolenzimento: il recupero fa parte dei progressi."
        actions={<Link to="/exercises?cat=mobility" className="btn"><StretchHorizontal size={17} /> Mobilità e stretching</Link>} />
      <div className="date-nav">
        <button className="icon-btn ghost" onClick={() => setDate(dayKey(addDays(fromKey(date), -1)))} aria-label="Giorno precedente"><ChevronLeft size={20} /></button>
        <div className="center"><b>{isToday ? 'Oggi' : formatLongDate(fromKey(date))}</b>{isToday && <div className="tiny muted">{formatLongDate(fromKey(date))}</div>}</div>
        <button className="icon-btn ghost" disabled={isToday} onClick={() => setDate(dayKey(addDays(fromKey(date), 1)))} aria-label="Giorno successivo"><ChevronRight size={20} /></button>
      </div>

      <div className="desk-2">
        <div className="stack">
          <section className="card">
            <div className="row" style={{ gap: 16 }}>
              <Ring value={r.score ?? 0} max={100} size={96} stroke={9} color={r.tone === 'good' ? 'var(--success)' : r.tone === 'ok' ? 'var(--warning)' : r.tone === 'low' ? 'var(--danger)' : 'var(--surface-3)'}>
                <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{r.score ?? '–'}</div>
              </Ring>
              <div className="grow"><h3>{r.label}</h3><p className="small text-2" style={{ marginTop: 4 }}>{r.advice}</p></div>
            </div>
            {r.factors.length > 0 && <ul className="bullets small" style={{ marginTop: 10 }}>{r.factors.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </section>

          <section className="card">
            <div className="card-title"><h3><Activity size={18} /> Indicazioni per il recupero</h3></div>
            {tips.length ? <ul className="bullets text-2">{tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="small muted">Registra sonno, energia e indolenzimento per ricevere indicazioni.</p>}
            <p className="hint" style={{ marginTop: 10 }}>Indicazioni generali, non mediche. Dolore persistente, articolare o acuto va valutato da un medico o fisioterapista.</p>
          </section>

          {/* Acqua */}
          <section className="card" id="w-water">
            <div className="card-title"><h3><Droplets size={18} color="var(--blue)" /> Acqua</h3><Link to="/settings" className="link"><Bell size={14} /> Promemoria</Link></div>
            <div className="row" style={{ gap: 16 }}>
              <Ring value={w.waterMl} max={settings.waterGoalMl} size={96} stroke={9} color="var(--blue)"><div><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{fmtN(w.waterMl / 1000, 2)} L</div><div className="tiny muted">di {fmtN(settings.waterGoalMl / 1000, 1)} L</div></div></Ring>
              <div className="col grow" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm grow" onClick={() => { patch({ waterMl: w.waterMl + 250 }); toast('+250 ml'); }}><Plus size={14} /> 250 ml</button>
                  <button className="btn sm grow" onClick={() => { patch({ waterMl: w.waterMl + 500 }); toast('+500 ml'); }}><Plus size={14} /> 500 ml</button>
                </div>
                <button className="btn sm ghost" disabled={w.waterMl <= 0} onClick={() => patch({ waterMl: Math.max(0, w.waterMl - 250) })}><Minus size={14} /> Togli 250 ml</button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}><BarChart ariaLabel="Acqua negli ultimi 7 giorni" height={110} color="var(--blue)" data={last7.map((x) => ({ label: fromKey(x.k).toLocaleDateString('it-IT', { weekday: 'narrow' }), value: (x.d?.waterMl ?? 0) / 1000, tip: `${fmtN((x.d?.waterMl ?? 0) / 1000, 1)} L` }))} highlightLast /></div>
          </section>

          {/* Passi (da Apple Salute) */}
          <section className="card" id="w-steps">
            <div className="card-title"><h3><Footprints size={18} color="var(--orange)" /> Passi</h3><Link to="/salute" className="link"><HeartPulse size={14} /> Apple Salute</Link></div>
            {health || last7.some((x) => x.d?.steps) ? (
              <>
                <div className="row-between">
                  <div><div className="num" style={{ fontSize: 28, fontWeight: 750 }}>{w.steps != null ? fmtN(w.steps) : '–'}</div><div className="tiny muted">{isToday ? 'finora oggi' : 'in questo giorno'}</div></div>
                  <div style={{ textAlign: 'right' }}><div className="num" style={{ fontWeight: 700 }}>{stepsAvg != null ? fmtN(stepsAvg) : '–'}</div><div className="tiny muted">media 7 giorni</div></div>
                </div>
                <div style={{ marginTop: 10 }}><BarChart ariaLabel="Passi negli ultimi 7 giorni" height={110} color="var(--orange)" data={last7.map((x) => ({ label: fromKey(x.k).toLocaleDateString('it-IT', { weekday: 'narrow' }), value: x.d?.steps ?? 0, tip: x.d?.steps != null ? `${fmtN(x.d.steps)} passi` : '–' }))} highlightLast /></div>
                {isToday && <button className="btn sm ghost block" style={{ marginTop: 8 }} onClick={runHealthShortcut}><RefreshCw size={14} /> Aggiorna da Salute</button>}
              </>
            ) : (
              <div className="stack-sm">
                <p className="small text-2">Collega Apple Salute per vedere qui i passi di ogni giorno e avere sonno e peso senza inserirli a mano.</p>
                <Link to="/salute" className="btn sm">Collega Apple Salute</Link>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          {/* Sonno */}
          <section className="card stack-sm" id="w-sleep">
            <div className="card-title"><h3><Moon size={18} /> Sonno</h3>{w.sleepSource === 'health' && w.sleepHours ? <Link to="/salute" className="pill accent"><HeartPulse size={12} /> Da Apple Salute</Link> : <span className="tiny muted">obiettivo {settings.sleepGoalH} h</span>}</div>
            <div className="grid-3">
              <div className="field"><label htmlFor="bed">A letto</label><input id="bed" type="time" className="input" value={w.bedTime ?? ''} onChange={(e) => { const h = hoursBetween(e.target.value, w.wakeTime); patch({ bedTime: e.target.value || null, sleepSource: 'manual', ...(h ? { sleepHours: h } : {}) }); }} /></div>
              <div className="field"><label htmlFor="wake">Sveglia</label><input id="wake" type="time" className="input" value={w.wakeTime ?? ''} onChange={(e) => { const h = hoursBetween(w.bedTime, e.target.value); patch({ wakeTime: e.target.value || null, sleepSource: 'manual', ...(h ? { sleepHours: h } : {}) }); }} /></div>
              <div className="field"><label>Ore</label><NumberInput value={w.sleepHours ?? null} onChange={(v) => patch({ sleepHours: v, sleepSource: 'manual' })} min={0} max={24} ariaLabel="Ore di sonno" /></div>
            </div>
            <ScaleRow label="Qualità del sonno" value={w.sleepQuality} onChange={(v) => patch({ sleepQuality: v })} low="Pessima" high="Ottima" />
            <input className="input" placeholder="Note sul sonno (risvegli, caffeina, schermi…)" value={w.sleepNotes ?? ''} onChange={(e) => patch({ sleepNotes: e.target.value })} aria-label="Note sul sonno" />
            <BarChart ariaLabel="Ore di sonno negli ultimi 7 giorni" height={110} color="var(--accent)" data={last7.map((x) => ({ label: fromKey(x.k).toLocaleDateString('it-IT', { weekday: 'narrow' }), value: x.d?.sleepHours ?? 0, tip: x.d?.sleepHours ? `${x.d.sleepHours} h` : '–' }))} highlightLast />
          </section>

          <section className="card stack" id="w-checkin">
            <div className="card-title" style={{ margin: 0 }}><h3><BatteryMedium size={18} /> Come ti senti</h3></div>
            <ScaleRow icon={<BatteryMedium size={15} />} label="Energia" value={w.energy} onChange={(v) => patch({ energy: v })} low="Scarico" high="Carico" />
            <ScaleRow icon={<Brain size={15} />} label="Stress" value={w.stress} onChange={(v) => patch({ stress: v })} low="Rilassato" high="Molto stressato" />
            <ScaleRow icon={<Smile size={15} />} label="Umore" value={w.mood} onChange={(v) => patch({ mood: v })} low="Giù" high="Ottimo" />
          </section>

          <section className="card">
            <div className="card-title"><h3>Indolenzimento muscolare</h3></div>
            <div className="stack-sm">
              {MAIN_MUSCLES.map((m) => {
                const v = w.soreness?.[m] ?? 0;
                return (
                  <div key={m} className="row-between small">
                    <span style={{ fontWeight: 600, minWidth: 100 }}>{MUSCLE_LABEL[m]}</span>
                    <div className="segmented" style={{ flex: 1, maxWidth: 280 }} role="radiogroup" aria-label={`Indolenzimento ${MUSCLE_LABEL[m]}`}>
                      {SORE.map((l, i) => <button key={i} role="radio" aria-checked={v === i} className={v === i ? 'on' : ''} style={{ fontSize: 12, height: 30 }} onClick={() => patch({ soreness: { ...(w.soreness ?? {}), [m]: i } })}>{l}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-title"><h3>Diario del recupero</h3></div>
            <textarea className="textarea" value={w.recoveryNotes ?? ''} onChange={(e) => patch({ recoveryNotes: e.target.value })} placeholder="Come ti senti oggi? Fastidi, stretching fatto, massaggi, giornata di riposo…" aria-label="Diario del recupero" />
            <p className="tiny muted row" style={{ gap: 4, marginTop: 6 }}><Info size={12} /> Salvato automaticamente</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ScaleRow({ label, value, onChange, low, high, icon }: { label: string; value?: number | null; onChange: (v: number | null) => void; low: string; high: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="row-between small" style={{ marginBottom: 6 }}><span className="row" style={{ gap: 6, fontWeight: 600 }}>{icon}{label}</span>{value ? <button className="tiny muted" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => onChange(null)}>Azzera</button> : null}</div>
      <div className="scale-row" role="radiogroup" aria-label={label}>
        {SCALE.map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>)}
      </div>
      <div className="row-between tiny muted" style={{ marginTop: 4 }}><span>{low}</span><span>{high}</span></div>
    </div>
  );
}
