import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Footprints, HeartPulse, Info, Moon, RefreshCw, Scale, Smartphone, Zap } from 'lucide-react';
import { useMeta } from '@/app/data';
import { PageHeader, Segmented, Loading, Switch, useToast } from '@/components/ui';
import { isNativeApp } from '@/lib/native';
import { HEALTH_SHORTCUT_NAME, NATIVE_HEALTH_URL, WEB_HEALTH_URL, runShortcutUrl } from '@/lib/health';
import { fmtN } from '@/lib/util';
import { importHealthUrl, healthAutoEnabled, setHealthAuto } from './HealthBridge';

function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `oggi alle ${time}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ieri alle ${time}`;
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle ${time}`;
}

const hm = (h: number) => { const H = Math.floor(h), M = Math.round((h - H) * 60); return `${H} h ${`${M}`.padStart(2, '0')}`; };

/** Apre il comando rapido: Comandi Rapidi legge Salute e riapre Forma con i dati. */
export function runHealthShortcut() { window.location.href = runShortcutUrl(); }

function CopyField({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1600); }
    catch { toast('Copia non riuscita: tieni premuto sul testo per copiarlo', 'error'); }
  }
  return (
    <div className="hk-copy">
      <div className="grow" style={{ minWidth: 0 }}><div className="tiny muted">{label}</div><code>{value}</code></div>
      <button className="icon-btn ghost" onClick={copy} aria-label={`Copia ${label}`}>{done ? <Check size={17} color="var(--success)" /> : <Copy size={17} />}</button>
    </div>
  );
}

/** Nomi di app e azioni come li mostra l'iPhone, in italiano o in inglese. */
const UI = {
  it: {
    app: 'Comandi', find: 'Trova campioni di Salute', type: 'Tipo', repeat: 'Ripeti con ogni elemento', text: 'Testo', item: 'Elemento di ripetizione',
    start: 'Data di inizio', end: 'Data di fine', value: 'Valore', addVar: 'Aggiungi alla variabile', combine: 'Combina testo', newLine: 'A capo',
    encode: 'Codifica URL', encoded: 'Testo codificato', open: 'Apri URL', automation: 'Automazione', isOpened: 'È aperta', runNow: 'Esegui immediatamente', timeOfDay: 'Ora del giorno',
    blocks: [
      { word: 'passi', type: 'Passi', filter: 'Data di inizio è negli ultimi 7 giorni', group: <>Tocca <b>Raggruppa per</b> e scegli <b>Giorno</b> (così Salute somma iPhone e Apple Watch senza contarli due volte).</> },
      { word: 'sonno', type: 'Sonno (Analisi del sonno)', filter: 'Data di inizio è negli ultimi 2 giorni', group: <>Nessun raggruppamento: servono le singole fasi.</> },
      { word: 'peso', type: 'Peso', filter: 'Data di inizio è negli ultimi 30 giorni', group: <>Al primo collegamento puoi mettere 365 giorni per portare in Forma anche lo storico.</> },
    ],
  },
  en: {
    app: 'Shortcuts', find: 'Find Health Samples', type: 'Type', repeat: 'Repeat with Each', text: 'Text', item: 'Repeat Item',
    start: 'Start Date', end: 'End Date', value: 'Value', addVar: 'Add to Variable', combine: 'Combine Text', newLine: 'New Lines',
    encode: 'URL Encode', encoded: 'URL Encoded Text', open: 'Open URLs', automation: 'Automation', isOpened: 'Is Opened', runNow: 'Run Immediately', timeOfDay: 'Time of Day',
    blocks: [
      { word: 'passi', type: 'Steps', filter: 'Start Date is in the last 7 days', group: <>Tocca <b>Group By</b> e scegli <b>Day</b> (così Salute somma iPhone e Apple Watch senza contarli due volte).</> },
      { word: 'sonno', type: 'Sleep (Sleep Analysis)', filter: 'Start Date is in the last 2 days', group: <>Nessun raggruppamento: servono le singole fasi.</> },
      { word: 'peso', type: 'Weight', filter: 'Start Date is in the last 30 days', group: <>Al primo collegamento puoi mettere 365 giorni per portare in Forma anche lo storico.</> },
    ],
  },
};
type Lang = keyof typeof UI;
const deviceLang = (): Lang => (typeof navigator !== 'undefined' && /^it\b/i.test(navigator.language) ? 'it' : 'en');

export default function HealthPage() {
  const meta = useMeta();
  const h = meta.health;
  const [mode, setMode] = useState<'app' | 'web'>(isNativeApp() ? 'app' : 'web');
  const [lang, setLang] = useState<Lang>(deviceLang);
  const [auto, setAuto] = useState(healthAutoEnabled);
  const t = UI[lang];
  const base = mode === 'app' ? NATIVE_HEALTH_URL : WEB_HEALTH_URL;
  const s = h?.summary;

  return (
    <div className="page stack">
      <PageHeader title="Apple Salute" back />

      <section className="card stack-sm">
        <div className="row" style={{ gap: 12 }}>
          <span className="hk-badge"><HeartPulse size={22} /></span>
          <div className="grow">
            <h3>{h ? 'Collegato tramite Comandi Rapidi' : 'Non ancora collegato'}</h3>
            <p className="small text-2" style={{ marginTop: 2 }}>{h ? `Ultimo aggiornamento ${when(h.lastImportAt)}` : 'Passi, sonno e peso arrivano da soli da Salute, senza inserirli a mano.'}</p>
          </div>
        </div>
        {h?.error && <div className="banner warn"><AlertTriangle size={18} /><span>{h.error}{h.invalid?.length ? <><br /><span className="tiny muted">Esempio ricevuto: <code>{h.invalid[0]}</code></span></> : null}</span></div>}
        {s && (
          <div className="grid-3">
            <div className="stat-tile"><div className="stat"><span className="l"><Footprints size={13} /> Passi oggi</span><span className="v" style={{ fontSize: 18 }}>{s.steps.today != null ? fmtN(s.steps.today) : '–'}</span><span className="tiny muted">{s.steps.days} giorni letti</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="l"><Moon size={13} /> Ultima notte</span><span className="v" style={{ fontSize: 18 }}>{s.sleep.last ? hm(s.sleep.last.hours) : '–'}</span><span className="tiny muted">{s.sleep.keptManual ? `${s.sleep.keptManual} già inserite a mano` : s.sleep.last ? `${s.sleep.last.bedTime} → ${s.sleep.last.wakeTime}` : 'nessun dato'}</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="l"><Scale size={13} /> Peso</span><span className="v" style={{ fontSize: 18 }}>{s.weight.latest ? `${fmtN(s.weight.latest.kg, 1)} kg` : '–'}</span><span className="tiny muted">{s.weight.added ? `${s.weight.added} nuove pesate` : 'nessuna nuova'}</span></div></div>
          </div>
        )}
        {s && s.invalid > 0 && !h?.error && <p className="hint">{s.invalid} righe non riconosciute sono state ignorate.</p>}
        <button className="btn primary block" onClick={runHealthShortcut}><RefreshCw size={16} /> Aggiorna da Salute</button>
        <p className="hint">Il pulsante avvia il comando rapido “{HEALTH_SHORTCUT_NAME}”, che legge Salute e riapre Forma con i dati aggiornati.</p>
      </section>

      <section className="card stack-sm">
        <div className="card-title" style={{ margin: 0 }}><h3><Info size={18} /> Come funziona</h3></div>
        <p className="small text-2" style={{ lineHeight: 1.6 }}>
          Le app installate con un Apple ID gratuito non possono avere il permesso di Salute (HealthKit): Apple lo concede solo con l’account sviluppatore a pagamento.
          Per questo si usa <b>Comandi Rapidi</b>, l’app di Apple che può leggere Salute: un comando legge i dati e li passa a Forma.
        </p>
        <ul className="bullets small text-2">
          <li><b>Passi</b> di ogni giorno, in Benessere.</li>
          <li><b>Sonno</b> della notte (ore, a letto e sveglia), sul giorno del risveglio. Se hai già scritto il sonno a mano, resta il tuo.</li>
          <li><b>Peso</b> in Corpo e misure (una pesata al giorno, la prima) e nel profilo per calorie e stime. Le pesate già presenti non si duplicano.</li>
        </ul>
        <p className="hint">I dati restano in Forma e si sincronizzano con il tuo account come gli altri. Forma non scrive nulla in Salute.</p>
      </section>

      <section className="card stack">
        <div className="card-title" style={{ margin: 0 }}><h3><Smartphone size={18} /> Crea il comando (una volta sola)</h3></div>
        <div className="field">
          <label>Uso Forma da</label>
          <Segmented label="Uso Forma da" value={mode} onChange={setMode} options={[{ value: 'app', label: 'App iPhone' }, { value: 'web', label: 'Safari' }]} />
        </div>
        <div className="field">
          <label>Lingua del tuo iPhone</label>
          <Segmented label="Lingua del tuo iPhone" value={lang} onChange={setLang} options={[{ value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }]} />
        </div>
        <ol className="steps">
          <li><span>Se non hai l’app <b>{t.app}</b> (icona viola e blu di Apple), scaricala gratis dall’App Store. Aprila, tocca <b>+</b> e chiama il comando esattamente <b>{HEALTH_SHORTCUT_NAME}</b>.</span></li>
          {t.blocks.map((b) => (
            <li key={b.word}>
              <span>
                Aggiungi <b>{t.find}</b>: {t.type} <b>{b.type}</b>, filtro <b>{b.filter}</b>. {b.group}<br />
                Poi <b>{t.repeat}</b> e, dentro la ripetizione, un’azione <b>{t.text}</b> con:
                <span className="hk-line"><b>{b.word};</b><i>{t.start}</i><b>;</b><i>{t.end}</i><b>;</b><i>{t.value}</i></span>
                Le parti azzurre sono variabili: tocca sopra la tastiera <b>{t.item}</b>, poi toccalo di nuovo e scegli la proprietà. Le parole <b>{b.word}</b> e i <b>;</b> si scrivono così, in italiano. Sotto il {t.text}, sempre nella ripetizione, aggiungi <b>{t.addVar}</b> con nome <b>Dati</b>.
              </span>
            </li>
          ))}
          <li><span>Dopo le tre ripetizioni aggiungi <b>{t.combine}</b>: <i>Dati</i> con <b>{t.newLine}</b>. Poi <b>{t.encode}</b> sul testo combinato.</span></li>
          <li><span>Per finire <b>{t.open}</b> con l’indirizzo qui sotto seguito dalla variabile <i>{t.encoded}</i>:</span></li>
        </ol>
        <CopyField label={`Indirizzo da mettere in ${t.open}`} value={base} />
        {mode === 'web' && <p className="hint">Con Safari i dati vanno nella versione web; se hai l’account si sincronizzano anche nell’app. Se usi l’app iPhone scegli “App iPhone”.</p>}
        <div className="banner"><Info size={18} /><span>Consigliato: in ogni variabile data (<i>{t.start}</i>, <i>{t.end}</i>) scegli il formato <b>ISO 8601</b>. Forma capisce anche il formato normale, ma ISO evita ogni ambiguità.</span></div>
        <p className="small text-2">Prova il comando con ▶︎. La prima volta iPhone chiede di consentire l’accesso a Salute (consenti Passi, Sonno e Peso) e di aprire Forma.</p>
        <div className="banner warn"><AlertTriangle size={18} /><span>Se compare <b>{lang === 'it' ? 'Nessun campione trovato' : 'No Samples Found'}</b>, il comando si ferma: Comandi Rapidi non sa saltare un tipo di dato vuoto. Prima controlla i permessi in Salute › il tuo profilo › {lang === 'it' ? 'App' : 'Apps'} › {t.app}, attivando Passi, Sonno e Peso. Se invece quel dato non esiste proprio (per esempio il sonno senza Apple Watch e senza orario del sonno), elimina dal comando il suo blocco: la ricerca, la ripetizione e il suo contenuto. Per il peso puoi anche allargare il filtro a 365 giorni.</span></div>
      </section>

      <section className="card stack-sm">
        <div className="card-title" style={{ margin: 0 }}><h3><Zap size={18} /> Aggiornamento automatico</h3></div>
        {isNativeApp() && (
          <>
            <div className="row-between" style={{ gap: 12 }}>
              <span><b className="small">Aggiorna quando apri Forma</b><div className="tiny muted">Forma avvia da sola il comando (al massimo una volta all’ora): vedi Comandi per un attimo e poi torni qui con i dati.</div></span>
              <Switch label="Aggiorna quando apri Forma" checked={auto} onChange={(v) => { setHealthAuto(v); setAuto(v); }} />
            </div>
            <p className="hint">È il modo più semplice. In alternativa puoi usare un’automazione di {t.app}, che lavora senza far vedere il passaggio:</p>
          </>
        )}
        <ol className="steps">
          <li><span>In {t.app} apri <b>{t.automation}</b> e tocca <b>+</b> in alto a destra, poi <b>{lang === 'it' ? 'Crea automazione personale' : 'Create Personal Automation'}</b> se compare, e scegli il trigger <b>App</b>.</span></li>
          <li><span>Scegli <b>Forma</b>, spunta <b>{t.isOpened}</b> e seleziona <b>{t.runNow}</b>.</span></li>
          <li><span>Come azione scegli il comando <b>{HEALTH_SHORTCUT_NAME}</b>.</span></li>
        </ol>
        <p className="hint">Puoi aggiungere anche un’automazione <b>{t.timeOfDay}</b> (es. ogni mattina alle 9).</p>
      </section>

      <Link to="/wellness" className="btn block">Vedi passi e sonno in Benessere</Link>
    </div>
  );
}

/** Sul web il comando apre …/#/salute/importa?d=…: importa e mostra la pagina di Apple Salute. */
export function HealthImportRoute() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = sp.toString();
    void importHealthUrl(`${WEB_HEALTH_URL.split('?')[0]}?${q}`, toast).finally(() => nav('/salute', { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Loading label="Importazione da Apple Salute…" />;
}
