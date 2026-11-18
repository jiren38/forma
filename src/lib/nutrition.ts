import type { DiaryEntry, Food, Profile, Settings } from './types';
import { ACTIVITY_INFO } from './labels';
import { round } from './util';

export interface NutritionTargets {
  bmr: number; tdee: number; kcal: number; protein: number; carbs: number; fat: number;
  method: 'mifflin' | 'katch'; adjustment: number; explanation: string; overridden: boolean;
}

/** Stime: Mifflin-St Jeor (o Katch-McArdle se la % di grasso è nota). Valori indicativi, non prescrizioni. */
export function computeTargets(p: Profile, settings?: Settings | null, workoutsPerWeek?: number): NutritionTargets {
  const w = p.weightKg, h = p.heightCm, a = p.age;
  let bmr: number; let method: 'mifflin' | 'katch' = 'mifflin';
  if (p.bodyFatPct && p.bodyFatPct > 3 && p.bodyFatPct < 60) {
    const lbm = w * (1 - p.bodyFatPct / 100);
    bmr = 370 + 21.6 * lbm; method = 'katch';
  } else {
    const s = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
    bmr = 10 * w + 6.25 * h - 5 * a + s;
  }
  const days = workoutsPerWeek ?? p.daysPerWeek ?? 3;
  const factor = ACTIVITY_INFO[p.activity ?? 'moderate'].factor + Math.min(days, 6) * 0.025;
  const tdee = bmr * factor;
  const goals = p.goals ?? [];
  let adj = 0;
  if (goals.includes('fat_loss')) adj = -0.2;
  else if (goals.includes('recomp')) adj = -0.08;
  else if (goals.includes('hypertrophy')) adj = 0.1;
  else if (goals.includes('strength')) adj = 0.05;
  // coerenza con peso obiettivo
  if (!goals.includes('fat_loss') && p.targetWeightKg && p.targetWeightKg < w - 1 && adj > 0) adj = 0;
  const kcal = Math.max(p.sex === 'female' ? 1200 : 1400, tdee * (1 + adj));
  const proteinPerKg = goals.some((g) => ['hypertrophy', 'recomp', 'fat_loss', 'strength'].includes(g)) ? 1.8 : 1.4;
  const refW = p.bodyFatPct ? w : Math.min(w, (p.heightCm - 100) * 1.15); // evita sovrastime in sovrappeso
  const protein = Math.round(proteinPerKg * Math.max(refW, w * 0.8));
  const fat = Math.round(Math.max(0.8 * w, (kcal * 0.25) / 9));
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const base: NutritionTargets = {
    bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein, carbs, fat, method, adjustment: adj, overridden: false,
    explanation: `Metabolismo basale stimato con la formula ${method === 'katch' ? 'Katch-McArdle (usa la massa magra)' : 'Mifflin-St Jeor'}, moltiplicato per un fattore di attività di ${round(factor, 2)}. ${adj === 0 ? 'Calorie di mantenimento.' : adj < 0 ? `Deficit del ${Math.round(-adj * 100)}% per il dimagrimento.` : `Surplus del ${Math.round(adj * 100)}% per la crescita muscolare.`} Proteine ${proteinPerKg} g/kg, grassi almeno 0,8 g/kg, il resto carboidrati.`,
  };
  const o = settings?.nutritionOverride;
  if (o) return { ...base, kcal: o.kcal, protein: o.protein, carbs: o.carbs, fat: o.fat, overridden: true };
  return base;
}

export function macrosFor(f: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'>, grams: number) {
  const k = grams / 100;
  return { kcal: round(f.kcal * k, 0), protein: round(f.protein * k, 1), carbs: round(f.carbs * k, 1), fat: round(f.fat * k, 1) };
}

export function totals(entries: Pick<DiaryEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>[]) {
  return entries.reduce((t, e) => ({ kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

export function bmi(p: Pick<Profile, 'weightKg' | 'heightCm'>) { return p.weightKg / ((p.heightCm / 100) ** 2); }
