/**
 * Coach locale: risponde in base ai dati reali senza servizi esterni.
 * Usato quando l'AI cloud non è configurata o non raggiungibile.
 * Non modifica mai i dati: produce testo e suggerimenti da confermare.
 */
import { EXERCISES, getExercise } from '@/data/exercises';
import { MUSCLE_LABEL, INJURY_LABEL } from './labels';
import { completedSessions, exerciseHistory, muscleSets, sessionStats, streaks } from './stats';
import { adviceToSuggestion, exerciseTrend, nutritionTrend, progressionAdvice, readiness, weekProgress, targetsFor } from './insights';
import { substitutes } from './generator';
import { normalize, round, fmtN, dayKey, addDays } from './util';
import type { CardioLog, DiaryEntry, Measurement, Profile, Program, Settings, Suggestion, WellnessDay, WorkoutSession, WorkoutTemplate } from './types';

export interface CoachData {
  profile: Profile; settings: Settings; program?: Program; templates: WorkoutTemplate[]; sessions: WorkoutSession[];
  diary: DiaryEntry[]; wellness: WellnessDay[]; measurements: Measurement[]; cardio: CardioLog[];
}

/** Contesto compatto inviato all'AI (solo dati necessari, nessun identificativo di account). */
export function buildContext(d: CoachData) {
  const done = completedSessions(d.sessions);
  const t = targetsFor(d.profile, d.settings, d.program);
  const tplIds = new Set(d.program?.schedule.filter(Boolean) as string[] ?? []);
  return {
    profilo: {
      nome: d.profile.name, eta: d.profile.age, sesso: d.profile.sex, altezzaCm: d.profile.heightCm, pesoKg: d.profile.weightKg, pesoObiettivoKg: d.profile.targetWeightKg,
      grassoPct: d.profile.bodyFatPct ?? null, livello: d.profile.level, obiettivi: d.profile.goals, giorniSettimana: d.profile.daysPerWeek, minutiSessione: d.profile.minutesPerSession,
      infortuniOLimitazioni: d.profile.injuries.map((i) => INJURY_LABEL[i]), noteInfortuni: d.profile.injuryNotes, muscoliFocus: d.profile.focusMuscles, attivita: d.profile.activity,
      attrezzatura: d.profile.fullGym ? 'palestra completa' : d.profile.equipment, dieta: d.profile.diet,
    },
    unita: d.settings.units,
    obiettiviNutrizionali: { kcal: t.kcal, proteine: t.protein, carboidrati: t.carbs, grassi: t.fat, stima: !t.overridden },
    programmaAttivo: d.program ? { nome: d.program.name, calendario: d.program.schedule.map((id, i) => ({ giorno: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'][i], schedaId: id })) } : null,
    schede: d.templates.filter((x) => tplIds.has(x.id) || d.templates.length <= 8).map((x) => ({
      id: x.id, nome: x.name,
      esercizi: x.exercises.map((e) => ({ uid: e.uid, esercizioId: e.exerciseId, nome: getExercise(e.exerciseId)?.name, serie: e.sets, rip: `${e.repMin}-${e.repMax}`, recuperoSec: e.restSec, caricoTargetKg: e.targetWeight ?? null })),
    })),
    ultimiAllenamenti: done.slice(-12).map((s) => {
      const st = sessionStats(s);
      return {
        data: s.startedAt.slice(0, 10), nome: s.name, durataMin: Math.round(st.durationMs / 60000), volumeKg: Math.round(st.volume), record: s.prs?.length ?? 0,
        esercizi: s.exercises.map((e) => ({ id: e.exerciseId, nome: getExercise(e.exerciseId)?.name, serie: e.sets.filter((x) => x.done).map((x) => `${x.weight ?? 0}x${x.reps ?? 0}${x.rpe ? `@${x.rpe}` : ''}`) })),
      };
    }),
    totaleAllenamenti: done.length,
    costanza: { settimanaCorrente: weekProgress(d.sessions, d.settings.weeklyWorkoutGoal ?? d.profile.daysPerWeek), serieSettimane: streaks(d.sessions, d.settings.weeklyWorkoutGoal ?? d.profile.daysPerWeek).weekStreak },
    seriePerMuscolo7gg: muscleSets(d.sessions, 7),
    nutrizione14gg: nutritionTrend(d.diary, 14).filter((x) => x.logged).map((x) => ({ data: x.date, kcal: Math.round(x.kcal), p: Math.round(x.protein), c: Math.round(x.carbs), g: Math.round(x.fat) })),
    benessere7gg: d.wellness.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((w) => ({ data: w.date, sonnoH: w.sleepHours ?? null, energia: w.energy ?? null, stress: w.stress ?? null, acquaMl: w.waterMl, indolenzimento: w.soreness ?? {} })),
    misure: d.measurements.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-8),
    cardio14gg: d.cardio.filter((c) => c.date >= dayKey(addDays(new Date(), -14))).map((c) => ({ data: c.date, tipo: c.type, min: c.durationMin, km: c.distanceKm ?? null })),
  };
}

const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

export function localCoachReply(question: string, d: CoachData): { text: string; suggestions: Suggestion[] } {
  const q = normalize(question);
  const done = completedSessions(d.sessions);
  const goal = d.settings.weeklyWorkoutGoal ?? d.profile.daysPerWeek;
  const suggestions: Suggestion[] = [];
  const parts: string[] = [];
  const tplsInProgram = d.templates.filter((t) => d.program?.schedule.includes(t.id));

  // Sostituzioni / alternative
  if (has(q, 'alternativ', 'sostitu', 'al posto', 'cambiare esercizio', 'fastidio', 'male a', 'dolore')) {
    const ex = EXERCISES.filter((e) => q.includes(normalize(e.name)) || q.includes(normalize(e.nameEn))).sort((a, b) => b.name.length - a.name.length)[0];
    if (has(q, 'dolore', 'male a', 'fastidio')) parts.push('In presenza di dolore interrompi l’esercizio che lo provoca e fatti valutare da un medico o fisioterapista: non posso fare diagnosi.');
    if (ex) {
      const subs = substitutes(ex.id, d.profile).slice(0, 5);
      parts.push(subs.length ? `Alternative a **${ex.name}** con la tua attrezzatura:\n${subs.map((s) => `• ${s.name}${s.stress.some((z) => d.profile.injuries.includes(z)) ? ' (sollecita una zona che hai segnalato)' : ''}`).join('\n')}` : `Non trovo alternative a ${ex.name} con l’attrezzatura indicata nel profilo.`);
      for (const t of d.templates) {
        const te = t.exercises.find((e) => e.exerciseId === ex.id);
        if (te && subs[0]) suggestions.push({ id: `swap_${t.id}_${te.uid}_${subs[0].id}`, kind: 'swap', title: `Sostituire ${ex.name} con ${subs[0].name} in “${t.name}”`, body: `Proposta basata sulla tua richiesta. ${subs[0].name} lavora sugli stessi muscoli principali.`, createdAt: new Date().toISOString(), status: 'pending', action: { type: 'update_template_exercise', templateId: t.id, uid: te.uid, patch: { exerciseId: subs[0].id, targetWeight: null } } });
      }
    } else parts.push('Dimmi il nome dell’esercizio (es. “alternative alla panca piana”) e ti propongo opzioni compatibili con la tua attrezzatura.');
    return { text: parts.join('\n\n'), suggestions: suggestions.slice(0, 2) };
  }

  // Progressione carichi
  if (has(q, 'progress', 'carich', 'aument', 'peso sul', 'kg', 'stall', 'fermo', 'bloccat')) {
    const adv = progressionAdvice(tplsInProgram.length ? tplsInProgram : d.templates, d.sessions, d.profile);
    if (!done.length) parts.push('Non hai ancora allenamenti completati: dopo le prime sessioni potrò proporti progressioni precise sui carichi.');
    else if (adv.length) {
      parts.push(`Ecco cosa vedo nei tuoi ultimi allenamenti:\n${adv.slice(0, 5).map((a) => `• ${a.title}`).join('\n')}`);
      adv.slice(0, 3).forEach((a) => suggestions.push(adviceToSuggestion(a)));
      parts.push('Ho preparato le proposte qui sotto: le applico alla scheda solo se le accetti.');
    } else parts.push('Al momento nessun esercizio ha raggiunto il limite alto del range di ripetizioni in tutte le serie. Metodo consigliato (doppia progressione): resta sul carico attuale finché non completi tutte le serie al massimo delle ripetizioni, poi aumenta di 1-2,5 kg.');
    const trends = Array.from(new Set(done.flatMap((s) => s.exercises.map((e) => e.exerciseId)))).map((id) => ({ id, t: exerciseTrend(d.sessions, id) })).filter((x) => x.t && x.t.points >= 3);
    const stalled = trends.filter((x) => x.t!.pct <= 0.005);
    if (stalled.length) parts.push(`Esercizi senza miglioramenti del 1RM stimato: ${stalled.slice(0, 4).map((x) => getExercise(x.id)?.name).join(', ')}. Possibili cause: recupero, sonno, calorie o tecnica. Valuta una settimana con volume ridotto o una variante.`);
    return { text: parts.join('\n\n'), suggestions };
  }

  // Alimentazione
  if (has(q, 'calori', 'macro', 'protein', 'carbo', 'grassi', 'mangi', 'aliment', 'dieta', 'nutri')) {
    const t = targetsFor(d.profile, d.settings, d.program);
    const days = nutritionTrend(d.diary, 7).filter((x) => x.logged);
    if (!days.length) return { text: `Non hai registrato pasti negli ultimi 7 giorni. Il tuo obiettivo indicativo è di circa ${t.kcal} kcal con ${t.protein} g di proteine. Registra qualche giorno nel diario e potrò analizzare l’andamento.`, suggestions };
    const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => days.reduce((a, x) => a + x[k], 0) / days.length;
    parts.push(`Media degli ultimi ${days.length} giorni registrati: **${fmtN(avg('kcal'))} kcal** (obiettivo ${t.kcal}), proteine ${fmtN(avg('protein'))} g (obiettivo ${t.protein}), carboidrati ${fmtN(avg('carbs'))} g, grassi ${fmtN(avg('fat'))} g.`);
    const dk = avg('kcal') - t.kcal;
    if (Math.abs(dk) > t.kcal * 0.1) parts.push(dk > 0 ? `Sei in media ${fmtN(dk)} kcal sopra l’obiettivo.${d.profile.goals.includes('fat_loss') ? ' Per il dimagrimento prova a ridurre condimenti, snack e bevande zuccherate.' : ''}` : `Sei in media ${fmtN(-dk)} kcal sotto l’obiettivo.${d.profile.goals.includes('hypertrophy') ? ' Per costruire muscolo un leggero surplus aiuta: aggiungi uno spuntino.' : ''}`);
    if (avg('protein') < t.protein * 0.85) parts.push(`Le proteine sono basse rispetto all’obiettivo: inserisci una fonte proteica a ogni pasto (yogurt greco, uova, legumi, carne, pesce, tofu).`);
    if (days.length < 5) parts.push('Registra almeno 5 giorni a settimana per un’analisi più affidabile.');
    parts.push('Sono stime indicative: per esigenze specifiche rivolgiti a un dietista o nutrizionista.');
    return { text: parts.join('\n\n'), suggestions };
  }

  // Recupero
  if (has(q, 'recuper', 'sonno', 'stanc', 'dormit', 'riposo', 'indolenz', 'energia')) {
    const today = d.wellness.find((w) => w.date === dayKey());
    const r = readiness(today, d.sessions, d.settings.sleepGoalH, d.cardio);
    parts.push(`${r.label}${r.score !== null ? ` (${r.score}/100)` : ''}. ${r.advice}`);
    if (r.factors.length) parts.push(r.factors.map((f) => `• ${f}`).join('\n'));
    const sleep = d.wellness.filter((w) => w.sleepHours).slice(-7);
    if (sleep.length >= 3) parts.push(`Sonno medio recente: ${fmtN(sleep.reduce((a, w) => a + (w.sleepHours ?? 0), 0) / sleep.length, 1)} h (obiettivo ${d.settings.sleepGoalH} h).`);
    return { text: parts.join('\n\n'), suggestions };
  }

  // Costanza
  if (has(q, 'costan', 'settiman', 'frequen', 'motiva', 'abitudin', 'saltat')) {
    const wk = weekProgress(d.sessions, goal);
    const st = streaks(d.sessions, goal);
    parts.push(`Questa settimana: **${wk.done}/${goal}** allenamenti. Settimane consecutive in linea con l’obiettivo: ${st.weekStreak}.`);
    const last4 = [0, 1, 2, 3].map((i) => done.filter((s) => (Date.now() - new Date(s.startedAt).getTime()) / 86400000 < 7 * (i + 1) && (Date.now() - new Date(s.startedAt).getTime()) / 86400000 >= 7 * i).length);
    parts.push(`Ultime 4 settimane (dalla più recente): ${last4.join(' · ')} allenamenti.`);
    if (last4.slice(0, 2).every((n) => n < goal)) parts.push(`Se l’obiettivo di ${goal} giorni è difficile da rispettare, valuta di ridurlo o di accorciare le sessioni: la costanza conta più della durata.`);
    return { text: parts.join('\n\n'), suggestions };
  }

  // Muscoli
  if (has(q, 'muscol', 'volume', 'serie', 'trascur', 'equilibr')) {
    const m = muscleSets(d.sessions, 7);
    const rows = Object.entries(m).filter(([k]) => k !== 'cardio' && k !== 'full_body').sort((a, b) => b[1]! - a[1]!);
    if (!rows.length) return { text: 'Nessun allenamento negli ultimi 7 giorni: non posso ancora valutare la distribuzione del volume.', suggestions };
    parts.push(`Serie settimanali per muscolo (principali = 1, secondari = 0,5):\n${rows.slice(0, 10).map(([k, v]) => `• ${MUSCLE_LABEL[k as keyof typeof MUSCLE_LABEL]}: ${round(v!, 1)}`).join('\n')}`);
    const low = ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders'].filter((k) => (m[k as keyof typeof m] ?? 0) < 4);
    if (low.length) parts.push(`Gruppi con poco volume questa settimana: ${low.map((k) => MUSCLE_LABEL[k as keyof typeof MUSCLE_LABEL].toLowerCase()).join(', ')}.`);
    return { text: parts.join('\n\n'), suggestions };
  }

  // Riepilogo generale
  const wk = weekProgress(d.sessions, goal);
  parts.push(`Ciao ${d.profile.name}! Ecco il tuo quadro attuale:`);
  parts.push(`• Allenamenti completati: ${done.length} (questa settimana ${wk.done}/${goal})`);
  const last = done[done.length - 1];
  if (last) { const st = sessionStats(last); parts.push(`• Ultimo allenamento: ${last.name}, ${Math.round(st.durationMs / 60000)} min, ${st.sets} serie${last.prs?.length ? `, ${last.prs.length} record` : ''}`); }
  const ws = d.measurements.filter((m) => m.weightKg).sort((a, b) => a.date.localeCompare(b.date));
  if (ws.length >= 2) parts.push(`• Peso: da ${ws[0].weightKg} a ${ws[ws.length - 1].weightKg} kg (obiettivo ${d.profile.targetWeightKg} kg)`);
  const top = Array.from(new Set(done.flatMap((s) => s.exercises.map((e) => e.exerciseId)))).map((id) => ({ id, h: exerciseHistory(d.sessions, id) })).filter((x) => x.h.length >= 2).sort((a, b) => b.h.length - a.h.length)[0];
  if (top) { const f = top.h[0], l = top.h[top.h.length - 1]; parts.push(`• ${getExercise(top.id)?.name}: 1RM stimato da ${round(f.e1rm, 1)} a ${round(l.e1rm, 1)} kg`); }
  parts.push('\nPuoi chiedermi di: analizzare i carichi e proporre progressioni, valutare la costanza, controllare calorie e proteine, suggerire alternative a un esercizio o valutare il recupero.');
  return { text: parts.join('\n'), suggestions };
}
