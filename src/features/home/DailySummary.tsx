/**
 * Riepilogo giornaliero in Home: cosa è previsto oggi, cosa è già registrato e cosa manca.
 * Legge i dati reali tramite gli hook delle collezioni, quindi si aggiorna da solo a ogni
 * registrazione (anche da un altro dispositivo, quando arriva la sincronizzazione).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Apple, Check, ChevronDown, ChevronRight, Coffee, Cookie, Droplets, Dumbbell, EyeOff, HeartPulse, Moon, Plus, RotateCcw, Scale, Smile, Sun, Utensils,
  type LucideIcon,
} from 'lucide-react';
import { useActiveProgram, useCardio, useDiary, useMealPlans, useMeasurements, useSessions, useSettings, useTemplates, useWellness } from '@/app/data';
import { store } from '@/db/store';
import { dailyHeadline, dailySummary, type DailyItem, type DailyKey } from '@/lib/daily';
import { dayKey } from '@/lib/util';
import { Ring, useToast } from '@/components/ui';
import type { WellnessDay } from '@/lib/types';

const ICON: Partial<Record<DailyKey, LucideIcon>> = {
  sleep: Moon, breakfast: Coffee, snack_am: Cookie, lunch: Sun, snack_pm: Apple, dinner: Utensils, water: Droplets, weight: Scale, checkin: Smile,
};
const COLOR: Record<DailyItem['kind'], string> = {
  workout: 'var(--c-training)', cardio: 'var(--c-cardio)', sleep: 'var(--c-coach)', meal: 'var(--c-nutrition)', water: 'var(--blue)', weight: 'var(--c-progress)', checkin: 'var(--c-wellness)',
};
const iconOf = (i: DailyItem) => (i.key === 'workout' ? (i.kind === 'cardio' ? HeartPulse : Dumbbell) : ICON[i.key] ?? Check);

const OPEN_KEY = 'forma.daily.open';
function readOpen() { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } }
function writeOpen(v: boolean) { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* ignore */ } }

/** Ora corrente che si aggiorna ogni 30 s e quando l'app torna in primo piano (cambio di giornata, orari dei pasti). */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, everyMs);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', tick); window.removeEventListener('pageshow', tick); };
  }, [everyMs]);
  return now;
}

