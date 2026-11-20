import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Search, X, AlertTriangle, Info } from 'lucide-react';

// ---------------- Toast ----------------
type Toast = { id: number; text: string; kind: 'info' | 'success' | 'error' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'error' ? <AlertTriangle size={18} /> : t.kind === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------- Sheet ----------------
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={wide ? { maxWidth: 820 } : undefined}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Chiudi"><X size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, body, confirmLabel = 'Conferma', danger, onConfirm, onClose }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<><button className="btn grow" onClick={onClose}>Annulla</button><button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      {body && <div className="text-2">{body}</div>}
    </Sheet>
  );
}

// ---------------- Layout ----------------
export function PageHeader({ title, back, right, sub, sticky }: { title: ReactNode; back?: boolean | string; right?: ReactNode; sub?: ReactNode; sticky?: boolean }) {
  const nav = useNavigate();
  return (
    <header className={`page-header ${sticky ? 'sticky' : ''}`}>
      {back && (
        <button className="icon-btn ghost" aria-label="Indietro" onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/'))}>
          <ArrowLeft size={22} />
        </button>
      )}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p className="small">{text}</p>}
      {action}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="search">
      <Search size={18} className="lead" />
      <input className="input" type="search" value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} aria-label={placeholder ?? 'Cerca'} />
      {value && <button className="icon-btn ghost sm clear" onClick={() => onChange('')} aria-label="Cancella ricerca"><X size={16} /></button>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">{o.label}</button>
      ))}
    </div>
  );
}

export function Option({ on, onClick, title, desc, icon, row }: { on: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode; row?: boolean }) {
  return (
    <button type="button" className={`option ${on ? 'on' : ''} ${row ? 'row-opt' : ''}`} onClick={onClick} aria-pressed={on}>
      {icon && <span className="o-icon">{icon}</span>}
      <span className="col" style={{ gap: 4 }}>
        <span className="o-title">{title}</span>
        {desc && <span className="o-desc">{desc}</span>}
      </span>
      <span className="check"><Check size={14} strokeWidth={3} /></span>
    </button>
  );
}

/** Campo numerico tollerante (virgola decimale italiana, vuoto = null). */
export function NumberInput({ value, onChange, suffix, min, max, step = 1, placeholder, ariaLabel, className, invalid }: {
  value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string; min?: number; max?: number; step?: number; placeholder?: string; ariaLabel?: string; className?: string; invalid?: boolean;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value).replace('.', ','));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value === null || value === undefined ? '' : String(value).replace('.', ',')); }, [value]);
  const input = (
    <input
      className={className ?? `input ${invalid ? 'invalid' : ''}`} inputMode="decimal" value={text} placeholder={placeholder} aria-label={ariaLabel}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onBlur={() => { focused.current = false; setText(value === null || value === undefined ? '' : String(value).replace('.', ',')); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,-]/g, '');
        setText(t);
        if (t === '' || t === '-') { onChange(null); return; }
        let n = Number(t.replace(',', '.'));
        if (Number.isNaN(n)) return;
        if (max !== undefined && n > max) n = max;
        if (min !== undefined && n < min) return onChange(n);
        onChange(n);
      }}
      step={step}
    />
  );
  if (!suffix) return input;
  return <div className="input-group">{input}<span className="suffix">{suffix}</span></div>;
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" onClick={() => onChange(Math.max(min, value - step))} aria-label="Diminuisci">−</button>
      <span className="val" aria-live="polite">{format ? format(value) : value}</span>
      <button type="button" className="icon-btn" onClick={() => onChange(Math.min(max, value + step))} aria-label="Aumenta">+</button>
    </div>
  );
}

// ---------------- Progress ----------------
export function Ring({ value, max, size = 120, stroke = 11, color = 'var(--accent)', track = 'var(--surface-3)', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        {value > max && max > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--danger)" strokeWidth={stroke} fill="none" strokeLinecap="round" opacity={0.85}
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, (value - max) / max))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Bar({ value, max, color, thin }: { value: number; max: number; color?: string; thin?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className={`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%`, background: color }} /></div>;
}

export function MacroBar({ label, value, max, color, unit = 'g' }: { label: string; value: number; max: number; color: string; unit?: string }) {
  return (
    <div className="macro" style={{ ['--c' as any]: color }}>
      <div className="row-between"><span className="text-2" style={{ fontWeight: 600 }}>{label}</span><span><b className="num">{Math.round(value)}</b><span className="muted"> / {Math.round(max)} {unit}</span></span></div>
      <Bar value={value} max={max} color={color} />
    </div>
  );
}

export function Loading({ label = 'Caricamento…' }: { label?: string }) {
  return <div className="full-center"><div className="col" style={{ alignItems: 'center' }}><div className="spinner" /><span className="muted small">{label}</span></div></div>;
}

// ---------------- Chips scorrevoli ----------------
/**
 * Riga di chip orizzontale scorrevole su ogni dispositivo:
 * touch (swipe nativo), rotellina del mouse (verticale → orizzontale),
 * trascinamento col mouse, frecce ai bordi su desktop e sfumatura dove c'è altro contenuto.
 * La chip selezionata (.on) viene portata in vista automaticamente.
 */
export function Chips({ children, className = '', style, ...rest }: { children: ReactNode; className?: string; style?: CSSProperties; role?: string; 'aria-label'?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef<{ x: number; start: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const lastOn = useRef<HTMLElement | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < max - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const onWheel = (ev: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      if (!d) return;
      const max = el.scrollWidth - el.clientWidth;
      // Ai bordi lascia scorrere la pagina/il pannello.
      if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max - 1)) return;
      ev.preventDefault();
      el.scrollLeft += ev.deltaMode === 1 ? d * 32 : d;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [update]);

  // Porta in vista la chip attiva (solo in orizzontale, senza muovere la pagina).
  useEffect(() => {
    const el = ref.current;
    const on = el?.querySelector<HTMLElement>('.chip.on');
    if (!el || !on || on === lastOn.current) return;
    lastOn.current = on;
    const a = on.offsetLeft - el.offsetLeft;
    const pad = 40;
    if (a < el.scrollLeft + pad) el.scrollLeft = Math.max(0, a - pad);
    else if (a + on.offsetWidth > el.scrollLeft + el.clientWidth - pad) el.scrollLeft = a + on.offsetWidth - el.clientWidth + pad;
    update();
  });

  const by = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, start: ref.current.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) { d.moved = true; el.setPointerCapture?.(d.id); el.classList.add('dragging'); }
    if (d.moved) el.scrollLeft = d.start - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d?.moved || !el) return;
    el.classList.remove('dragging');
    try { el.releasePointerCapture?.(d.id); } catch { /* già rilasciato */ }
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
  };

  return (
    <div className={`chips-scroll ${edges.left ? 'fade-l' : ''} ${edges.right ? 'fade-r' : ''}`} style={style}>
      <div ref={ref} className={`chips ${className}`} {...rest}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}>
        {children}
      </div>
      {edges.left && <button type="button" className="chips-arrow left" tabIndex={-1} aria-label="Scorri a sinistra" onClick={() => by(-1)}><ChevronLeft size={18} /></button>}
      {edges.right && <button type="button" className="chips-arrow right" tabIndex={-1} aria-label="Scorri a destra" onClick={() => by(1)}><ChevronRight size={18} /></button>}
    </div>
  );
}
