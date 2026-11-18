import { useState } from 'react';
import { Plus, Bike, Pencil, Trash2, Timer, Route, Flame, HeartPulse } from 'lucide-react';
import { useCardio, useProfile } from '@/app/data';
import { store } from '@/db/store';
import { CARDIO_INFO } from '@/lib/labels';
import { PageHeader, Empty, Sheet, NumberInput, Confirm, Segmented, useToast } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { ExerciseAnimation } from '@/features/exercises/anim/render';
import { addDays, dayKey, fmtN, formatShortDate, fromKey, startOfMonth, startOfWeek, sum, uid } from '@/lib/util';
import type { CardioLog, CardioType } from '@/lib/types';

/** Stima kcal con MET × peso × ore (indicativa). Se c'è la velocità per corsa/camminata adatta il MET. */
export function estimateKcal(type: CardioType, minutes: number, weightKg: number, speedKmh?: number | null) {
  let met = CARDIO_INFO[type].met;
  if (speedKmh && (type === 'run' || type === 'treadmill')) met = Math.max(6, Math.min(16, speedKmh * 1.0));
  if (speedKmh && type === 'walk') met = speedKmh < 4 ? 2.8 : speedKmh < 5.5 ? 3.5 : speedKmh < 6.5 ? 4.3 : 5;
  return Math.round(met * weightKg * (minutes / 60));
}

