import type { ActivityLevel, CardioType, Equipment, Goal, Injury, Level, MealSlot, MuscleGroup, SplitPref } from './types';

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Petto', back: 'Schiena', lats: 'Gran dorsale', traps: 'Trapezi', shoulders: 'Spalle',
  front_delts: 'Deltoide anteriore', side_delts: 'Deltoide laterale', rear_delts: 'Deltoide posteriore',
  biceps: 'Bicipiti', triceps: 'Tricipiti', forearms: 'Avambracci', abs: 'Addominali', obliques: 'Obliqui',
  lower_back: 'Lombari', quads: 'Quadricipiti', hamstrings: 'Femorali', glutes: 'Glutei', adductors: 'Adduttori',
  abductors: 'Abduttori', calves: 'Polpacci', hip_flexors: 'Flessori dell’anca', cardio: 'Sistema cardiovascolare',
  full_body: 'Corpo intero', neck: 'Collo',
};

/** Gruppi selezionabili nell'onboarding (focus / meno frequenti). */
export const MAIN_MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves'];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  bodyweight: 'Corpo libero', dumbbell: 'Manubri', barbell: 'Bilanciere', ez_bar: 'Bilanciere EZ', flat_bench: 'Panca piana',
  incline_bench: 'Panca inclinabile', squat_rack: 'Rack per squat', smith: 'Smith machine', cable: 'Cavi e pulley',
  lat_machine: 'Lat machine', leg_press: 'Leg press', leg_extension: 'Leg extension', leg_curl: 'Leg curl',
  chest_press: 'Chest press', pec_deck: 'Pec deck', shoulder_machine: 'Macchina deltoidi', pullup_bar: 'Sbarra per trazioni',
  parallel_bars: 'Parallele', kettlebell: 'Kettlebell', band: 'Elastici', trx: 'TRX', dip_bar: 'Sbarra per dip',
  mat: 'Tappetino', jump_rope: 'Corda per saltare', bike: 'Cyclette', treadmill: 'Tapis roulant', elliptical: 'Ellittica',
  rower: 'Vogatore', machine_other: 'Altri macchinari', medicine_ball: 'Palla medica', box: 'Box / step',
  hack_squat: 'Hack squat', calf_machine: 'Calf machine', hip_thrust_machine: 'Hip thrust machine', ab_wheel: 'Ruota addominale',
  other: 'Altri strumenti',
};

/** Attrezzatura standard di una palestra ben attrezzata. */
export const FULL_GYM: Equipment[] = [
  'bodyweight', 'dumbbell', 'barbell', 'ez_bar', 'flat_bench', 'incline_bench', 'squat_rack', 'smith', 'cable', 'lat_machine',
  'leg_press', 'leg_extension', 'leg_curl', 'chest_press', 'pec_deck', 'shoulder_machine', 'pullup_bar', 'parallel_bars',
  'kettlebell', 'band', 'dip_bar', 'mat', 'jump_rope', 'bike', 'treadmill', 'elliptical', 'rower', 'machine_other',
  'medicine_ball', 'box', 'hack_squat', 'calf_machine', 'ab_wheel',
];

export const SELECTABLE_EQUIPMENT: Equipment[] = [
  'dumbbell', 'barbell', 'ez_bar', 'flat_bench', 'incline_bench', 'squat_rack', 'smith', 'cable', 'lat_machine', 'leg_press',
  'leg_extension', 'leg_curl', 'chest_press', 'pec_deck', 'shoulder_machine', 'hack_squat', 'calf_machine', 'pullup_bar',
  'parallel_bars', 'dip_bar', 'kettlebell', 'band', 'trx', 'mat', 'medicine_ball', 'box', 'ab_wheel', 'jump_rope', 'bike',
  'treadmill', 'elliptical', 'rower', 'machine_other', 'other',
];

