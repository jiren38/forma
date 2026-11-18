import { useMemo, useRef, useState } from 'react';
import { Plus, Scale, Ruler, Camera, Trash2, Pencil, Lock, Columns2, ImageOff } from 'lucide-react';
import { useMeasurements, usePhotos, useProfile, useSettings, patchProfile } from '@/app/data';
import { useAuth } from '@/app/auth';
import { store } from '@/db/store';
import { PageHeader, Empty, Sheet, NumberInput, Segmented, Confirm, useToast } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { dayKey, fmtN, fmtW, formatShortDate, fromDisplayWeight, toDisplayWeight, uid } from '@/lib/util';
import type { Measurement, ProgressPhoto } from '@/lib/types';
import { addPhoto, deletePhoto, usePhotoUrl } from './photos';

type Metric = 'weightKg' | 'waistCm' | 'chestCm' | 'armCm' | 'thighCm' | 'hipsCm' | 'bodyFatPct';
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' }, { key: 'waistCm', label: 'Vita', unit: 'cm' }, { key: 'chestCm', label: 'Petto', unit: 'cm' },
  { key: 'armCm', label: 'Braccia', unit: 'cm' }, { key: 'thighCm', label: 'Cosce', unit: 'cm' }, { key: 'hipsCm', label: 'Fianchi', unit: 'cm' },
  { key: 'bodyFatPct', label: 'Massa grassa', unit: '%' },
];
const POSE: Record<ProgressPhoto['pose'], string> = { front: 'Frontale', side: 'Laterale', back: 'Posteriore', other: 'Altro' };

