// Tipi di dominio condivisi in tutta l'app.

export type Sex = 'male' | 'female' | 'unspecified';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Goal =
  | 'hypertrophy' | 'fat_loss' | 'recomp' | 'strength'
  | 'endurance' | 'fitness' | 'mobility' | 'maintenance';
export type SplitPref = 'full_body' | 'upper_lower' | 'ppl' | 'bro_split' | 'custom' | 'auto';
export type ActivityLevel = 'sedentary' | 'moderate' | 'high';
export type SessionStyle = 'short_intense' | 'long';
export type Units = 'kg' | 'lb';
export type Theme = 'dark' | 'light' | 'system';

export type MuscleGroup =
  | 'chest' | 'back' | 'lats' | 'traps' | 'shoulders' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'biceps' | 'triceps' | 'forearms' | 'abs' | 'obliques' | 'lower_back'
  | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'abductors' | 'calves' | 'hip_flexors'
  | 'cardio' | 'full_body' | 'neck';

export type Equipment =
  | 'bodyweight' | 'dumbbell' | 'barbell' | 'ez_bar' | 'flat_bench' | 'incline_bench' | 'squat_rack'
  | 'smith' | 'cable' | 'lat_machine' | 'leg_press' | 'leg_extension' | 'leg_curl' | 'chest_press'
  | 'pec_deck' | 'shoulder_machine' | 'pullup_bar' | 'parallel_bars' | 'kettlebell' | 'band' | 'trx'
  | 'dip_bar' | 'mat' | 'jump_rope' | 'bike' | 'treadmill' | 'elliptical' | 'rower' | 'machine_other'
  | 'medicine_ball' | 'box' | 'hack_squat' | 'calf_machine' | 'hip_thrust_machine' | 'ab_wheel' | 'other';

export type Injury =
  | 'shoulder' | 'lower_back' | 'knee' | 'wrist' | 'elbow' | 'neck' | 'hip' | 'ankle';

export interface Profile {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  bodyFatPct?: number | null;
  level: Level;
  goals: Goal[];
  daysPerWeek: number;
  minutesPerSession: number;
  preferredDays: number[]; // 0=lun ... 6=dom
  sessionStyle: SessionStyle;
  split: SplitPref;
  injuries: Injury[];
  injuryNotes: string;
  focusMuscles: MuscleGroup[];
  lessMuscles: MuscleGroup[];
  exercisePrefs: { preferFree: boolean; preferMachines: boolean; avoidIds: string[] };
  activity: ActivityLevel;
  location: ('home' | 'outdoor' | 'commercial_gym' | 'custom')[];
  equipment: Equipment[];
  fullGym: boolean;
  diet: { pattern: 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian'; allergies: string; mealsPerDay: number };
  onboardedAt?: string;
  equipmentSetAt?: string;
  /** Caratteristiche delle macchine cardio dell'utente (es. livelli di resistenza della cyclette). */
  cardioMachines?: Partial<Record<CardioMachine, MachineSpec>>;
  /** percorsi cardio creati dall'utente (vedi lib/routes.ts) */
  cardioRoutes?: import('./routes').CustomRoute[];
}

// ---- Cardio integrato nelle schede ----
export type CardioMachine = 'treadmill' | 'bike' | 'elliptical' | 'rower' | 'jump_rope' | 'outdoor_walk' | 'outdoor_run' | 'other';
export type CardioIntensity = 'light' | 'moderate' | 'vigorous' | 'high';
export type CardioPhaseKind = 'warmup' | 'work' | 'recovery' | 'cooldown';
export interface MachineSpec { maxResistance?: number; maxIncline?: number; maxSpeed?: number }

export interface CardioPhase {
  uid: string;
  kind: CardioPhaseKind;
  label?: string;
  durationSec: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  resistance?: number | null;
  rpm?: number | null;
  intensity: CardioIntensity;
}

export interface CardioPlan {
  machine: CardioMachine;
  /** continuo oppure a intervalli (riscaldamento + ciclo ripetuto + defaticamento) */
  mode: 'steady' | 'intervals';
  title?: string;
  /** durata totale prevista in minuti (per gli intervalli è calcolata dalle fasi) */
  durationMin: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  resistance?: number | null;
  /** livello massimo della macchina dell'utente (le cyclette non sono tutte uguali) */
  resistanceMax?: number | null;
  rpm?: number | null;
  intensity: CardioIntensity;
  hrMin?: number | null;
  hrMax?: number | null;
  warmup?: CardioPhase | null;
  cycle?: CardioPhase[];
  repeat?: number;
  cooldown?: CardioPhase | null;
  /** progressione automatica: +stepMin quando la sessione viene completata come previsto, fino a capMin */
  progression?: { stepMin: number; capMin: number } | null;
}

export interface CardioActual {
  durationSec: number;
  distanceKm?: number | null;
  speedKmh?: number | null;
  inclinePct?: number | null;
  resistance?: number | null;
  rpm?: number | null;
  avgHr?: number | null;
  /** stima, non misura */
  kcal?: number | null;
  intensity?: CardioIntensity;
  notes?: string;
  completedAt: string;
  /** true se le calorie sono quelle misurate dall'attrezzo collegato (non una stima dell'app) */
  kcalFromMachine?: boolean;
  /** nome dell'attrezzo Bluetooth da cui arrivano i dati (es. "iConsole+0006") */
  device?: string | null;
}

/** Riepilogo dei dati letti dall'attrezzo Bluetooth (FTMS) durante un'attività cardio. */
export interface CardioMachineData {
  device: string;
  kind: 'bike' | 'treadmill';
  /** secondi in cui l'attrezzo era in movimento */
  movingSec: number;
  distanceM: number;
  kcal: number;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  avgCadence?: number | null;
  avgResistance?: number | null;
  avgIncline?: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  updatedAt: string;
}

export interface CardioTimer { running: boolean; startedAt: number | null; accumulatedMs: number }

export interface CardioLogState { plan: CardioPlan; timer: CardioTimer; actual?: CardioActual | null; done: boolean; machine?: CardioMachineData | null }

export interface Settings {
  units: Units;
  theme: Theme;
  restDefaultSec: number;
  notifications: {
    workout: boolean; workoutTime: string;
    weight: boolean; weightDay: number;
    water: boolean; waterEveryMin: number; waterFrom: string; waterTo: string;
    restDays: boolean; prs: boolean; weeklySummary: boolean;
  };
  waterGoalMl: number;
  sleepGoalH: number;
  nutritionOverride?: { kcal: number; protein: number; carbs: number; fat: number } | null;
  weeklyWorkoutGoal?: number;
  monthlyWorkoutGoal?: number;
}

// ---- Allenamento ----
export interface TemplateExercise {
  uid: string;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  targetWeight?: number | null;
  notes?: string;
  supersetWith?: string | null;
  /** Presente solo per le attività cardio: parametri previsti (durata, velocità, pendenza, resistenza…). */
  cardio?: CardioPlan | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  notes?: string;
  exercises: TemplateExercise[];
  source: 'manual' | 'generated';
  programId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Program {
  id: string;
  name: string;
  description?: string;
  // giorno settimana (0=lun) -> template id o null (riposo)
  schedule: (string | null)[];
  active: boolean;
  source: 'manual' | 'generated';
  createdAt: string;
  meta?: { split?: string; goal?: Goal; level?: Level; mode?: string };
}

export interface SetLog {
  uid: string;
  weight: number | null; // sempre kg internamente
  reps: number | null;
  rpe?: number | null;
  rir?: number | null;
  done: boolean;
  type?: 'normal' | 'warmup' | 'drop' | 'failure';
  completedAt?: string | null;
}

export interface ExerciseLog {
  uid: string;
  exerciseId: string;
  restSec: number;
  repMin: number;
  repMax: number;
  notes?: string;
  sets: SetLog[];
  /** Attività cardio: piano, timer e risultati effettivi (le serie restano vuote). */
  cardio?: CardioLogState | null;
}

export interface WorkoutSession {
  id: string;
  name: string;
  templateId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  pausedMs: number;
  pausedAt?: string | null;
  exercises: ExerciseLog[];
  notes?: string;
  status: 'active' | 'completed' | 'discarded';
  prs?: PRRecord[];
  rating?: number | null;
}

export interface PRRecord {
  exerciseId: string;
  kind: 'weight' | 'e1rm' | 'reps' | 'volume';
  value: number;
  reps?: number;
  date: string;
  sessionId: string;
}

// ---- Nutrizione ----
export type MealSlot = 'breakfast' | 'snack_am' | 'lunch' | 'snack_pm' | 'dinner' | 'other';

export interface Food {
  id: string;
  name: string;
  brand?: string;
  kcal: number; protein: number; carbs: number; fat: number; // per 100 g
  fiber?: number;
  category?: string;
  unitGrams?: number; // peso di 1 porzione/pezzo
  unitName?: string;
  /** Sinonimi usati solo dalla ricerca (es. "arancina" per arancino). */
  keywords?: string;
  custom?: boolean;
  source?: 'db' | 'custom' | 'openfoodfacts';
  // ---- prodotti confezionati (scanner) ----
  barcode?: string;
  /** Unità di riferimento dei valori: per 100 g oppure per 100 ml. */
  unit?: 'g' | 'ml';
  sugars?: number | null; satFat?: number | null; salt?: number | null;
  /** Nutrienti non disponibili nella fonte (i campi numerici valgono 0 ma non sono dati reali). */
  missing?: NutrientKey[];
  /** Note su valori ricavati: energia da kJ, sale da sodio, valori per 100 calcolati dalla porzione. */
  derived?: string[];
  imageUrl?: string;
  packageQty?: number | null; packageUnit?: 'g' | 'ml' | null; packageLabel?: string;
  servingQty?: number | null; servingUnit?: 'g' | 'ml' | null; servingLabel?: string;
  ingredients?: string; allergens?: string[]; traces?: string[]; categories?: string;
  nutriscore?: string; nova?: number;
  /** Prodotto di Open Food Facts corretto dall'utente. */
  editedFromOff?: boolean;
  fetchedAt?: string; scannedAt?: string; scanCount?: number; updatedAt?: string;
  /** Salvato nei miei prodotti (catalogo personale): non conta nei valori giornalieri. */
  savedAt?: string;
}

export type NutrientKey = 'kcal' | 'protein' | 'carbs' | 'sugars' | 'fat' | 'satFat' | 'fiber' | 'salt';

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  foodId?: string;
  recipeId?: string;
  name: string;
  /** Quantità consumata, in grammi oppure in ml se unit = 'ml'. */
  grams: number;
  unit?: 'g' | 'ml';
  kcal: number; protein: number; carbs: number; fat: number; // totali per la quantità
  createdAt: string;
}

export interface RecipeIngredient { foodId: string; name: string; grams: number; per100: { kcal: number; protein: number; carbs: number; fat: number } }
export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions?: string;
  createdAt: string;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: Omit<DiaryEntry, 'id' | 'date' | 'createdAt' | 'slot'>[];
  createdAt: string;
}

export interface MealPlanItem { uid: string; slot: MealSlot; kind: 'food' | 'recipe'; refId: string; name: string; grams: number; servings?: number }
export interface MealPlanDay { id: string; date: string; items: MealPlanItem[] }

// ---- Corpo, cardio, benessere ----
export interface Measurement {
  id: string;
  date: string;
  weightKg?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  hipsCm?: number | null;
  bodyFatPct?: number | null;
  notes?: string;
}

export interface ProgressPhoto {
  id: string;
  date: string;
  pose: 'front' | 'side' | 'back' | 'other';
  storagePath?: string; // supabase storage
  localKey?: string; // chiave blob locale
  notes?: string;
}

export type CardioType = 'walk' | 'run' | 'treadmill' | 'bike' | 'elliptical' | 'rower' | 'swim' | 'other';
export interface CardioLog {
  id: string;
  date: string;
  type: CardioType;
  label?: string;
  durationMin: number;
  distanceKm?: number | null;
  avgSpeedKmh?: number | null;
  kcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  notes?: string;
  createdAt: string;
}

export interface WellnessDay {
  id: string; // = date
  date: string;
  sleepHours?: number | null;
  sleepQuality?: number | null; // 1-5
  bedTime?: string | null;
  wakeTime?: string | null;
  sleepNotes?: string;
  waterMl: number;
  energy?: number | null; // 1-5
  stress?: number | null; // 1-5
  soreness?: Partial<Record<MuscleGroup, number>>; // 0-3
  mood?: number | null;
  recoveryNotes?: string;
}

// ---- AI / coach ----
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; source?: 'ai' | 'local' }
export interface ChatThread { id: string; title: string; messages: ChatMessage[]; updatedAt: string }

export interface Suggestion {
  id: string;
  kind: 'progression' | 'deload' | 'consistency' | 'nutrition' | 'recovery' | 'swap';
  title: string;
  body: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'dismissed';
  action?: { type: 'update_template_exercise'; templateId: string; uid: string; patch: Partial<TemplateExercise> } | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: 'pr' | 'reminder' | 'summary' | 'badge' | 'coach' | 'system';
  createdAt: string;
  read: boolean;
  link?: string;
}

export interface Badge { id: string; earnedAt: string }