export function DailySummary({ onStartWorkout }: { onStartWorkout: (templateId: string) => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const now = useNow();
  const settings = useSettings();
  const program = useActiveProgram();
  const templates = useTemplates();
  const sessions = useSessions();
  const diary = useDiary();
  const wellness = useWellness();
  const measurements = useMeasurements();
  const cardio = useCardio();
  const mealPlans = useMealPlans();
  const [open, setOpen] = useState(readOpen);
  const minute = Math.floor(now.getTime() / 60_000);

  const s = useMemo(
    () => dailySummary({ now, settings, program, templates, sessions, diary, wellness, measurements, cardio, mealPlans }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, settings, program, templates, sessions, diary, wellness, measurements, cardio, mealPlans],
  );
  const head = dailyHeadline(s, now);
    const toggle = () => { setOpen((o) => { writeOpen(!o); return !o; }); };

  function go(i: DailyItem) {
    if (i.to.startsWith('start:')) onStartWorkout(i.to.slice(6));
    else nav(i.to);
  }

  /** Scrive solo sul documento benessere di oggi, che è già sincronizzato. */
  async function patchToday(fn: (w: WellnessDay) => Partial<WellnessDay>) {
    const today = dayKey();
    const cur = store.get<WellnessDay>('wellness', today) ?? { id: today, date: today, waterMl: 0 };
    const p = fn(cur);
    await store.put('wellness', today, { ...cur, ...p, id: today, date: today, waterMl: p.waterMl ?? cur.waterMl ?? 0 });
  }
  const addWater = (e: React.MouseEvent) => { e.stopPropagation(); void patchToday((w) => ({ waterMl: (w.waterMl ?? 0) + 250 })); toast('+250 ml d’acqua'); };
  const skip = (i: DailyItem) => { void patchToday((w) => ({ dailySkip: Array.from(new Set([...(w.dailySkip ?? []), i.key])) })); toast(`${i.label}: non previsto oggi`, 'info'); };
  const restore = (i: DailyItem) => { void patchToday((w) => ({ dailySkip: (w.dailySkip ?? []).filter((k) => k !== i.key) })); };

  const pending = [...s.todo, ...s.later];
  const doneItems = s.items.filter((i) => i.status === 'done');
  const ringColor = s.allDone ? 'var(--success)' : 'var(--accent)';

  return (
    <section className={`daily card ${open ? 'open' : ''} ${s.allDone ? 'all-done' : ''}`} aria-label="Riepilogo giornaliero">
      <button type="button" className="daily-head" onClick={toggle} aria-expanded={open} aria-controls="daily-body">
        <Ring value={s.done} max={Math.max(1, s.total)} size={52} stroke={5.5} color={ringColor}>
          {s.allDone ? <Check size={20} strokeWidth={3} color="var(--success)" /> : <span className="daily-count num">{s.done}<i>/{s.total}</i></span>}
        </Ring>
        <span className="daily-text">
          <span className="daily-eyebrow">Riepilogo giornaliero</span>
          <b>{head.title}</b>
          <span className="daily-sub">{head.sub}</span>
        </span>
        <span className="daily-toggle" aria-hidden><ChevronDown size={18} /></span>
        <span className="sr-only">{open ? 'Comprimi' : 'Espandi'} il riepilogo. {s.done} attività su {s.total} completate.</span>
      </button>

      {!open && pending.length > 0 && (
        <div className="daily-chips" role="list" aria-label="Da registrare">
          {pending.map((i) => {
            const Ic = iconOf(i);
            return (
              <button role="listitem" key={i.key} type="button" className={`daily-chip ${i.status}`} style={{ ['--sc' as string]: COLOR[i.kind] } as CSSProperties} onClick={() => go(i)}
                aria-label={`${i.label}: ${i.detail}${i.status === 'later' ? ' (più tardi)' : ''}. Apri per registrare`}>
                <Ic size={15} /><span>{i.label}</span>
                {i.progress && i.kind === 'water' && <em>{Math.round((i.progress.value / i.progress.max) * 100)}%</em>}
              </button>
            );
          })}
          {doneItems.length > 0 && <span className="daily-chip-done" aria-label={`${doneItems.length} già registrate`}><Check size={13} strokeWidth={3} /> {doneItems.length}</span>}
        </div>
      )}

      {open && (
        <div id="daily-body" className="daily-body">
          <Group title="Da fare" items={s.todo} go={go} onSkip={skip} onWater={addWater} />
          <Group title="Più tardi" items={s.later} go={go} onSkip={skip} onWater={addWater} />
          {doneItems.length > 0 && (
            <div className="daily-group">
              <div className="daily-gt">Registrato<span>{doneItems.length}</span></div>
              <div className="daily-done-list">
                {doneItems.map((i) => (
                  <button key={i.key} type="button" className="daily-done" style={{ ['--sc' as string]: COLOR[i.kind] } as CSSProperties} onClick={() => go(i)} aria-label={`${i.label}: ${i.detail}. Apri`}>
                    <Check size={13} strokeWidth={3} /><b>{i.label}</b><span>{i.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {s.skipped.length > 0 && (
            <div className="daily-skipped">
              <span className="tiny muted">Non previsti oggi:</span>
              {s.skipped.map((i) => <button key={i.key} type="button" className="chip-btn" onClick={() => restore(i)} aria-label={`Ripristina ${i.label}`}><RotateCcw size={12} /> {i.label}</button>)}
            </div>
          )}
          <p className="daily-note tiny muted">Conta solo ciò che è previsto oggi: allenamento se è in programma, pesata nel giorno scelto, spuntini se sono nel piano pasti.</p>
        </div>
      )}
    </section>
  );
}

function Group({ title, items, go, onSkip, onWater }: { title: string; items: DailyItem[]; go: (i: DailyItem) => void; onSkip?: (i: DailyItem) => void; onWater?: (e: React.MouseEvent) => void }) {
  if (!items.length) return null;
  return (
    <div className="daily-group">
      <div className="daily-gt">{title}<span>{items.length}</span></div>
      <ul className="daily-list">
        {items.map((i) => {
          const Ic = iconOf(i);
          return (
            <li key={i.key} className={`daily-row ${i.status}`} style={{ ['--sc' as string]: COLOR[i.kind] } as CSSProperties}>
              <button type="button" className="daily-main" onClick={() => go(i)} aria-label={`${i.label}: ${i.detail}. Apri per registrare`}>
                <span className="daily-ic">{i.status === 'done' ? <Check size={17} strokeWidth={3} /> : <Ic size={18} />}</span>
                <span className="daily-lbl">
                  <b>{i.label}</b>
                  <span>{i.detail}</span>
                  {i.progress && i.status !== 'done' && i.progress.value > 0 && (
                    <span className="daily-mini" aria-hidden><i style={{ width: `${Math.min(100, (i.progress.value / i.progress.max) * 100)}%` }} /></span>
                  )}
                </span>
                {i.status !== 'done' && <ChevronRight size={17} className="daily-go" />}
              </button>
              {i.kind === 'water' && i.status !== 'done' && onWater && (
                <button type="button" className="daily-act" onClick={onWater} aria-label="Aggiungi 250 ml d’acqua"><Plus size={14} /> 250</button>
              )}
              {onSkip && i.status !== 'done' && (
                <button type="button" className="daily-skip" onClick={() => onSkip(i)} aria-label={`${i.label}: non previsto oggi`} title="Non previsto oggi"><EyeOff size={15} /></button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
