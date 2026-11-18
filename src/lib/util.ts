export const uid = (p = '') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Data locale YYYY-MM-DD (non UTC). */
export function dayKey(d: Date | string = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const m = `${x.getMonth() + 1}`.padStart(2, '0');
  const dd = `${x.getDate()}`.padStart(2, '0');
  return `${x.getFullYear()}-${m}-${dd}`;
}
export function fromKey(k: string): Date { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Indice giorno con lunedì = 0. */
export const weekdayIdx = (d: Date) => (d.getDay() + 6) % 7;
export function startOfWeek(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -weekdayIdx(x)); }
export function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function daysBetween(a: Date, b: Date) { return Math.round((fromKey(dayKey(b)).getTime() - fromKey(dayKey(a)).getTime()) / 86400000); }

const fmtDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
export const formatLongDate = (d: Date | string) => cap(fmtDate.format(typeof d === 'string' ? new Date(d) : d));
export const formatShortDate = (d: Date | string) => fmtShort.format(typeof d === 'string' ? (d.length === 10 ? fromKey(d) : new Date(d)) : d);
export const formatTime = (d: Date | string) => fmtTime.format(typeof d === 'string' ? new Date(d) : d);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
export function formatClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export const round = (n: number, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

// ---- unità ----
export const KG_PER_LB = 0.45359237;
export function toDisplayWeight(kg: number | null | undefined, units: 'kg' | 'lb'): number | null {
  if (kg === null || kg === undefined) return null;
  return units === 'lb' ? round(kg / KG_PER_LB, 1) : round(kg, 2);
}
export function fromDisplayWeight(v: number | null, units: 'kg' | 'lb'): number | null {
  if (v === null || Number.isNaN(v)) return null;
  return units === 'lb' ? v * KG_PER_LB : v;
}
export function fmtW(kg: number | null | undefined, units: 'kg' | 'lb') {
  const v = toDisplayWeight(kg, units);
  return v === null ? '–' : `${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${units}`;
}
export const fmtN = (n: number, d = 0) => n.toLocaleString('it-IT', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
}

export function downloadFile(name: string, content: string | Blob, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function vibrate(pattern: number | number[]) { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } }
