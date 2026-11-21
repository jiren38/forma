import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Copy, Save, BookOpen, CalendarRange, ShoppingCart, Target, Apple, Info, Bookmark, Trash2, ScanBarcode, Package, Flame, Search, Coffee, Sun, Cookie, Moon, Utensils } from 'lucide-react';
import { unlockAudio } from './scanner/feedback';
import { useCatalog } from './catalog';
import { useActiveProgram, useDiary, useProfile, useSavedMeals, useSettings } from '@/app/data';
import { store } from '@/db/store';
import { targetsFor, nutritionTrend } from '@/lib/insights';
import { totals } from '@/lib/nutrition';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { addDays, dayKey, formatLongDate, fromKey, fmtN, uid } from '@/lib/util';
import { Ring, Sheet, useToast } from '@/components/ui';
import { SectionHero } from '@/design/SectionHero';
import { BarChart } from '@/components/charts';
import { MacroLine, QuantitySheet, findFood } from './common';
import type { DiaryEntry, MealSlot, SavedMeal } from '@/lib/types';

const MEAL_ICON: Record<MealSlot, React.ReactNode> = {
  breakfast: <Coffee size={18} />, snack_am: <Cookie size={18} />, lunch: <Sun size={18} />, snack_pm: <Apple size={18} />, dinner: <Moon size={18} />, other: <Utensils size={18} />,
};