export default function BodyPage() {
  const toast = useToast();
  const profile = useProfile()!;
  const units = useSettings().units;
  const ms = useMeasurements().slice().sort((a, b) => a.date.localeCompare(b.date));
  const [tab, setTab] = useState<'measures' | 'charts' | 'photos'>('measures');
  const [edit, setEdit] = useState<Measurement | null>(null);
  const [del, setDel] = useState<Measurement | null>(null);
  const [metric, setMetric] = useState<Metric>('weightKg');
  const latest = (k: Metric) => [...ms].reverse().find((m) => m[k] != null);
  const first = (k: Metric) => ms.find((m) => m[k] != null);

  async function saveM(m: Measurement) {
    await store.put('measurements', m.id, m);
    const lastW = [...store.list<Measurement>('measurements')].filter((x) => x.weightKg).sort((a, b) => a.date.localeCompare(b.date)).pop();
    if (lastW?.weightKg && lastW.weightKg !== profile.weightKg) await patchProfile({ weightKg: lastW.weightKg });
    if (m.bodyFatPct != null && lastW?.id === m.id) await patchProfile({ bodyFatPct: m.bodyFatPct });
    toast('Misurazione salvata');
  }

  const fmtMetric = (k: Metric, v: number | null | undefined) => (v == null ? '–' : k === 'weightKg' ? fmtW(v, units) : `${fmtN(v, 1)} ${METRICS.find((x) => x.key === k)!.unit}`);
  const pts = ms.filter((m) => m[metric] != null).map((m) => ({ x: new Date(m.date).getTime(), y: metric === 'weightKg' ? toDisplayWeight(m.weightKg!, units)! : (m[metric] as number), label: formatShortDate(m.date) }));

  return (
    <div className="page stack">
      <PageHeader title="Corpo e misure" back right={<button className="btn sm primary" onClick={() => setEdit({ id: uid('m_'), date: dayKey() })}><Plus size={16} /> Misura</button>} />
      <div className="tabbar" role="tablist">
        {([['measures', 'Misure'], ['charts', 'Grafici'], ['photos', 'Foto']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'measures' && (
        <>
          <div className="grid-3">
            {METRICS.map((m) => {
              const l = latest(m.key), f = first(m.key);
              const d = l && f && l.id !== f.id ? (l[m.key] as number) - (f[m.key] as number) : null;
              return (
                <button key={m.key} className="stat-tile" style={{ border: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => { setMetric(m.key); setTab('charts'); }}>
                  <div className="stat"><span className="l">{m.label}</span><span className="v" style={{ fontSize: 18 }}>{fmtMetric(m.key, l?.[m.key] as number | undefined)}</span>
                    {d !== null && <span className="tiny" style={{ color: 'var(--muted)' }}>{d > 0 ? '+' : ''}{m.key === 'weightKg' ? fmtW(d, units) : fmtN(d, 1)} dall’inizio</span>}</div>
                </button>
              );
            })}
            <div className="stat-tile"><div className="stat"><span className="l">Obiettivo peso</span><span className="v" style={{ fontSize: 18 }}>{fmtW(profile.targetWeightKg, units)}</span></div></div>
          </div>
          <div className="section-title">Storico misurazioni</div>
          {ms.length === 0 ? <Empty icon={<Scale />} title="Nessuna misurazione" text="Registra peso e circonferenze per seguire i cambiamenti nel tempo." /> : (
            <div className="settings-group">
              {[...ms].reverse().map((m) => (
                <div key={m.id} className="list-item" style={{ cursor: 'default' }}>
                  <span className="li-icon"><Ruler size={18} /></span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="li-title">{formatShortDate(m.date)}{m.weightKg ? ` · ${fmtW(m.weightKg, units)}` : ''}</div>
                    <div className="li-sub ellipsis">{METRICS.filter((x) => x.key !== 'weightKg' && m[x.key] != null).map((x) => `${x.label} ${fmtN(m[x.key] as number, 1)}${x.unit === '%' ? '%' : ''}`).join(' · ') || (m.notes ? m.notes : 'Solo peso')}</div>
                  </span>
                  <button className="icon-btn ghost" onClick={() => setEdit({ ...m })} aria-label="Modifica misurazione"><Pencil size={16} /></button>
                  <button className="icon-btn ghost" onClick={() => setDel(m)} aria-label="Elimina misurazione"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'charts' && (
        <section className="card stack-sm">
          <div className="chips wrap">{METRICS.map((m) => <button key={m.key} className={`chip ${metric === m.key ? 'on' : ''}`} onClick={() => setMetric(m.key)}>{m.label}</button>)}</div>
          {pts.length >= 2 ? <LineChart ariaLabel={`Andamento ${METRICS.find((x) => x.key === metric)!.label}`} points={pts} format={(v) => fmtN(v, 1)} goal={metric === 'weightKg' ? toDisplayWeight(profile.targetWeightKg, units) : null} height={220} />
            : <p className="small muted">Servono almeno 2 misurazioni di questo valore per il grafico ({pts.length} registrate).</p>}
          {metric === 'weightKg' && pts.length >= 2 && <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Peso</span><span><i style={{ background: 'var(--orange)' }} />Obiettivo</span></div>}
        </section>
      )}

      {tab === 'photos' && <Photos />}

      {edit && <MeasureSheet key={edit.id} m={edit} units={units} onClose={() => setEdit(null)} onSave={(m) => { saveM(m); setEdit(null); }} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare la misurazione?" onConfirm={async () => { await store.remove('measurements', del!.id); toast('Misurazione eliminata'); }} />
    </div>
  );
}

function MeasureSheet({ m: m0, units, onClose, onSave }: { m: Measurement; units: 'kg' | 'lb'; onClose: () => void; onSave: (m: Measurement) => void }) {
  const [m, setM] = useState<Measurement>(m0);
  const set = (p: Partial<Measurement>) => setM((x) => ({ ...x, ...p }));
  const any = METRICS.some((x) => m[x.key] != null);
  const invalid = (m.weightKg != null && (m.weightKg < 25 || m.weightKg > 350)) || (m.bodyFatPct != null && (m.bodyFatPct < 2 || m.bodyFatPct > 70));
  return (
    <Sheet open onClose={onClose} title="Misurazione" footer={<button className="btn primary block" disabled={!any || invalid} onClick={() => onSave(m)}>Salva</button>}>
      <div className="stack-sm">
        <div className="field"><label htmlFor="md">Data</label><input id="md" type="date" className="input" value={m.date} max={dayKey()} onChange={(e) => e.target.value && set({ date: e.target.value })} /></div>
        <div className="grid-2">
          <div className="field"><label>Peso</label><NumberInput value={toDisplayWeight(m.weightKg, units)} onChange={(v) => set({ weightKg: fromDisplayWeight(v, units) })} suffix={units} min={0} max={800} ariaLabel="Peso" invalid={m.weightKg != null && (m.weightKg < 25 || m.weightKg > 350)} /></div>
          <div className="field"><label>Massa grassa</label><NumberInput value={m.bodyFatPct} onChange={(v) => set({ bodyFatPct: v })} suffix="%" min={0} max={70} ariaLabel="Percentuale massa grassa" /></div>
          {METRICS.filter((x) => x.unit === 'cm').map((x) => (
            <div key={x.key} className="field"><label>{x.label}</label><NumberInput value={m[x.key] as number | null | undefined} onChange={(v) => set({ [x.key]: v } as Partial<Measurement>)} suffix="cm" min={0} max={300} ariaLabel={x.label} /></div>
          ))}
        </div>
        <div className="field"><label htmlFor="mn">Note</label><input id="mn" className="input" value={m.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Es. al mattino a digiuno" /></div>
        <p className="hint">Per confronti affidabili misurati sempre nelle stesse condizioni (es. al mattino, prima di colazione).</p>
      </div>
    </Sheet>
  );
}

function Photos() {
  const toast = useToast();
  const { state } = useAuth();
  const photos = usePhotos().slice().sort((a, b) => b.date.localeCompare(a.date));
  const input = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<ProgressPhoto['pose']>('front');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState(false);
  const [del, setDel] = useState<ProgressPhoto | null>(null);
  const byPose = useMemo(() => photos.filter((p) => p.pose === pose), [photos, pose]);
  const cloudId = state.status === 'ready' && state.mode === 'cloud' ? state.userId : null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { await addPhoto(f, { date: dayKey(), pose }, cloudId); toast('Foto salvata'); }
    catch (e: any) { toast(e?.message ?? 'Impossibile salvare la foto', 'error'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div className="stack">
      <div className="banner"><Lock size={18} /><span>Le foto sono private: restano su questo dispositivo{cloudId ? ' e nel tuo spazio cloud protetto, accessibile solo al tuo account' : ''}. Non vengono condivise né analizzate.</span></div>
      <Segmented label="Posa" value={pose} onChange={setPose} options={(Object.keys(POSE) as ProgressPhoto['pose'][]).map((k) => ({ value: k, label: POSE[k] }))} />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary grow" disabled={busy} onClick={() => input.current?.click()}><Camera size={17} /> {busy ? 'Salvataggio…' : 'Aggiungi foto'}</button>
        <button className="btn" disabled={byPose.length < 2} onClick={() => setCompare(true)}><Columns2 size={17} /> Confronta</button>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {byPose.length === 0 ? <Empty icon={<Camera />} title="Nessuna foto" text="Scatta foto periodiche nella stessa posa e luce per vedere i cambiamenti nel tempo." /> : (
        <div className="photo-grid">{byPose.map((p) => <Thumb key={p.id} p={p} onClick={() => setView(p)} />)}</div>
      )}
      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `${POSE[view.pose]} · ${formatShortDate(view.date)}` : ''}
        footer={<button className="btn danger block" onClick={() => { setDel(view); setView(null); }}><Trash2 size={16} /> Elimina foto</button>}>
        {view && <Big p={view} />}
      </Sheet>
      <Sheet open={compare} onClose={() => setCompare(false)} title="Confronto" wide>
        {byPose.length >= 2 && (
          <div className="grid-2">
            <div><div className="tiny muted center" style={{ marginBottom: 4 }}>{formatShortDate(byPose[byPose.length - 1].date)}</div><Big p={byPose[byPose.length - 1]} /></div>
            <div><div className="tiny muted center" style={{ marginBottom: 4 }}>{formatShortDate(byPose[0].date)}</div><Big p={byPose[0]} /></div>
          </div>
        )}
      </Sheet>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare la foto?" body="La foto verrà eliminata definitivamente da questo dispositivo e dal cloud." onConfirm={async () => { await deletePhoto(del!); toast('Foto eliminata'); }} />
    </div>
  );
}

function Thumb({ p, onClick }: { p: ProgressPhoto; onClick: () => void }) {
  const url = usePhotoUrl(p);
  return (
    <button className="ph" onClick={onClick} aria-label={`Foto ${POSE[p.pose]} del ${formatShortDate(p.date)}`}>
      {url ? <img src={url} alt="" /> : <div className="full-center" style={{ minHeight: 0, height: '100%' }}><ImageOff size={20} className="muted" /></div>}
      <span>{formatShortDate(p.date)}</span>
    </button>
  );
}
function Big({ p }: { p: ProgressPhoto }) {
  const url = usePhotoUrl(p);
  return url ? <img src={url} alt={`Foto ${POSE[p.pose]} del ${formatShortDate(p.date)}`} style={{ width: '100%', borderRadius: 14, display: 'block' }} /> : <div className="center muted small" style={{ padding: 30 }}>Foto non disponibile su questo dispositivo</div>;
}
