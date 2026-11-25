import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload, RefreshCw, LogOut, Trash2, Cloud, HardDrive, FileSpreadsheet, Bell, Shield, Import, Bluetooth } from 'lucide-react';
import { useSettings, patchSettings, useSessions } from '@/app/data';
import { useAuth } from '@/app/auth';
import { store, ALL_COLLECTIONS, type CollectionName } from '@/db/store';
import { syncEngine } from '@/db/sync';
import { useSyncStatus } from '@/components/sync-badge';
import { PageHeader, Segmented, Switch, Stepper, Sheet, useToast } from '@/components/ui';
import { DAY_LONG } from '@/lib/labels';
import { completedSessions } from '@/lib/stats';
import { getExercise } from '@/data/exercises';
import { dayKey, downloadFile, formatClock, fmtN } from '@/lib/util';
import type { Settings } from '@/lib/types';

export default function SettingsPage() {
  const toast = useToast();
  const s = useSettings();
  const sessions = useSessions();
  const auth = useAuth();
  const sync = useSyncStatus();
  const file = useRef<HTMLInputElement>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const cloud = auth.state.status === 'ready' && auth.state.mode === 'cloud';
  const n = s.notifications;
  const setN = (p: Partial<Settings['notifications']>) => patchSettings({ notifications: { ...n, ...p } });
  const perm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

  async function enableNotif(p: Partial<Settings['notifications']>) {
    if (perm === 'default' && Object.values(p).some((v) => v === true)) {
      try { const r = await Notification.requestPermission(); if (r !== 'granted') toast('Senza permesso del browser i promemoria compariranno solo nella sezione Notifiche', 'info'); } catch { /* ignore */ }
    }
    setN(p);
  }

  function exportJson() {
    const rows = store.allRows().filter((r) => !r.deleted).map((r) => ({ collection: r.collection, id: r.id, data: r.data, updatedAt: r.updatedAt }));
    downloadFile(`forma-backup-${dayKey()}.json`, JSON.stringify({ app: 'forma', version: 1, exportedAt: new Date().toISOString(), rows }, null, 1));
    toast(`Backup esportato (${rows.length} elementi)`);
  }
  function exportCsv() {
    const lines = ['data;allenamento;esercizio;serie;tipo;carico_kg;ripetizioni;rpe;rir'];
    for (const ss of completedSessions(sessions)) for (const e of ss.exercises) e.sets.filter((x) => x.done).forEach((x, i) => {
      lines.push([dayKey(ss.startedAt), ss.name, getExercise(e.exerciseId)?.name ?? e.exerciseId, i + 1, x.type ?? 'normal', x.weight ?? '', x.reps ?? '', x.rpe ?? '', x.rir ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    });
    downloadFile(`forma-allenamenti-${dayKey()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
    toast('Storico allenamenti esportato in CSV');
  }
  async function importJson(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'forma' || !Array.isArray(data.rows)) throw new Error('Il file non è un backup valido di Forma');
      const rows = data.rows.filter((r: any) => ALL_COLLECTIONS.includes(r.collection as CollectionName));
      const nImp = await store.importRows(rows);
      toast(`Importati ${nImp} elementi (quelli più recenti già presenti sono stati mantenuti)`);
    } catch (e: any) { toast(e?.message?.includes('JSON') ? 'File non leggibile' : e?.message ?? 'Importazione non riuscita', 'error'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  async function importLocal() {
    setBusy(true);
    try {
      const { rows, blobs } = await store.readOtherDb('local');
      if (!rows.length) { toast('Nessun dato locale da importare su questo dispositivo', 'info'); return; }
      const nImp = await store.importRows(rows, blobs);
      toast(`Importati ${nImp} elementi dalla modalità senza account`);
    } finally { setBusy(false); }
  }

  return (
    <div className="page stack">
      <PageHeader title="Impostazioni" back />

      <div className="section-title">Preferenze</div>
      <div className="settings-group stack" style={{ padding: 14 }}>
        <div className="field"><label>Unità di misura</label><Segmented label="Unità" value={s.units} onChange={(v) => patchSettings({ units: v })} options={[{ value: 'kg', label: 'Chilogrammi (kg)' }, { value: 'lb', label: 'Libbre (lb)' }]} /></div>
        <div className="field"><label>Tema</label><Segmented label="Tema" value={s.theme} onChange={(v) => patchSettings({ theme: v })} options={[{ value: 'dark', label: 'Scuro' }, { value: 'light', label: 'Chiaro' }, { value: 'system', label: 'Sistema' }]} /></div>
        <div className="row-between"><span><b className="small">Recupero predefinito</b><div className="tiny muted">Per esercizi aggiunti durante l’allenamento</div></span><Stepper value={s.restDefaultSec} min={15} max={600} step={15} format={formatClock} onChange={(v) => patchSettings({ restDefaultSec: v })} /></div>
        <div className="row-between"><span><b className="small">Obiettivo acqua</b></span><Stepper value={s.waterGoalMl} min={500} max={6000} step={250} format={(v) => `${fmtN(v / 1000, 2)} L`} onChange={(v) => patchSettings({ waterGoalMl: v })} /></div>
        <div className="row-between"><span><b className="small">Obiettivo sonno</b></span><Stepper value={s.sleepGoalH} min={5} max={11} step={0.5} format={(v) => `${fmtN(v, 1)} h`} onChange={(v) => patchSettings({ sleepGoalH: v })} /></div>
      </div>

      <div className="section-title"><span className="row" style={{ gap: 6 }}><Bell size={14} /> Promemoria e notifiche</span></div>
      {perm === 'denied' && <div className="banner warn"><Bell size={18} /><span>Le notifiche di sistema sono bloccate dal browser: i promemoria compariranno solo nella sezione Notifiche dell’app.</span></div>}
      <div className="settings-group">
        <Row title="Allenamento del giorno" sub="Nei giorni previsti dal programma, se non ti sei ancora allenato">
          <Switch label="Promemoria allenamento" checked={n.workout} onChange={(v) => enableNotif({ workout: v })} />
        </Row>
        {n.workout && <Row title="Orario"><input type="time" className="input" style={{ width: 120 }} value={n.workoutTime} onChange={(e) => setN({ workoutTime: e.target.value || '18:00' })} aria-label="Orario promemoria allenamento" /></Row>}
        <Row title="Pesata settimanale"><Switch label="Promemoria peso" checked={n.weight} onChange={(v) => enableNotif({ weight: v })} /></Row>
        {n.weight && <Row title="Giorno"><select className="select" style={{ width: 150 }} value={n.weightDay} onChange={(e) => setN({ weightDay: Number(e.target.value) })} aria-label="Giorno della pesata">{DAY_LONG.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Row>}
        <Row title="Bere acqua"><Switch label="Promemoria acqua" checked={n.water} onChange={(v) => enableNotif({ water: v })} /></Row>
        {n.water && (
          <Row title="Ogni" sub={`dalle ${n.waterFrom} alle ${n.waterTo}`}>
            <div className="row" style={{ gap: 6 }}>
              <select className="select" style={{ width: 100 }} value={n.waterEveryMin} onChange={(e) => setN({ waterEveryMin: Number(e.target.value) })} aria-label="Intervallo promemoria acqua">{[60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
              <input type="time" className="input" style={{ width: 100 }} value={n.waterFrom} onChange={(e) => setN({ waterFrom: e.target.value || '09:00' })} aria-label="Dalle" />
              <input type="time" className="input" style={{ width: 100 }} value={n.waterTo} onChange={(e) => setN({ waterTo: e.target.value || '21:00' })} aria-label="Alle" />
            </div>
          </Row>
        )}
        <Row title="Giorni di riposo" sub="Ricorda il recupero dopo più giorni consecutivi di allenamento"><Switch label="Promemoria riposo" checked={n.restDays} onChange={(v) => enableNotif({ restDays: v })} /></Row>
        <Row title="Nuovi record personali"><Switch label="Notifiche record" checked={n.prs} onChange={(v) => enableNotif({ prs: v })} /></Row>
        <Row title="Riepilogo settimanale" sub="Domenica dalle 18: allenamenti, calorie, sonno e peso a confronto con la settimana prima"><Switch label="Riepilogo settimanale" checked={n.weeklySummary} onChange={(v) => enableNotif({ weeklySummary: v })} /></Row>
      </div>
      <p className="hint">I promemoria funzionano mentre l’app è aperta o installata e attiva in background. Le notifiche push con app chiusa richiedono un servizio push dedicato (vedi documentazione).</p>

      <div className="section-title">Account e sincronizzazione</div>
      <div className="settings-group">
        <Row icon={cloud ? <Cloud size={18} /> : <HardDrive size={18} />} title={cloud ? (auth.state.status === 'ready' ? auth.state.email ?? 'Account' : '') : 'Modalità senza account'}
          sub={cloud ? `Stato: ${sync.status === 'syncing' ? 'sincronizzazione…' : sync.status === 'offline' ? 'offline (sincronizzerà appena possibile)' : sync.status === 'error' ? `errore – ${sync.error ?? ''}` : 'sincronizzato'}${sync.lastSync ? ` · ultimo ${new Date(sync.lastSync).toLocaleString('it-IT')}` : ''}` : 'I dati sono salvati solo su questo dispositivo. Esporta un backup regolarmente.'}>
          {cloud && <button className="btn sm" onClick={() => syncEngine.sync()} disabled={sync.status === 'syncing'}><RefreshCw size={15} /> Sincronizza</button>}
        </Row>
        {cloud && <Row icon={<Import size={18} />} title="Importa dati senza account" sub="Porta nel tuo account i dati creati su questo dispositivo in modalità locale"><button className="btn sm" disabled={busy} onClick={importLocal}>Importa</button></Row>}
      </div>

      <div className="section-title">Dati e backup</div>
      <div className="settings-group">
        <Row icon={<Download size={18} />} title="Esporta backup completo" sub="File JSON con tutti i tuoi dati (le foto restano escluse)"><button className="btn sm" onClick={exportJson}>Esporta</button></Row>
        <Row icon={<FileSpreadsheet size={18} />} title="Esporta storico allenamenti" sub="CSV compatibile con Excel e Fogli"><button className="btn sm" onClick={exportCsv}>CSV</button></Row>
        <Row icon={<Upload size={18} />} title="Ripristina da backup" sub="Unisce i dati del file a quelli attuali"><button className="btn sm" disabled={busy} onClick={() => file.current?.click()}>Importa</button></Row>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        <Link to="/privacy" className="list-item"><span className="li-icon"><Shield size={18} /></span><span className="grow"><div className="li-title">Privacy e dati</div></span></Link>
      </div>

      <div className="section-title">Strumenti sperimentali</div>
      <div className="settings-group">
        <Link to="/diagnostics/bluetooth" className="list-item"><span className="li-icon"><Bluetooth size={18} /></span><span className="grow"><div className="li-title">Bluetooth Device Diagnostics</div><div className="li-sub">Verifica in sola lettura cosa espongono cyclette e tapis roulant</div></span></Link>
      </div>

      <div className="section-title">Zona sensibile</div>
      <div className="settings-group">
        <button className="list-item" onClick={() => auth.signOut()}><span className="li-icon"><LogOut size={18} /></span><span className="li-title">Esci</span></button>
        <button className="list-item" onClick={() => setDelOpen(true)}><span className="li-icon"><Trash2 size={18} color="var(--danger)" /></span><span className="grow"><div className="li-title danger-text">{cloud ? 'Elimina account e dati' : 'Elimina tutti i dati'}</div><div className="li-sub">Operazione definitiva</div></span></button>
      </div>

      <Sheet open={delOpen} onClose={() => { setDelOpen(false); setConfirmText(''); }} title={cloud ? 'Eliminare l’account?' : 'Eliminare tutti i dati?'}
        footer={<><button className="btn grow" onClick={() => setDelOpen(false)}>Annulla</button><button className="btn danger grow" disabled={confirmText.trim().toUpperCase() !== 'ELIMINA' || busy} onClick={async () => {
          setBusy(true);
          try { await auth.deleteAccount(); } catch (e: any) { toast(e?.message ?? 'Eliminazione non riuscita', 'error'); setBusy(false); }
        }}>Elimina definitivamente</button></>}>
        <div className="stack-sm">
          <p className="text-2">{cloud ? 'Verranno eliminati definitivamente account, allenamenti, misure, foto, diario e tutte le impostazioni, sia dal cloud sia da questo dispositivo.' : 'Verranno eliminati tutti i dati salvati su questo dispositivo.'} Ti consigliamo di esportare prima un backup.</p>
          <div className="field"><label htmlFor="cdel">Scrivi ELIMINA per confermare</label><input id="cdel" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></div>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ title, sub, children, icon }: { title: string; sub?: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="list-item" style={{ cursor: 'default', flexWrap: 'wrap' }}>
      {icon && <span className="li-icon">{icon}</span>}
      <span className="grow" style={{ minWidth: 160 }}><div className="li-title">{title}</div>{sub && <div className="li-sub">{sub}</div>}</span>
      {children}
    </div>
  );
}