export const LEVEL_INFO: Record<Level, { label: string; desc: string }> = {
  beginner: { label: 'Principiante', desc: 'Ti alleni da meno di 6 mesi o riprendi dopo una lunga pausa. Impariamo la tecnica con progressioni semplici.' },
  intermediate: { label: 'Intermedio', desc: 'Ti alleni con costanza da 6 mesi a 2-3 anni e conosci i fondamentali. Servono volume e progressioni strutturate.' },
  advanced: { label: 'Avanzato', desc: 'Oltre 3 anni di allenamento continuativo e tecnica solida. Programmi con più volume, intensità e periodizzazione.' },
};

export const GOAL_INFO: Record<Goal, { label: string; desc: string }> = {
  hypertrophy: { label: 'Massa muscolare', desc: 'Ipertrofia: più muscolo, volume e ripetizioni medie' },
  fat_loss: { label: 'Dimagrimento', desc: 'Perdere grasso mantenendo il muscolo' },
  recomp: { label: 'Ricomposizione', desc: 'Meno grasso e più muscolo insieme' },
  strength: { label: 'Forza', desc: 'Carichi alti, poche ripetizioni' },
  endurance: { label: 'Resistenza muscolare', desc: 'Più ripetizioni, recuperi brevi' },
  fitness: { label: 'Forma fisica generale', desc: 'Stare bene e muoversi meglio' },
  mobility: { label: 'Mobilità e flessibilità', desc: 'Articolazioni più libere' },
  maintenance: { label: 'Mantenimento', desc: 'Conservare peso e forma attuali' },
};

export const SPLIT_INFO: Record<SplitPref, { label: string; desc: string }> = {
  full_body: { label: 'Full body', desc: 'Tutto il corpo in ogni seduta. Ideale 2-3 giorni.' },
  upper_lower: { label: 'Upper / Lower', desc: 'Alterna parte alta e bassa. Ideale 4 giorni.' },
  ppl: { label: 'Push / Pull / Legs', desc: 'Spinta, trazione, gambe. Ideale 3 o 6 giorni.' },
  bro_split: { label: 'Bro split', desc: 'Un gruppo muscolare al giorno. 5 giorni.' },
  custom: { label: 'Scheda personalizzata', desc: 'Creerai tu le tue schede.' },
  auto: { label: 'Decide l’app', desc: 'Scegliamo noi in base ai tuoi dati.' },
};

export const ACTIVITY_INFO: Record<ActivityLevel, { label: string; desc: string; factor: number }> = {
  sedentary: { label: 'Sedentaria', desc: 'Lavoro da scrivania, pochi passi', factor: 1.35 },
  moderate: { label: 'Moderata', desc: 'In piedi spesso, 7-10k passi', factor: 1.5 },
  high: { label: 'Elevata', desc: 'Lavoro fisico o molto movimento', factor: 1.7 },
};

export const INJURY_LABEL: Record<Injury, string> = {
  shoulder: 'Spalla', lower_back: 'Zona lombare', knee: 'Ginocchio', wrist: 'Polso', elbow: 'Gomito', neck: 'Collo/cervicale', hip: 'Anca', ankle: 'Caviglia',
};

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Colazione', snack_am: 'Spuntino', lunch: 'Pranzo', snack_pm: 'Merenda', dinner: 'Cena', other: 'Altri pasti',
};
export const MEAL_ORDER: MealSlot[] = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'other'];

export const CARDIO_INFO: Record<CardioType, { label: string; met: number; pattern: string }> = {
  walk: { label: 'Camminata', met: 3.5, pattern: 'walk' },
  run: { label: 'Corsa', met: 9.8, pattern: 'run' },
  treadmill: { label: 'Tapis roulant', met: 7, pattern: 'run' },
  bike: { label: 'Cyclette', met: 6.8, pattern: 'bike' },
  elliptical: { label: 'Ellittica', met: 5, pattern: 'elliptical' },
  rower: { label: 'Vogatore', met: 7, pattern: 'rower' },
  swim: { label: 'Nuoto', met: 7, pattern: 'run' },
  other: { label: 'Altra attività', met: 5, pattern: 'jumping_jack' },
};

export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const DAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
