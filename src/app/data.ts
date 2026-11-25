/** Hook e azioni di dominio sopra lo store. */
import { store, useCollection } from '@/db/store';
import type {
  AppNotification, Badge, CardioLog, ChatThread, DiaryEntry, Food, MealPlanDay, Measurement, ProgressPhoto, Profile, Program,
  Recipe, SavedMeal, Settings, Suggestion, WellnessDay, WorkoutSession, WorkoutTemplate,
} from '@/lib/types';
import { uid } from '@/lib/util';
import type { HealthImportSummary } from '@/lib/health';

export interface HealthMeta {
  lastImportAt: string;
  summary: HealthImportSummary | null;
  /** pesate fino a questo istante già importate (le cancellate a mano non tornano) */
  weightCursor: string | null;
  /** messaggio se l'ultima importazione non conteneva dati leggibili */
  error?: string | null;
  /** righe non riconosciute dell'ultima importazione (esempi) */
  invalid?: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg', theme: 'dark', restDefaultSec: 90,
  notifications: { workout: true, workoutTime: '18:00', weight: true, weightDay: 0, water: false, waterEveryMin: 90, waterFrom: '09:00', waterTo: '21:00', restDays: true, prs: true, weeklySummary: true },
  waterGoalMl: 2000, sleepGoalH: 8, nutritionOverride: null,
};

/** Articolo aggiunto a mano o da un prodotto (foodId) alla lista della spesa. */
export interface ShoppingExtra { id: string; name: string; foodId?: string; brand?: string; imageUrl?: string }
export interface Meta { favorites: string[]; recent: string[]; favoriteFoods: string[]; recentFoods: string[]; shoppingChecked: string[]; shoppingExtra?: ShoppingExtra[]; /** Alimenti del database generico salvati tra i miei prodotti (gli altri usano Food.savedAt). */ savedFoods?: string[]; lastSummaryWeek?: string; lastReminder?: Record<string, string>; /** Ultima importazione da Apple Salute (Comandi Rapidi). */ health?: HealthMeta }
const DEFAULT_META: Meta = { favorites: [], recent: [], favoriteFoods: [], recentFoods: [], shoppingChecked: [] };

export function useProfile(): Profile | undefined { return useCollection<Profile>('profile').find((p: any) => p.id === 'me'); }
export function useSettings(): Settings {
  const s = useCollection<Settings>('settings').find((p: any) => p.id === 'me');
  return s ? { ...DEFAULT_SETTINGS, ...s, notifications: { ...DEFAULT_SETTINGS.notifications, ...(s as any).notifications } } : DEFAULT_SETTINGS;
}
export function useMeta(): Meta {
  const m = useCollection<Meta>('meta').find((p: any) => p.id === 'me');
  return m ? { ...DEFAULT_META, ...m } : DEFAULT_META;
}
export const useTemplates = () => useCollection<WorkoutTemplate>('templates');
export const usePrograms = () => useCollection<Program>('programs');
export const useActiveProgram = () => usePrograms().find((p) => p.active);
export const useSessions = () => useCollection<WorkoutSession>('sessions');
export const useCustomFoods = () => useCollection<Food>('foods');
export const useDiary = () => useCollection<DiaryEntry>('diary');
export const useRecipes = () => useCollection<Recipe>('recipes');
export const useSavedMeals = () => useCollection<SavedMeal>('savedMeals');
export const useMealPlans = () => useCollection<MealPlanDay>('mealPlans');
export const useMeasurements = () => useCollection<Measurement>('measurements');
export const usePhotos = () => useCollection<ProgressPhoto>('photos');
export const useCardio = () => useCollection<CardioLog>('cardio');
export const useWellness = () => useCollection<WellnessDay>('wellness');
export const useChats = () => useCollection<ChatThread>('chats');
export const useSuggestions = () => useCollection<Suggestion>('suggestions');
export const useNotifications = () => useCollection<AppNotification>('notifications');
export const useBadges = () => useCollection<Badge>('badges');

export const saveProfile = (p: Profile) => store.put('profile', 'me', p);
export const patchProfile = (p: Partial<Profile>) => store.patch<Profile>('profile', 'me', p);
export const patchSettings = (p: Partial<Settings>) => {
  const cur = store.get<Settings>('settings', 'me') ?? DEFAULT_SETTINGS;
  return store.put('settings', 'me', { ...DEFAULT_SETTINGS, ...cur, ...p, notifications: { ...DEFAULT_SETTINGS.notifications, ...cur.notifications, ...(p.notifications ?? {}) } });
};
export const patchMeta = (p: Partial<Meta>) => store.put('meta', 'me', { ...DEFAULT_META, ...(store.get<Meta>('meta', 'me') ?? {}), ...p });

export function toggleFavorite(exId: string) {
  const m = { ...DEFAULT_META, ...(store.get<Meta>('meta', 'me') ?? {}) };
  const fav = m.favorites.includes(exId) ? m.favorites.filter((x) => x !== exId) : [exId, ...m.favorites];
  return patchMeta({ favorites: fav });
}
export function pushRecent(exId: string) {
  const m = { ...DEFAULT_META, ...(store.get<Meta>('meta', 'me') ?? {}) };
  if (m.recent[0] === exId) return;
  return patchMeta({ recent: [exId, ...m.recent.filter((x) => x !== exId)].slice(0, 20) });
}
export function pushRecentFood(foodId: string) {
  const m = { ...DEFAULT_META, ...(store.get<Meta>('meta', 'me') ?? {}) };
  return patchMeta({ recentFoods: [foodId, ...m.recentFoods.filter((x) => x !== foodId)].slice(0, 30) });
}

export function notify(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>, id = uid('ntf_')) {
  const full: AppNotification = { ...n, id, createdAt: new Date().toISOString(), read: false };
  store.put('notifications', id, full);
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(n.title, { body: n.body, icon: './icon.svg', tag: id });
    }
  } catch { /* ignore */ }
  return full;
}

export async function saveTemplate(t: WorkoutTemplate) { return store.put('templates', t.id, { ...t, updatedAt: new Date().toISOString() }); }
export async function saveProgram(p: Program) { return store.put('programs', p.id, p); }
export async function activateProgram(id: string) {
  for (const p of store.list<Program>('programs')) if (p.active !== (p.id === id)) await store.put('programs', p.id, { ...p, active: p.id === id });
}