export default function CardioPage() {
  const toast = useToast();
  const logs = useCardio().slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const profile = useProfile()!;
  const [edit, setEdit] = useState<CardioLog | null>(null);
  const [del, setDel] = useState<CardioLog | null>(null);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const from = dayKey(period === 'week' ? startOfWeek() : startOfMonth());
  const inP = logs.filter((l) => l.date >= from);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(startOfWeek(), -7 * (7 - i)), we = addDays(ws, 7);
    return { label: `${ws.getDate()}/${ws.getMonth() + 1}`, value: sum(logs.filter((l) => fromKey(l.date) >= ws && fromKey(l.date) < we).map((l) => l.durationMin)) };
  });
  const blank = (): CardioLog => ({ id: uid('c_'), date: dayKey(), type: 'run', durationMin: 30, distanceKm: null, avgSpeedKmh: null, kcal: null, avgHr: null, maxHr: null, notes: '', createdAt: new Date().toISOString() });

  return (
    <div className="page stack">
      <PageHeader title="Cardio" back right={<button className="btn sm primary" onClick={() => setEdit(blank())}><Plus size={16} /> Registra</button>} />
      <Segmented label="Periodo" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Questa settimana' }, { value: 'month', label: 'Questo mese' }]} />
      <div className="grid-2">
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Bike size={13} /> Sessioni</span><span className="v">{inP.length}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Timer size={13} /> Minuti</span><span className="v">{fmtN(sum(inP.map((l) => l.durationMin)))}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Route size={13} /> Distanza</span><span className="v">{fmtN(sum(inP.map((l) => l.distanceKm ?? 0)), 1)} km</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Flame size={13} /> Kcal stimate</span><span className="v">{fmtN(sum(inP.map((l) => l.kcal ?? 0)))}</span></div></div>
      </div>
      {logs.length > 0 && <section className="card"><div className="card-title"><h3>Minuti a settimana</h3></div><BarChart ariaLabel="Minuti di cardio per settimana" data={weeks} color="var(--blue)" highlightLast /></section>}
      <div className="section-title">Sessioni</div>
      {logs.length === 0 ? <Empty icon={<Bike />} title="Nessuna sessione cardio" text="Registra camminate, corse, bici, ellittica, vogatore, nuoto o altre attività." action={<button className="btn primary" onClick={() => setEdit(blank())}><Plus size={18} /> Registra cardio</button>} /> : (
        <div className="settings-group">
          {logs.map((l) => (
            <div key={l.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="ex-thumb" style={{ width: 48, height: 48 }}><ExerciseAnimation patternId={CARDIO_INFO[l.type].pattern} muscles={['cardio']} className="thumb" label={CARDIO_INFO[l.type].label} /></div>
              <span className="grow" style={{ minWidth: 0 }}>
                <div className="li-title ellipsis">{l.label || CARDIO_INFO[l.type].label} <span className="tiny muted">· {formatShortDate(l.date)}</span></div>
                <div className="li-sub">{l.durationMin} min{l.distanceKm ? ` · ${fmtN(l.distanceKm, 2)} km` : ''}{l.avgSpeedKmh ? ` · ${fmtN(l.avgSpeedKmh, 1)} km/h` : ''}{l.kcal ? ` · ~${l.kcal} kcal` : ''}{l.avgHr ? ` · ${l.avgHr} bpm` : ''}</div>
              </span>
              <button className="icon-btn ghost" onClick={() => setEdit({ ...l })} aria-label="Modifica sessione"><Pencil size={16} /></button>
              <button className="icon-btn ghost" onClick={() => setDel(l)} aria-label="Elimina sessione"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Le calorie sono stimate con i valori MET medi dell’attività e il tuo peso: sono indicative.</p>
      {edit && <CardioSheet key={edit.id} log={edit} weightKg={profile.weightKg} onClose={() => setEdit(null)} onSave={async (l) => { await store.put('cardio', l.id, l); toast('Sessione salvata'); setEdit(null); }} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare la sessione?" onConfirm={async () => { await store.remove('cardio', del!.id); toast('Sessione eliminata'); }} />
    </div>
  );
}

function CardioSheet({ log, weightKg, onClose, onSave }: { log: CardioLog; weightKg: number; onClose: () => void; onSave: (l: CardioLog) => void }) {
  const [l, setL] = useState<CardioLog>(log);
  const [kcalTouched, setKcalTouched] = useState(log.kcal != null);
  const set = (p: Partial<CardioLog>) => setL((x) => {
    const n = { ...x, ...p };
    if (('distanceKm' in p || 'durationMin' in p) && n.distanceKm && n.durationMin) n.avgSpeedKmh = Math.round((n.distanceKm / (n.durationMin / 60)) * 10) / 10;
    return n;
  });
  const est = estimateKcal(l.type, l.durationMin || 0, weightKg, l.avgSpeedKmh);
  const valid = l.durationMin > 0 && l.durationMin <= 1440 && (!l.avgHr || (l.avgHr >= 30 && l.avgHr <= 230));
  return (
    <Sheet open onClose={onClose} title="Sessione cardio" footer={<button className="btn primary block" disabled={!valid} onClick={() => onSave({ ...l, kcal: kcalTouched ? l.kcal : est })}>Salva</button>}>
      <div className="stack-sm">
        <div className="option-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {(Object.keys(CARDIO_INFO) as CardioType[]).map((t) => (
            <button key={t} type="button" className={`option ${l.type === t ? 'on' : ''}`} style={{ padding: 6, flexDirection: 'column', alignItems: 'center', gap: 2 }} onClick={() => set({ type: t })} aria-pressed={l.type === t}>
              <div style={{ width: 52 }}><ExerciseAnimation patternId={CARDIO_INFO[t].pattern} muscles={['cardio']} className="thumb" autoPlay={l.type === t} label={CARDIO_INFO[t].label} /></div>
              <span className="tiny" style={{ fontWeight: 650 }}>{CARDIO_INFO[t].label}</span>
            </button>
          ))}
        </div>
        {l.type === 'other' && <div className="field"><label htmlFor="cl">Attività</label><input id="cl" className="input" value={l.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder="Es. Padel, escursione" maxLength={40} /></div>}
        <div className="grid-2">
          <div className="field"><label htmlFor="cd">Data</label><input id="cd" type="date" className="input" value={l.date} max={dayKey()} onChange={(e) => e.target.value && set({ date: e.target.value })} /></div>
          <div className="field"><label>Durata</label><NumberInput value={l.durationMin || null} onChange={(v) => set({ durationMin: v ?? 0 })} suffix="min" min={0} max={1440} ariaLabel="Durata in minuti" /></div>
          <div className="field"><label>Distanza</label><NumberInput value={l.distanceKm} onChange={(v) => set({ distanceKm: v })} suffix="km" min={0} max={500} ariaLabel="Distanza" /></div>
          <div className="field"><label>Velocità media</label><NumberInput value={l.avgSpeedKmh} onChange={(v) => set({ avgSpeedKmh: v })} suffix="km/h" min={0} max={80} ariaLabel="Velocità media" /></div>
          <div className="field"><label><HeartPulse size={13} /> FC media</label><NumberInput value={l.avgHr} onChange={(v) => set({ avgHr: v == null ? null : Math.round(v) })} suffix="bpm" min={0} max={230} ariaLabel="Frequenza cardiaca media" /></div>
          <div className="field"><label>FC massima</label><NumberInput value={l.maxHr} onChange={(v) => set({ maxHr: v == null ? null : Math.round(v) })} suffix="bpm" min={0} max={230} ariaLabel="Frequenza cardiaca massima" /></div>
          <div className="field"><label>Calorie</label><NumberInput value={kcalTouched ? l.kcal : est} onChange={(v) => { setKcalTouched(v != null); set({ kcal: v }); }} suffix="kcal" min={0} max={10000} ariaLabel="Calorie" /></div>
        </div>
        {!kcalTouched && <p className="tiny muted">Stima automatica: {est} kcal (puoi sostituirla con il dato del tuo dispositivo).</p>}
        <div className="field"><label htmlFor="cn">Note</label><input id="cn" className="input" value={l.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
    </Sheet>
  );
}