export default function NutritionPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const date = sp.get('date') ?? dayKey();
  const setDate = (d: string) => { const n = new URLSearchParams(sp); if (d === dayKey()) n.delete('date'); else n.set('date', d); setSp(n, { replace: true }); };
  const profile = useProfile()!;
  const settings = useSettings();
  const program = useActiveProgram();
  const diary = useDiary();
  const saved = useSavedMeals();
  const { catalog } = useCatalog();
  const t = targetsFor(profile, settings, program);
  const day = useMemo(() => diary.filter((d) => d.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [diary, date]);
  const tot = totals(day);
  const [edit, setEdit] = useState<DiaryEntry | null>(null);
  const [mealMenu, setMealMenu] = useState<MealSlot | null>(null);
  const [saveName, setSaveName] = useState('');
  const [savedFor, setSavedFor] = useState<MealSlot | null>(null);
  const [pendingSaved, setPendingSaved] = useState<SavedMeal | null>(null);
  const week = nutritionTrend(diary, 7);
  const isToday = date === dayKey();

  async function copyFromPrevious(slot: MealSlot) {
    const prev = dayKey(addDays(fromKey(date), -1));
    const src = diary.filter((d) => d.date === prev && d.slot === slot);
    if (!src.length) { toast(`Nessuna voce in ${MEAL_LABEL[slot]} il giorno precedente`, 'info'); return; }
    for (const e of src) { const n = { ...e, id: uid('d_'), date, createdAt: new Date().toISOString() }; await store.put('diary', n.id, n); }
    toast(`${src.length} ${src.length === 1 ? 'voce copiata' : 'voci copiate'}`);
  }
  async function saveMeal(slot: MealSlot, name: string) {
    const items = day.filter((d) => d.slot === slot).map(({ id, date: _d, createdAt, slot: _s, ...rest }) => rest);
    if (!items.length) return;
    const m: SavedMeal = { id: uid('sm_'), name: name || `${MEAL_LABEL[slot]} del ${fromKey(date).toLocaleDateString('it-IT')}`, items, createdAt: new Date().toISOString() };
    await store.put('savedMeals', m.id, m);
    toast('Pasto salvato: lo trovi in “Pasti salvati” quando aggiungi alimenti');
  }
  async function addSaved(m: SavedMeal, slot: MealSlot) {
    for (const it of m.items) { const e: DiaryEntry = { ...it, id: uid('d_'), date, slot, createdAt: new Date().toISOString() }; await store.put('diary', e.id, e); }
    toast(`“${m.name}” aggiunto a ${MEAL_LABEL[slot]}`);
  }
  async function clearMeal(slot: MealSlot) {
    for (const e of day.filter((d) => d.slot === slot)) await store.remove('diary', e.id);
    toast('Pasto svuotato');
  }

  return (
    <div className="page stack">
      <SectionHero section="nutrition" compact title="Nutrizione" desc="Diario, calorie e macronutrienti. Scansiona un prodotto o cerca un alimento."
        right={<><Link to={`/nutrition/foods${isToday ? '' : `?date=${date}`}`} className="icon-btn" aria-label="I miei prodotti"><Package size={19} /></Link><Link to="/nutrition/targets" className="icon-btn" aria-label="Obiettivi nutrizionali"><Target size={19} /></Link></>}
        actions={<>
          <button className="btn primary" onClick={() => { unlockAudio(); nav(`/nutrition/scan${isToday ? '' : `?date=${date}`}`); }}><ScanBarcode size={19} /> Scansiona</button>
          <Link to={`/nutrition/add?date=${date}`} className="btn"><Search size={17} /> Cerca alimento</Link>
        </>} />

      <Link to={`/nutrition/foods${isToday ? '' : `?date=${date}`}`} className="card catalog-link" style={{ ['--sc' as string]: 'var(--c-nutrition)' } as React.CSSProperties} aria-label="Apri i miei prodotti">
        <span className="t-ic"><Package size={20} /></span>
        <span className="grow" style={{ minWidth: 0 }}><b>I miei prodotti</b><div className="tiny muted ellipsis">{catalog.length ? `${catalog.length} ${catalog.length === 1 ? 'salvato' : 'salvati'} · aggiungi scansionando o cercando` : 'Salva prodotti senza aggiungerli ai pasti'}</div></span>
        <ChevronRight size={18} className="muted" />
      </Link>

      <div className="date-nav">
        <button className="icon-btn ghost" onClick={() => setDate(dayKey(addDays(fromKey(date), -1)))} aria-label="Giorno precedente"><ChevronLeft size={20} /></button>
        <label className="center" style={{ cursor: 'pointer', position: 'relative' }}>
          <b>{isToday ? 'Oggi' : formatLongDate(fromKey(date))}</b>
          {!isToday ? <div className="tiny accent" onClick={(e) => { e.preventDefault(); setDate(dayKey()); }}>Torna a oggi</div> : <div className="tiny muted">{formatLongDate(fromKey(date))}</div>}
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Scegli data" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        <button className="icon-btn ghost" onClick={() => setDate(dayKey(addDays(fromKey(date), 1)))} aria-label="Giorno successivo"><ChevronRight size={20} /></button>
      </div>

      <div className="desk-2">
        <div className="stack">
          <section className="card nutri-sum" aria-label="Riepilogo calorie e macronutrienti">
            <div className="nutri-main">
              <Ring value={tot.kcal} max={t.kcal} size={136} stroke={13} color="var(--c-nutrition)">
                <div><div className="num" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{fmtN(Math.abs(t.kcal - tot.kcal))}</div><div className="tiny muted" style={{ marginTop: 4 }}>{tot.kcal > t.kcal ? 'kcal in più' : 'kcal rimaste'}</div></div>
              </Ring>
              <div className="col grow" style={{ gap: 8 }}>
                <div><span className="eyebrow">Assunte</span><div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{fmtN(tot.kcal)} <span className="small muted">/ {fmtN(t.kcal)} kcal</span></div></div>
                <Link to="/nutrition/targets" className="tiny muted row" style={{ gap: 4 }}><Info size={12} /> {t.overridden ? 'Obiettivo personalizzato' : 'Stima indicativa'} · dettagli</Link>
                <Link to={`/energy${isToday ? '' : `?p=day&d=${date}`}`} className="tiny accent row" style={{ gap: 4, fontWeight: 600 }}><Flame size={12} /> Bilancio con gli allenamenti</Link>
              </div>
            </div>
            <div className="macro-rings">
              {([['Proteine', tot.protein, t.protein, 'var(--protein)'], ['Carboidrati', tot.carbs, t.carbs, 'var(--carbs)'], ['Grassi', tot.fat, t.fat, 'var(--fat)']] as const).map(([l, v, m, c]) => (
                <div key={l} className="mr">
                  <Ring value={v} max={m} size={58} stroke={6} color={c}><b className="num" style={{ fontSize: 13 }}>{Math.round(m > 0 ? (v / m) * 100 : 0)}%</b></Ring>
                  <div><b className="small">{l}</b><div className="tiny muted"><b className="num" style={{ color: 'var(--text)' }}>{Math.round(v)}</b> / {Math.round(m)} g</div></div>
                </div>
              ))}
            </div>
          </section>

          {MEAL_ORDER.map((slot) => {
            const items = day.filter((d) => d.slot === slot);
            const st = totals(items);
            return (
              <section key={slot} className={`card meal ${items.length ? '' : 'empty-meal'}`} aria-label={MEAL_LABEL[slot]}>
                <div className="meal-head">
                  <span className="meal-ic">{MEAL_ICON[slot]}</span>
                  <div className="grow" style={{ minWidth: 0 }}><h3>{MEAL_LABEL[slot]}</h3>{items.length > 0 ? <MacroLine {...st} /> : <span className="tiny muted">Nessun alimento</span>}</div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn ghost" onClick={() => setMealMenu(slot)} aria-label={`Opzioni ${MEAL_LABEL[slot]}`}><MoreHorizontal size={18} /></button>
                    <button className="icon-btn soft" onClick={() => nav(`/nutrition/add?slot=${slot}&date=${date}`)} aria-label={`Aggiungi a ${MEAL_LABEL[slot]}`}><Plus size={18} /></button>
                  </div>
                </div>
                {items.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {items.map((e) => (
                      <button key={e.id} className="food-line" style={{ width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left' }} onClick={() => setEdit(e)}>
                        <span className="grow" style={{ minWidth: 0 }}><div className="ellipsis small" style={{ fontWeight: 600 }}>{e.name}</div><div className="tiny muted">{fmtN(e.grams)} {e.unit ?? 'g'} · P {fmtN(e.protein, 1)} · C {fmtN(e.carbs, 1)} · G {fmtN(e.fat, 1)}</div></span>
                        <b className="num small">{fmtN(e.kcal)}</b>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="stack">
          <div className="tool-grid" style={{ ['--sc' as string]: 'var(--c-nutrition)' } as React.CSSProperties}>
            <Link to="/nutrition/recipes" className="tool"><span className="t-ic"><BookOpen size={20} /></span><b>Ricette</b><span>Crea piatti e calcola i valori</span></Link>
            <Link to="/nutrition/plan" className="tool"><span className="t-ic"><CalendarRange size={20} /></span><b>Piano pasti</b><span>Organizza la settimana</span></Link>
            <Link to="/nutrition/shopping" className="tool"><span className="t-ic"><ShoppingCart size={20} /></span><b>Lista della spesa</b><span>Dal piano pasti</span></Link>
            <Link to="/nutrition/foods" className="tool"><span className="t-ic"><Package size={20} /></span><b>I miei prodotti</b><span>Scansiona, cerca, salva</span></Link>
          </div>
          <section className="card">
            <div className="card-title"><h3>Ultimi 7 giorni</h3><span className="tiny muted">kcal</span></div>
            {week.some((d) => d.logged) ? (
              <>
                <BarChart color="var(--c-nutrition)" ariaLabel="Calorie degli ultimi 7 giorni" data={week.map((d) => ({ label: fromKey(d.date).toLocaleDateString('it-IT', { weekday: 'short' }).slice(0, 3), value: d.kcal }))} highlightLast />
                <div className="tiny muted" style={{ marginTop: 6 }}>Media giorni registrati: <b>{fmtN(week.filter((d) => d.logged).reduce((a, d) => a + d.kcal, 0) / Math.max(1, week.filter((d) => d.logged).length))} kcal</b> · proteine medie {fmtN(week.filter((d) => d.logged).reduce((a, d) => a + d.protein, 0) / Math.max(1, week.filter((d) => d.logged).length))} g (obiettivo {t.protein} g)</div>
              </>
            ) : <p className="small muted">Registra i pasti per vedere l’andamento settimanale.</p>}
          </section>
          {saved.length > 0 && (
            <section className="card">
              <div className="card-title"><h3><Bookmark size={17} /> Pasti salvati</h3></div>
              <div className="stack-sm">
                {saved.slice(0, 5).map((m) => {
                  const st = totals(m.items);
                  return (
                    <div key={m.id} className="row-between">
                      <span className="grow" style={{ minWidth: 0 }}><div className="small ellipsis" style={{ fontWeight: 600 }}>{m.name}</div><MacroLine {...st} /></span>
                      <button className="btn sm soft" onClick={() => setPendingSaved(m)}><Plus size={14} /> Aggiungi</button>
                      <button className="icon-btn ghost" onClick={async () => { await store.remove('savedMeals', m.id); toast('Pasto salvato eliminato'); }} aria-label={`Elimina ${m.name}`}><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <p className="hint">Calorie e macronutrienti sono stime basate su valori medi: non sostituiscono il parere di un medico, dietista o nutrizionista.</p>
        </div>
      </div>

      <QuantitySheet open={!!edit} entry={edit} food={edit?.foodId ? findFood(edit.foodId) ?? null : null} date={date} slot={edit?.slot ?? 'other'} onClose={() => setEdit(null)} onDone={(m) => toast(m)} />

      <Sheet open={!!mealMenu} onClose={() => setMealMenu(null)} title={mealMenu ? MEAL_LABEL[mealMenu] : ''}>
        {mealMenu && (
          <div className="stack">
            <div className="settings-group">
              <button className="list-item" onClick={() => { copyFromPrevious(mealMenu); setMealMenu(null); }}><span className="li-icon"><Copy size={18} /></span><span className="li-title">Copia dal giorno precedente</span></button>
              <button className="list-item" onClick={() => { setSavedFor(mealMenu); setMealMenu(null); }} disabled={!saved.length}><span className="li-icon"><Bookmark size={18} /></span><span className="grow"><div className="li-title">Aggiungi un pasto salvato</div>{!saved.length && <div className="li-sub">Nessun pasto salvato</div>}</span></button>
              <button className="list-item" onClick={() => { clearMeal(mealMenu); setMealMenu(null); }} disabled={!day.some((d) => d.slot === mealMenu)}><span className="li-icon"><Trash2 size={18} /></span><span className="li-title">Svuota pasto</span></button>
            </div>
            {day.some((d) => d.slot === mealMenu) && (
              <div className="field"><label htmlFor="smname">Salva questo pasto per riutilizzarlo</label>
                <div className="row" style={{ gap: 8 }}><input id="smname" className="input grow" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Es. Colazione proteica" maxLength={50} /><button className="btn primary" onClick={() => { saveMeal(mealMenu, saveName.trim()); setSaveName(''); setMealMenu(null); }}><Save size={16} /> Salva</button></div>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Sheet open={!!savedFor} onClose={() => setSavedFor(null)} title={`Aggiungi a ${savedFor ? MEAL_LABEL[savedFor] : ''}`}>
        <div className="settings-group">
          {saved.map((m) => (
            <button key={m.id} className="list-item" onClick={() => { addSaved(m, savedFor!); setSavedFor(null); }}>
              <span className="grow"><div className="li-title">{m.name}</div><MacroLine {...totals(m.items)} /></span><Plus size={18} className="muted" />
            </button>
          ))}
        </div>
      </Sheet>
      <SlotPicker meal={pendingSaved} onClose={() => setPendingSaved(null)} onPick={(slot) => { if (pendingSaved) addSaved(pendingSaved, slot); setPendingSaved(null); }} />
    </div>
  );
}

function SlotPicker({ meal, onClose, onPick }: { meal: SavedMeal | null; onClose: () => void; onPick: (s: MealSlot) => void }) {
  return (
    <Sheet open={!!meal} onClose={onClose} title="In quale pasto?">
      <div className="option-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {MEAL_ORDER.map((s) => <button key={s} className="option" onClick={() => onPick(s)}><span className="o-title">{MEAL_LABEL[s]}</span></button>)}
      </div>
    </Sheet>
  );
}
