/** Scanner a schermo intero: fotocamera, riquadro di lettura, torcia, zoom e inserimento manuale del codice. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { X, Flashlight, FlashlightOff, SwitchCamera, Keyboard, History, Minus, Plus, Loader2, CameraOff, Check, RefreshCw } from 'lucide-react';
import { Sheet } from '@/components/ui';
import { canonicalCode, cleanCode, formatCode, manualCodeProblem, type BarcodeFormat } from '@/lib/barcode';
import { createDecoder, type Decoder, type Detection } from './scanner/decoder';
import { beep, lastHandled, unlockAudio } from './scanner/feedback';
import { lookupProduct, recordScan, type LookupResult } from './products';

type CamError = { title: string; text: string; kind: 'denied' | 'insecure' | 'unsupported' | 'nocamera' | 'busy' | 'ended' | 'other' };

function camError(e: any): CamError {
  const n = e?.name ?? '';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
    return { kind: 'denied', title: 'Accesso alla fotocamera negato', text: 'Per scansionare serve il permesso della fotocamera. Su iPhone: Impostazioni › Safari › Fotocamera › Consenti (oppure il menu “aA” › Impostazioni sito web). Su Android: tocca il lucchetto accanto all’indirizzo › Autorizzazioni › Fotocamera. Sul computer: icona della fotocamera nella barra degli indirizzi.' };
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError')
    return { kind: 'nocamera', title: 'Nessuna fotocamera trovata', text: 'Questo dispositivo non ha una fotocamera disponibile. Puoi digitare le cifre del codice a barre.' };
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError')
    return { kind: 'busy', title: 'Fotocamera occupata', text: 'La fotocamera è in uso da un’altra app o scheda. Chiudila e riprova.' };
  return { kind: 'other', title: 'Fotocamera non disponibile', text: 'Non è stato possibile avviare la fotocamera. Riprova oppure digita il codice.' };
}

export default function ScannerPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ctx = new URLSearchParams();
  if (sp.get('date')) ctx.set('date', sp.get('date')!);
  if (sp.get('slot')) ctx.set('slot', sp.get('slot')!);
  if (sp.get('to')) ctx.set('to', sp.get('to')!); // es. 'shopping': dalla lista della spesa
  const qs = ctx.toString() ? `?${ctx}` : '';

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const decoderRef = useRef<Decoder | null>(null);
  const busyRef = useRef(false);
  const lastRead = useRef({ code: '', at: 0 });
  const zoomRef = useRef(1);

  const [phase, setPhase] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [err, setErr] = useState<CamError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [torchCap, setTorchCap] = useState(false);
  const [torch, setTorch] = useState(false);
  const [hwZoom, setHwZoom] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [hit, setHit] = useState<{ code: string; state: 'searching' | 'done' } | null>(null);
  const [slow, setSlow] = useState(false);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedErr, setTypedErr] = useState<string | null>(null);
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null);

  const close = () => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav('/nutrition'); };

  const goToResult = useCallback(async (code: string, format: BarcodeFormat | undefined, r: LookupResult) => {
    const c = canonicalCode(code, format);
    if (r.status === 'found') await recordScan(r.food);
    nav(`/nutrition/product/${c}${qs ? `${qs}&` : '?'}from=scan`, { state: { result: r } });
  }, [nav, qs]);

  const handle = useCallback(async (d: Detection, confirmed = false) => {
    if (busyRef.current) return;
    const now = Date.now();
    const c = canonicalCode(d.code, d.format);
    if (!confirmed) {
      if (lastHandled.code === c && now - lastHandled.at < 4000) return; // stesso prodotto appena aggiunto
      // conferma: due letture uguali e ravvicinate, per evitare letture errate
      if (lastRead.current.code !== c || now - lastRead.current.at > 1200) { lastRead.current = { code: c, at: now }; return; }
    }
    busyRef.current = true;
    beep();
    setHit({ code: c, state: 'searching' });
    const r = await lookupProduct(d.code, { format: d.format });
    lastHandled.code = c; lastHandled.at = Date.now();
    setHit({ code: c, state: 'done' });
    await goToResult(d.code, d.format, r);
  }, [goToResult]);

  // avvio fotocamera e ciclo di lettura
  useEffect(() => {
    let alive = true;
    let timer: any;
    const canvas = document.createElement('canvas');
    busyRef.current = false;
    setPhase('starting'); setErr(null); setHit(null); setTorch(false);

    async function start() {
      if (!window.isSecureContext) { setErr({ kind: 'insecure', title: 'Serve una connessione sicura', text: 'Il browser permette la fotocamera solo su pagine https:// o su localhost. Sul telefono apri l’app con l’indirizzo https mostrato da “npm run dev:phone” (vedi la guida nel README).' }); setPhase('error'); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setErr({ kind: 'unsupported', title: 'Fotocamera non supportata', text: 'Questo browser non dà accesso alla fotocamera. Prova con Safari su iPhone o Chrome su Android, oppure digita il codice.' }); setPhase('error'); return; }
      const video: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (e: any) {
        if (e?.name === 'OverconstrainedError') {
          try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch (e2) { if (alive) { setErr(camError(e2)); setPhase('error'); } return; }
        } else { if (alive) { setErr(camError(e)); setPhase('error'); } return; }
      }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      track.addEventListener('ended', () => { if (alive) { setErr({ kind: 'ended', title: 'Fotocamera interrotta', text: 'La fotocamera si è fermata (per esempio perché l’app è passata in secondo piano).' }); setPhase('error'); } });
      const v = videoRef.current!;
      v.srcObject = stream;
      try { await v.play(); } catch { /* alcuni browser partono da soli */ }
      const caps: any = track.getCapabilities?.() ?? {};
      try { if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }); } catch { /* messa a fuoco automatica non regolabile */ }
      setTorchCap(!!caps.torch);
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        const z = { min: caps.zoom.min, max: Math.min(caps.zoom.max, caps.zoom.min * 6), step: caps.zoom.step || 0.1 };
        setHwZoom(z); setZoom(z.min); zoomRef.current = 1;
      } else { setHwZoom(null); setZoom(1); zoomRef.current = 1; }
      try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')); } catch { /* elenco non disponibile */ }
      decoderRef.current ??= await createDecoder();
      setEngine(decoderRef.current.kind);
      setPhase('scanning');
      loop();
    }

    function crop(): boolean {
      const v = videoRef.current, box = boxRef.current;
      if (!v || !box || v.readyState < 2 || !v.videoWidth) return false;
      const vr = v.getBoundingClientRect(), br = box.getBoundingClientRect();
      const vw = v.videoWidth, vh = v.videoHeight;
      const s = Math.max(vr.width / vw, vr.height / vh) * zoomRef.current; // object-fit: cover + zoom digitale
      const cx = vr.left + vr.width / 2, cy = vr.top + vr.height / 2;
      const padY = br.height * 0.35;
      let sx = vw / 2 + (br.left - cx) / s, sy = vh / 2 + (br.top - padY - cy) / s;
      let sw = br.width / s, sh = (br.height + padY * 2) / s;
      sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
      const k = Math.min(1, 960 / sw);
      canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
      canvas.getContext('2d', { willReadFrequently: true })!.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return true;
    }

    async function loop() {
      if (!alive) return;
      const dec = decoderRef.current;
      if (dec && !busyRef.current && !document.hidden && crop()) {
        const d = await dec.detect(canvas);
        if (d && alive) await handle(d);
      }
      if (alive) timer = setTimeout(loop, dec?.kind === 'native' ? 50 : 80);
    }

    void start();
    const slowT = setTimeout(() => alive && setSlow(true), 9000);
    return () => {
      alive = false; clearTimeout(timer); clearTimeout(slowT);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null; trackRef.current = null;
    };
  }, [deviceId, attempt, handle]);

  async function toggleTorch() {
    const t = trackRef.current; if (!t) return;
    try { await t.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(!torch); } catch { setTorchCap(false); }
  }
  async function setZoomLevel(z: number) {
    if (hwZoom) {
      const v = Math.min(hwZoom.max, Math.max(hwZoom.min, z));
      setZoom(v);
      try { await trackRef.current?.applyConstraints({ advanced: [{ zoom: v } as any] }); } catch { /* zoom non applicato */ }
    } else {
      const v = Math.min(3, Math.max(1, z));
      setZoom(v); zoomRef.current = v;
    }
  }
  const zr = hwZoom ?? { min: 1, max: 3, step: 0.1 };
  const zoomStep = (zr.max - zr.min) / 6;

  function nextCamera() {
    if (devices.length < 2) return;
    const cur = trackRef.current?.getSettings().deviceId ?? deviceId;
    const i = devices.findIndex((d) => d.deviceId === cur);
    setDeviceId(devices[(i + 1) % devices.length].deviceId);
  }

  function submitTyped() {
    const p = manualCodeProblem(typed);
    if (p) { setTypedErr(p); return; }
    setManual(false);
    busyRef.current = false;
    void handle({ code: cleanCode(typed), format: 'unknown' as BarcodeFormat }, true);
  }

  return (
    <div className="scanner" onPointerDown={unlockAudio}>
      <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden style={{ transform: !hwZoom && zoom > 1 ? `scale(${zoom})` : undefined }} />

      <div className="scanner-top">
        <button className="scan-btn" onClick={close} aria-label="Chiudi lo scanner"><X size={22} /></button>
        <div className="scanner-title">Scansiona prodotto</div>
        <div className="row" style={{ gap: 8 }}>
          {torchCap && <button className={`scan-btn ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? 'Spegni la torcia' : 'Accendi la torcia'}>{torch ? <FlashlightOff size={20} /> : <Flashlight size={20} />}</button>}
          {devices.length > 1 && <button className="scan-btn" onClick={nextCamera} aria-label="Cambia fotocamera"><SwitchCamera size={20} /></button>}
        </div>
      </div>

      {phase !== 'error' && (
        <div className="scanner-stage">
          <div ref={boxRef} className={`scan-box ${hit ? 'hit' : ''}`} role="img" aria-label="Riquadro di scansione">
            <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
            {!hit && phase === 'scanning' && <div className="scan-laser" />}
            {hit && <div className="scan-hit"><Check size={34} /></div>}
          </div>
          <div className="scanner-hint" aria-live="polite">
            {phase === 'starting' && <><Loader2 size={16} className="spin" /> Avvio della fotocamera…</>}
            {phase === 'scanning' && !hit && (slow ? 'Avvicina il prodotto, tieni il codice dritto ed evita i riflessi. Puoi anche digitarlo.' : 'Inquadra il codice a barre nel riquadro')}
            {hit && <span className="scan-found"><b className="num">{formatCode(hit.code)}</b> <Loader2 size={15} className="spin" /> Cerco il prodotto…</span>}
          </div>
        </div>
      )}

      {phase === 'error' && err && (
        <div className="scanner-error" role="alert">
          <div className="scanner-error-ic"><CameraOff size={30} /></div>
          <h2>{err.title}</h2>
          <p>{err.text}</p>
          <div className="stack-sm" style={{ width: '100%', maxWidth: 340 }}>
            {err.kind !== 'insecure' && err.kind !== 'unsupported' && err.kind !== 'nocamera' && <button className="btn primary block" onClick={() => setAttempt((n) => n + 1)}><RefreshCw size={17} /> Riprova</button>}
            <button className="btn block" onClick={() => { setTyped(''); setTypedErr(null); setManual(true); }}><Keyboard size={17} /> Digita il codice a barre</button>
            <Link className="btn ghost block" to={`/nutrition/scanned${qs}`}><History size={17} /> Prodotti già scansionati</Link>
          </div>
        </div>
      )}

      {phase !== 'error' && (
        <div className="scanner-bottom">
          {phase === 'scanning' && (
            <div className="scan-zoom" aria-label="Zoom">
              <button className="scan-btn sm" onClick={() => setZoomLevel(zoom - zoomStep)} aria-label="Riduci zoom"><Minus size={16} /></button>
              <input type="range" min={zr.min} max={zr.max} step={zr.step} value={zoom} onChange={(e) => setZoomLevel(Number(e.target.value))} aria-label="Zoom della fotocamera" />
              <button className="scan-btn sm" onClick={() => setZoomLevel(zoom + zoomStep)} aria-label="Aumenta zoom"><Plus size={16} /></button>
              <span className="tiny num">{(zoom / zr.min).toFixed(1)}×</span>
            </div>
          )}
          <div className="scanner-actions">
            <button className="scan-pill" onClick={() => { setTyped(''); setTypedErr(null); setManual(true); }}><Keyboard size={18} /> Digita codice</button>
            <Link className="scan-pill" to={`/nutrition/scanned${qs}`}><History size={18} /> Scansionati</Link>
          </div>
          {engine && <div className="tiny scanner-engine">{engine === 'native' ? 'Lettore del sistema' : 'Lettore ZXing'} · EAN-13, EAN-8, UPC-A, UPC-E</div>}
        </div>
      )}

      <Sheet open={manual} onClose={() => setManual(false)} title="Inserisci il codice a barre"
        footer={<button className="btn primary block" onClick={submitTyped} disabled={!cleanCode(typed)}>Cerca prodotto</button>}>
        <div className="stack-sm">
          <div className="field">
            <label htmlFor="bc">Cifre sotto le barre</label>
            <input id="bc" className="input num" inputMode="numeric" autoComplete="off" autoFocus placeholder="Es. 8001234567890" value={typed}
              onChange={(e) => { setTyped(e.target.value.replace(/[^\d ]/g, '')); setTypedErr(null); }} onKeyDown={(e) => e.key === 'Enter' && submitTyped()} maxLength={18} aria-invalid={!!typedErr} />
          </div>
          {typedErr ? <p className="small danger-text">{typedErr}</p> : <p className="tiny muted">Accetta EAN-13, EAN-8, UPC-A e UPC-E. La cifra di controllo viene verificata.</p>}
        </div>
      </Sheet>
    </div>
  );
}
