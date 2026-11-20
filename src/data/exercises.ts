/**
 * Database esercizi. Struttura espandibile: aggiungere un esercizio = una riga.
 * Il contenuto tecnico è ereditato dalla famiglia (exercise-families.ts) e può essere personalizzato con `cue`/`desc`.
 */
import type { Equipment, Injury, MuscleGroup } from '@/lib/types';
import { FAMILIES } from './exercise-families';

export type ExCategory =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core' | 'quads' | 'hamstrings' | 'glutes'
  | 'calves' | 'legs' | 'full_body' | 'cardio' | 'mobility' | 'bodyweight' | 'functional';

export const CATEGORY_LABEL: Record<ExCategory, string> = {
  chest: 'Petto', back: 'Schiena', shoulders: 'Spalle', biceps: 'Bicipiti', triceps: 'Tricipiti', forearms: 'Avambracci',
  core: 'Addominali e core', quads: 'Quadricipiti', hamstrings: 'Femorali', glutes: 'Glutei', calves: 'Polpacci', legs: 'Gambe',
  full_body: 'Full body', cardio: 'Cardio', mobility: 'Mobilità e stretching', bodyweight: 'Corpo libero', functional: 'Funzionali',
};
export const CATEGORY_ORDER: ExCategory[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'legs', 'full_body', 'cardio', 'mobility', 'bodyweight', 'functional'];

export type ExKind = 'free' | 'machine' | 'cable' | 'bodyweight' | 'cardio' | 'mobility';
export const KIND_LABEL: Record<ExKind, string> = { free: 'Pesi liberi', machine: 'Macchinari', cable: 'Cavi', bodyweight: 'Corpo libero', cardio: 'Cardio', mobility: 'Mobilità' };

export type Movement = 'push_h' | 'push_v' | 'pull_h' | 'pull_v' | 'squat' | 'hinge' | 'lunge' | 'isolation' | 'core' | 'carry' | 'plyo' | 'cardio' | 'mobility';
export const MOVEMENT_LABEL: Record<Movement, string> = {
  push_h: 'Spinta orizzontale', push_v: 'Spinta verticale', pull_h: 'Trazione orizzontale', pull_v: 'Trazione verticale',
  squat: 'Squat', hinge: 'Hip hinge', lunge: 'Affondo / unilaterale', isolation: 'Isolamento', core: 'Core', carry: 'Trasporto',
  plyo: 'Pliometria', cardio: 'Cardio', mobility: 'Mobilità',
};

export type Tracking = 'weight_reps' | 'reps' | 'time' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  nameEn: string;
  family: string;
  pattern: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  equipment: Equipment[]; // tutto ciò che serve (vuoto = corpo libero)
  difficulty: 1 | 2 | 3;
  kind: ExKind;
  movement: Movement;
  category: ExCategory;
  mechanic: 'compound' | 'isolation';
  tracking: Tracking;
  unilateral?: boolean;
  functional?: boolean;
  stress: Injury[]; // zone sollecitate (per segnalare incompatibilità con infortuni)
  cue?: string;
  desc?: string;
}

// Zone sollecitate per famiglia
const FAMILY_STRESS: Record<string, Injury[]> = {
  squat: ['knee', 'lower_back'], hinge: ['lower_back'], deadlift: ['lower_back'], lunge: ['knee'], step_up: ['knee'],
  leg_press: ['knee', 'lower_back'], knee_extension: ['knee'], bench_press: ['shoulder', 'wrist'], db_press: ['shoulder'],
  fly: ['shoulder'], push_up: ['wrist', 'shoulder'], dip: ['shoulder', 'elbow'], overhead_press: ['shoulder', 'lower_back'],
  raise: ['shoulder'], vertical_pull: ['shoulder', 'elbow'], row: ['lower_back'], pullover: ['shoulder'], triceps_ext: ['elbow'],
  close_grip_press: ['elbow', 'wrist'], curl: ['elbow'], wrist: ['wrist'], crunch: ['neck'], leg_raise: ['lower_back'],
  plyo: ['knee', 'ankle'], conditioning: ['knee', 'wrist'], ab_wheel: ['lower_back', 'shoulder'], shrug: ['neck'],
  back_extension: ['lower_back'], plank: ['wrist'], carry: ['lower_back'], hip_thrust: ['lower_back'],
};

const MOVEMENT_BY_FAMILY: Record<string, Movement> = {
  squat: 'squat', leg_press: 'squat', hinge: 'hinge', deadlift: 'hinge', hip_thrust: 'hinge', back_extension: 'hinge',
  lunge: 'lunge', step_up: 'lunge', bench_press: 'push_h', db_press: 'push_h', push_up: 'push_h', dip: 'push_v',
  close_grip_press: 'push_h', overhead_press: 'push_v', vertical_pull: 'pull_v', row: 'pull_h', face_pull: 'pull_h',
  carry: 'carry', plank: 'core', crunch: 'core', leg_raise: 'core', rotation: 'core', core_stability: 'core', ab_wheel: 'core',
  plyo: 'plyo', conditioning: 'cardio', cardio_machine: 'cardio', stretch: 'mobility',
};

const MACHINES: Equipment[] = ['smith', 'lat_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press', 'pec_deck', 'shoulder_machine', 'machine_other', 'hack_squat', 'calf_machine', 'hip_thrust_machine'];
const CARDIO_EQ: Equipment[] = ['bike', 'treadmill', 'elliptical', 'rower', 'jump_rope'];
const FREE: Equipment[] = ['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'medicine_ball'];

const CAT_BY_MUSCLE: Partial<Record<MuscleGroup, ExCategory>> = {
  chest: 'chest', back: 'back', lats: 'back', traps: 'back', lower_back: 'back', shoulders: 'shoulders', front_delts: 'shoulders',
  side_delts: 'shoulders', rear_delts: 'shoulders', biceps: 'biceps', triceps: 'triceps', forearms: 'forearms', abs: 'core',
  obliques: 'core', quads: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', adductors: 'legs', abductors: 'glutes',
  calves: 'calves', hip_flexors: 'core', cardio: 'cardio', full_body: 'full_body', neck: 'shoulders',
};

type Opt = Partial<Pick<Exercise, 'unilateral' | 'functional' | 'cue' | 'desc' | 'tracking' | 'category' | 'mechanic' | 'movement'>> & { stress?: Injury[] };

function ex(id: string, name: string, nameEn: string, family: string, pattern: string, primary: MuscleGroup[], secondary: MuscleGroup[], equipment: Equipment[], difficulty: 1 | 2 | 3, o: Opt = {}): Exercise {
  let kind: ExKind = 'bodyweight';
  if (family === 'stretch') kind = 'mobility';
  else if (equipment.some((e) => CARDIO_EQ.includes(e)) || family === 'cardio_machine') kind = 'cardio';
  else if (equipment.includes('cable')) kind = 'cable';
  else if (equipment.some((e) => MACHINES.includes(e))) kind = 'machine';
  else if (equipment.some((e) => FREE.includes(e))) kind = 'free';
  const isolationFam = ['knee_extension', 'knee_flexion', 'calf', 'hip_abduction', 'hip_adduction', 'fly', 'raise', 'rear_delt', 'triceps_ext', 'curl', 'wrist', 'shrug', 'pullover', 'crunch'];
  const cat: ExCategory = o.category ?? (family === 'stretch' ? 'mobility' : family === 'cardio_machine' ? 'cardio' : CAT_BY_MUSCLE[primary[0]] ?? 'full_body');
  const tracking: Tracking = o.tracking ?? (kind === 'cardio' ? 'cardio' : family === 'stretch' || family === 'plank' ? 'time' : kind === 'bodyweight' ? 'reps' : 'weight_reps');
  return {
    id, name, nameEn, family, pattern, primary, secondary, equipment, difficulty, kind,
    movement: o.movement ?? MOVEMENT_BY_FAMILY[family] ?? 'isolation',
    category: cat,
    mechanic: o.mechanic ?? (isolationFam.includes(family) ? 'isolation' : 'compound'),
    tracking,
    unilateral: o.unilateral, functional: o.functional,
    stress: o.stress ?? FAMILY_STRESS[family] ?? [],
    cue: o.cue, desc: o.desc,
  };
}

const BB: Equipment[] = ['barbell'];
const DB: Equipment[] = ['dumbbell'];
const KB: Equipment[] = ['kettlebell'];

export const EXERCISES: Exercise[] = [
  // ======== PETTO ========
  ex('bench_press_bb', 'Panca piana con bilanciere', 'Barbell Bench Press', 'bench_press', 'bench_press', ['chest'], ['front_delts', 'triceps'], ['barbell', 'flat_bench'], 2),
  ex('bench_press_db', 'Panca piana con manubri', 'Dumbbell Bench Press', 'db_press', 'db_bench', ['chest'], ['front_delts', 'triceps'], ['dumbbell', 'flat_bench'], 1),
  ex('incline_press_bb', 'Panca inclinata con bilanciere', 'Incline Barbell Bench Press', 'bench_press', 'incline_press', ['chest'], ['front_delts', 'triceps'], ['barbell', 'incline_bench'], 2, { cue: 'Inclinazione di 30-45°: più inclini, più lavorano i deltoidi.' }),
  ex('incline_press_db', 'Panca inclinata con manubri', 'Incline Dumbbell Press', 'db_press', 'incline_press', ['chest'], ['front_delts', 'triceps'], ['dumbbell', 'incline_bench'], 1),
  ex('decline_press_bb', 'Panca declinata con bilanciere', 'Decline Bench Press', 'bench_press', 'bench_press', ['chest'], ['triceps', 'front_delts'], ['barbell', 'incline_bench'], 2),
  ex('smith_bench', 'Panca piana alla Smith machine', 'Smith Machine Bench Press', 'bench_press', 'bench_press', ['chest'], ['front_delts', 'triceps'], ['smith', 'flat_bench'], 1),
  ex('smith_incline', 'Panca inclinata alla Smith machine', 'Smith Machine Incline Press', 'bench_press', 'incline_press', ['chest'], ['front_delts', 'triceps'], ['smith', 'incline_bench'], 1),
  ex('floor_press_db', 'Floor press con manubri', 'Dumbbell Floor Press', 'db_press', 'db_bench', ['chest'], ['triceps'], ['dumbbell'], 1, { cue: 'Il pavimento limita la discesa: ottimo se hai fastidi alle spalle.' }),
  ex('chest_press_machine', 'Chest press', 'Machine Chest Press', 'bench_press', 'chest_press', ['chest'], ['front_delts', 'triceps'], ['chest_press'], 1),
  ex('incline_chest_press_machine', 'Chest press inclinata', 'Incline Machine Press', 'bench_press', 'chest_press', ['chest'], ['front_delts', 'triceps'], ['machine_other'], 1),
  ex('pec_deck', 'Pec deck', 'Pec Deck Fly', 'fly', 'pec_deck', ['chest'], ['front_delts'], ['pec_deck'], 1),
  ex('db_fly', 'Croci con manubri su panca piana', 'Dumbbell Fly', 'fly', 'db_fly', ['chest'], ['front_delts'], ['dumbbell', 'flat_bench'], 2),
  ex('incline_db_fly', 'Croci su panca inclinata', 'Incline Dumbbell Fly', 'fly', 'db_fly', ['chest'], ['front_delts'], ['dumbbell', 'incline_bench'], 2),
  ex('cable_fly', 'Croci ai cavi', 'Cable Crossover', 'fly', 'cable_fly', ['chest'], ['front_delts'], ['cable'], 1),
  ex('low_cable_fly', 'Croci ai cavi dal basso', 'Low-to-High Cable Fly', 'fly', 'cable_fly', ['chest'], ['front_delts'], ['cable'], 1, { cue: 'Dal basso verso l’alto enfatizza la parte alta del petto.' }),
  ex('high_cable_fly', 'Croci ai cavi dall’alto', 'High-to-Low Cable Fly', 'fly', 'cable_fly', ['chest'], ['front_delts'], ['cable'], 1),
  ex('cable_press', 'Distensioni ai cavi', 'Standing Cable Press', 'db_press', 'chest_press', ['chest'], ['triceps', 'front_delts'], ['cable'], 1),
  ex('push_up', 'Piegamenti sulle braccia', 'Push-up', 'push_up', 'push_up', ['chest'], ['triceps', 'front_delts', 'abs'], [], 1, { functional: true }),
  ex('incline_push_up', 'Piegamenti con mani rialzate', 'Incline Push-up', 'push_up', 'push_up', ['chest'], ['triceps', 'front_delts'], ['box'], 1, { cue: 'Versione più facile: più alto il rialzo, più semplice.' }),
  ex('knee_push_up', 'Piegamenti sulle ginocchia', 'Knee Push-up', 'push_up', 'push_up', ['chest'], ['triceps', 'front_delts'], [], 1),
  ex('decline_push_up', 'Piegamenti con piedi rialzati', 'Decline Push-up', 'push_up', 'push_up', ['chest'], ['front_delts', 'triceps'], ['box'], 2),
  ex('diamond_push_up', 'Piegamenti a mani strette (diamond)', 'Diamond Push-up', 'push_up', 'push_up', ['triceps'], ['chest', 'front_delts'], [], 2),
  ex('wide_push_up', 'Piegamenti a presa larga', 'Wide Push-up', 'push_up', 'push_up', ['chest'], ['front_delts'], [], 1),
  ex('archer_push_up', 'Archer push-up', 'Archer Push-up', 'push_up', 'push_up', ['chest'], ['triceps', 'front_delts'], [], 3, { unilateral: true }),
  ex('band_push_up', 'Piegamenti con elastico', 'Banded Push-up', 'push_up', 'push_up', ['chest'], ['triceps'], ['band'], 2),
  ex('trx_chest_press', 'Chest press al TRX', 'TRX Chest Press', 'push_up', 'push_up', ['chest'], ['triceps', 'abs'], ['trx'], 2, { functional: true }),
  ex('chest_dip', 'Dip per il petto', 'Chest Dip', 'dip', 'dip', ['chest'], ['triceps', 'front_delts'], ['parallel_bars'], 2, { cue: 'Busto inclinato in avanti e gomiti leggermente aperti.' }),
  ex('db_pullover', 'Pullover con manubrio', 'Dumbbell Pullover', 'pullover', 'pullover', ['chest', 'lats'], ['triceps'], ['dumbbell', 'flat_bench'], 2),
  ex('svend_press', 'Svend press', 'Svend Press', 'fly', 'chest_press', ['chest'], ['front_delts'], ['dumbbell'], 1),
  ex('landmine_press', 'Landmine press', 'Landmine Press', 'overhead_press', 'chest_press', ['chest', 'front_delts'], ['triceps', 'abs'], ['barbell'], 2, { unilateral: true, functional: true }),

  // ======== SCHIENA ========
  ex('pull_up', 'Trazioni alla sbarra (prona)', 'Pull-up', 'vertical_pull', 'pullup', ['lats'], ['biceps', 'rear_delts', 'forearms'], ['pullup_bar'], 3, { functional: true }),
  ex('chin_up', 'Trazioni a presa supina (chin-up)', 'Chin-up', 'vertical_pull', 'pullup', ['lats', 'biceps'], ['rear_delts', 'forearms'], ['pullup_bar'], 2),
  ex('neutral_pull_up', 'Trazioni a presa neutra', 'Neutral-grip Pull-up', 'vertical_pull', 'pullup', ['lats'], ['biceps', 'forearms'], ['pullup_bar'], 2),
  ex('band_pull_up', 'Trazioni assistite con elastico', 'Band-assisted Pull-up', 'vertical_pull', 'pullup', ['lats'], ['biceps'], ['pullup_bar', 'band'], 1),
  ex('assisted_pull_up', 'Trazioni alla macchina assistita', 'Assisted Pull-up Machine', 'vertical_pull', 'pullup', ['lats'], ['biceps'], ['machine_other'], 1),
  ex('negative_pull_up', 'Trazioni negative', 'Negative Pull-up', 'vertical_pull', 'pullup', ['lats'], ['biceps', 'forearms'], ['pullup_bar'], 2, { cue: 'Sali con un salto o un rialzo e scendi lentamente in 3-5 secondi.' }),
  ex('weighted_pull_up', 'Trazioni zavorrate', 'Weighted Pull-up', 'vertical_pull', 'pullup', ['lats'], ['biceps', 'forearms'], ['pullup_bar', 'other'], 3),
  ex('lat_pulldown', 'Lat machine avanti', 'Lat Pulldown', 'vertical_pull', 'lat_pulldown', ['lats'], ['biceps', 'rear_delts'], ['lat_machine'], 1),
  ex('lat_pulldown_close', 'Lat machine presa stretta', 'Close-grip Lat Pulldown', 'vertical_pull', 'lat_pulldown', ['lats'], ['biceps'], ['lat_machine'], 1),
  ex('lat_pulldown_supine', 'Lat machine presa inversa', 'Reverse-grip Lat Pulldown', 'vertical_pull', 'lat_pulldown', ['lats', 'biceps'], ['rear_delts'], ['lat_machine'], 1),
  ex('single_arm_pulldown', 'Lat machine a un braccio', 'Single-arm Cable Pulldown', 'vertical_pull', 'lat_pulldown', ['lats'], ['biceps'], ['cable'], 2, { unilateral: true }),
  ex('band_pulldown', 'Lat pulldown con elastico', 'Band Lat Pulldown', 'vertical_pull', 'lat_pulldown', ['lats'], ['biceps'], ['band'], 1),
  ex('straight_arm_pulldown', 'Pulldown a braccia tese', 'Straight-arm Pulldown', 'pullover', 'straight_arm_pd', ['lats'], ['triceps', 'abs'], ['cable'], 1),
  ex('bb_row', 'Rematore con bilanciere', 'Barbell Bent-over Row', 'row', 'bent_row', ['back', 'lats'], ['rear_delts', 'biceps', 'lower_back'], BB, 2),
  ex('pendlay_row', 'Pendlay row', 'Pendlay Row', 'row', 'bent_row', ['back', 'lats'], ['rear_delts', 'biceps', 'lower_back'], BB, 3, { cue: 'Ogni ripetizione riparte da terra, busto parallelo al pavimento.' }),
  ex('yates_row', 'Rematore Yates (presa supina)', 'Yates Row', 'row', 'bent_row', ['lats', 'back'], ['biceps'], BB, 2),
  ex('db_row', 'Rematore con manubrio', 'One-arm Dumbbell Row', 'row', 'one_arm_row', ['lats', 'back'], ['rear_delts', 'biceps'], ['dumbbell', 'flat_bench'], 1, { unilateral: true }),
  ex('db_row_both', 'Rematore con due manubri', 'Bent-over Dumbbell Row', 'row', 'bent_row', ['back', 'lats'], ['rear_delts', 'biceps'], DB, 2),
  ex('chest_supported_row', 'Rematore con petto appoggiato', 'Chest-supported Row', 'row', 'bent_row', ['back'], ['rear_delts', 'biceps'], ['dumbbell', 'incline_bench'], 1, { stress: [] }),
  ex('seal_row', 'Seal row', 'Seal Row', 'row', 'bent_row', ['back', 'lats'], ['biceps'], ['barbell', 'flat_bench'], 2, { stress: [] }),
  ex('t_bar_row', 'T-bar row', 'T-Bar Row', 'row', 'bent_row', ['back', 'lats'], ['biceps', 'rear_delts'], ['barbell'], 2),
  ex('seated_cable_row', 'Pulley basso', 'Seated Cable Row', 'row', 'seated_row', ['back', 'lats'], ['biceps', 'rear_delts'], ['cable'], 1, { stress: [] }),
  ex('wide_cable_row', 'Pulley a presa larga', 'Wide-grip Cable Row', 'row', 'seated_row', ['back', 'rear_delts'], ['biceps'], ['cable'], 1, { stress: [] }),
  ex('machine_row', 'Rematore alla macchina', 'Machine Row', 'row', 'seated_row', ['back'], ['biceps', 'rear_delts'], ['machine_other'], 1, { stress: [] }),
  ex('single_arm_cable_row', 'Rematore al cavo a un braccio', 'Single-arm Cable Row', 'row', 'seated_row', ['lats'], ['biceps'], ['cable'], 1, { unilateral: true, stress: [] }),
  ex('inverted_row', 'Rematore inverso', 'Inverted Row', 'row', 'inverted_row', ['back'], ['biceps', 'rear_delts', 'abs'], ['smith'], 1, { functional: true, stress: [] }),
  ex('trx_row', 'Rematore al TRX', 'TRX Row', 'row', 'inverted_row', ['back'], ['biceps', 'rear_delts'], ['trx'], 1, { functional: true, stress: [] }),
  ex('band_row', 'Rematore con elastico', 'Band Row', 'row', 'seated_row', ['back'], ['biceps'], ['band'], 1, { stress: [] }),
  ex('kb_row', 'Rematore con kettlebell', 'Kettlebell Row', 'row', 'one_arm_row', ['lats', 'back'], ['biceps'], KB, 1, { unilateral: true }),
  ex('renegade_row', 'Renegade row', 'Renegade Row', 'row', 'push_up', ['back', 'abs'], ['biceps', 'chest'], DB, 3, { functional: true, stress: ['wrist', 'lower_back'] }),
  ex('face_pull', 'Face pull', 'Face Pull', 'face_pull', 'face_pull', ['rear_delts'], ['traps', 'back'], ['cable'], 1),
  ex('band_face_pull', 'Face pull con elastico', 'Band Face Pull', 'face_pull', 'face_pull', ['rear_delts'], ['traps'], ['band'], 1),
  ex('bb_shrug', 'Scrollate con bilanciere', 'Barbell Shrug', 'shrug', 'shrug', ['traps'], ['forearms'], BB, 1),
  ex('db_shrug', 'Scrollate con manubri', 'Dumbbell Shrug', 'shrug', 'shrug', ['traps'], ['forearms'], DB, 1),
  ex('cable_shrug', 'Scrollate ai cavi', 'Cable Shrug', 'shrug', 'shrug', ['traps'], [], ['cable'], 1),
  ex('back_extension', 'Hyperextension', 'Back Extension', 'back_extension', 'back_extension', ['lower_back'], ['glutes', 'hamstrings'], ['machine_other'], 1),
  ex('superman', 'Superman', 'Superman', 'back_extension', 'cobra', ['lower_back'], ['glutes'], ['mat'], 1),
  ex('rack_pull', 'Rack pull', 'Rack Pull', 'deadlift', 'rdl', ['back', 'traps'], ['glutes', 'hamstrings', 'forearms'], ['barbell', 'squat_rack'], 2),
  ex('cable_pullover', 'Pullover ai cavi', 'Cable Pullover', 'pullover', 'straight_arm_pd', ['lats'], ['triceps'], ['cable'], 1),

  // ======== SPALLE ========
  ex('ohp_bb', 'Military press', 'Overhead Press', 'overhead_press', 'ohp', ['front_delts', 'shoulders'], ['triceps', 'traps', 'abs'], BB, 2),
  ex('seated_db_press', 'Shoulder press con manubri', 'Seated Dumbbell Shoulder Press', 'overhead_press', 'seated_press', ['front_delts', 'shoulders'], ['triceps'], ['dumbbell', 'incline_bench'], 1),
  ex('standing_db_press', 'Lento avanti in piedi con manubri', 'Standing Dumbbell Press', 'overhead_press', 'ohp', ['front_delts', 'shoulders'], ['triceps', 'abs'], DB, 2),
  ex('arnold_press', 'Arnold press', 'Arnold Press', 'overhead_press', 'seated_press', ['front_delts', 'side_delts'], ['triceps'], DB, 2),
  ex('shoulder_press_machine', 'Shoulder press alla macchina', 'Machine Shoulder Press', 'overhead_press', 'seated_press', ['front_delts', 'shoulders'], ['triceps'], ['shoulder_machine'], 1),
  ex('smith_ohp', 'Lento alla Smith machine', 'Smith Machine Overhead Press', 'overhead_press', 'seated_press', ['front_delts'], ['triceps'], ['smith'], 1),
  ex('kb_press', 'Press con kettlebell', 'Kettlebell Press', 'overhead_press', 'ohp', ['front_delts', 'shoulders'], ['triceps', 'abs'], KB, 2, { unilateral: true, functional: true }),
  ex('pike_push_up', 'Pike push-up', 'Pike Push-up', 'overhead_press', 'push_up', ['front_delts', 'shoulders'], ['triceps'], [], 2),
  ex('handstand_push_up', 'Piegamenti in verticale', 'Handstand Push-up', 'overhead_press', 'ohp', ['front_delts', 'shoulders'], ['triceps', 'traps'], [], 3),
  ex('band_ohp', 'Lento avanti con elastico', 'Band Overhead Press', 'overhead_press', 'ohp', ['front_delts'], ['triceps'], ['band'], 1),
  ex('lateral_raise_db', 'Alzate laterali con manubri', 'Dumbbell Lateral Raise', 'raise', 'lateral_raise', ['side_delts'], ['traps'], DB, 1),
  ex('lateral_raise_cable', 'Alzate laterali ai cavi', 'Cable Lateral Raise', 'raise', 'lateral_raise', ['side_delts'], [], ['cable'], 1, { unilateral: true }),
  ex('lateral_raise_machine', 'Alzate laterali alla macchina', 'Machine Lateral Raise', 'raise', 'lateral_raise', ['side_delts'], [], ['shoulder_machine'], 1),
  ex('lateral_raise_band', 'Alzate laterali con elastico', 'Band Lateral Raise', 'raise', 'lateral_raise', ['side_delts'], [], ['band'], 1),
  ex('seated_lateral_raise', 'Alzate laterali da seduto', 'Seated Lateral Raise', 'raise', 'lateral_raise', ['side_delts'], [], ['dumbbell', 'flat_bench'], 1),
  ex('front_raise_db', 'Alzate frontali con manubri', 'Dumbbell Front Raise', 'raise', 'front_raise', ['front_delts'], ['chest'], DB, 1),
  ex('front_raise_plate', 'Alzate frontali con disco', 'Plate Front Raise', 'raise', 'front_raise', ['front_delts'], [], ['other'], 1),
  ex('front_raise_cable', 'Alzate frontali ai cavi', 'Cable Front Raise', 'raise', 'front_raise', ['front_delts'], [], ['cable'], 1),
  ex('rear_delt_fly_db', 'Alzate posteriori con manubri', 'Bent-over Reverse Fly', 'rear_delt', 'reverse_fly', ['rear_delts'], ['traps', 'back'], DB, 1),
  ex('reverse_pec_deck', 'Reverse pec deck', 'Reverse Pec Deck', 'rear_delt', 'pec_deck', ['rear_delts'], ['traps'], ['pec_deck'], 1),
  ex('rear_delt_cable', 'Alzate posteriori ai cavi', 'Cable Rear Delt Fly', 'rear_delt', 'reverse_fly', ['rear_delts'], ['traps'], ['cable'], 1),
  ex('band_pull_apart', 'Band pull-apart', 'Band Pull-apart', 'rear_delt', 'reverse_fly', ['rear_delts'], ['traps', 'back'], ['band'], 1),
  ex('upright_row_bb', 'Tirate al mento con bilanciere', 'Barbell Upright Row', 'raise', 'upright_row', ['side_delts', 'traps'], ['biceps'], BB, 2, { stress: ['shoulder'] }),
  ex('upright_row_cable', 'Tirate al mento ai cavi', 'Cable Upright Row', 'raise', 'upright_row', ['side_delts', 'traps'], ['biceps'], ['cable'], 1, { stress: ['shoulder'] }),
  ex('y_raise', 'Y-raise su panca inclinata', 'Incline Y-Raise', 'raise', 'front_raise', ['side_delts', 'traps'], ['rear_delts'], ['dumbbell', 'incline_bench'], 1),
  ex('cuban_rotation', 'Extrarotazioni con manubrio', 'Dumbbell External Rotation', 'rear_delt', 'curl', ['rear_delts'], [], DB, 1, { cue: 'Gomito a 90° vicino al fianco, ruota l’avambraccio verso l’esterno lentamente.', stress: [] }),

  // ======== BICIPITI ========
  ex('db_curl', 'Curl con manubri', 'Dumbbell Curl', 'curl', 'curl', ['biceps'], ['forearms'], DB, 1),
  ex('bb_curl', 'Curl con bilanciere', 'Barbell Curl', 'curl', 'curl_bb', ['biceps'], ['forearms'], BB, 1),
  ex('ez_curl', 'Curl con bilanciere EZ', 'EZ-bar Curl', 'curl', 'curl_bb', ['biceps'], ['forearms'], ['ez_bar'], 1),
  ex('hammer_curl', 'Curl a martello', 'Hammer Curl', 'curl', 'curl', ['biceps', 'forearms'], [], DB, 1),
  ex('incline_db_curl', 'Curl su panca inclinata', 'Incline Dumbbell Curl', 'curl', 'curl', ['biceps'], [], ['dumbbell', 'incline_bench'], 2),
  ex('preacher_curl', 'Curl alla panca Scott', 'Preacher Curl', 'curl', 'preacher', ['biceps'], ['forearms'], ['ez_bar', 'machine_other'], 1),
  ex('machine_curl', 'Curl alla macchina', 'Machine Biceps Curl', 'curl', 'preacher', ['biceps'], [], ['machine_other'], 1),
  ex('concentration_curl', 'Curl di concentrazione', 'Concentration Curl', 'curl', 'preacher', ['biceps'], [], ['dumbbell', 'flat_bench'], 1, { unilateral: true }),
  ex('cable_curl', 'Curl ai cavi', 'Cable Curl', 'curl', 'curl', ['biceps'], ['forearms'], ['cable'], 1),
  ex('bayesian_curl', 'Curl al cavo dietro il corpo (bayesian)', 'Bayesian Cable Curl', 'curl', 'curl', ['biceps'], [], ['cable'], 2, { unilateral: true }),
  ex('spider_curl', 'Spider curl', 'Spider Curl', 'curl', 'preacher', ['biceps'], [], ['dumbbell', 'incline_bench'], 2),
  ex('rope_hammer_curl', 'Curl a martello con corda', 'Rope Hammer Curl', 'curl', 'curl', ['forearms', 'biceps'], [], ['cable'], 1),
  ex('band_curl', 'Curl con elastico', 'Band Curl', 'curl', 'curl', ['biceps'], [], ['band'], 1),
  ex('kb_curl', 'Curl con kettlebell', 'Kettlebell Curl', 'curl', 'curl', ['biceps'], ['forearms'], KB, 1),
  ex('zottman_curl', 'Zottman curl', 'Zottman Curl', 'curl', 'curl', ['biceps', 'forearms'], [], DB, 2),

  // ======== TRICIPITI ========
  ex('rope_pushdown', 'Push-down con corda', 'Rope Triceps Pushdown', 'triceps_ext', 'pushdown', ['triceps'], [], ['cable'], 1),
  ex('bar_pushdown', 'Push-down con barra', 'Straight-bar Pushdown', 'triceps_ext', 'pushdown', ['triceps'], [], ['cable'], 1),
  ex('reverse_pushdown', 'Push-down presa inversa', 'Reverse-grip Pushdown', 'triceps_ext', 'pushdown', ['triceps'], ['forearms'], ['cable'], 1),
  ex('oh_cable_ext', 'Estensioni sopra la testa ai cavi', 'Overhead Cable Extension', 'triceps_ext', 'oh_triceps', ['triceps'], [], ['cable'], 1),
  ex('oh_db_ext', 'Estensioni sopra la testa con manubrio', 'Overhead Dumbbell Extension', 'triceps_ext', 'oh_triceps', ['triceps'], [], DB, 1),
  ex('skull_crusher', 'French press con bilanciere EZ', 'EZ-bar Skull Crusher', 'triceps_ext', 'skull_crusher', ['triceps'], [], ['ez_bar', 'flat_bench'], 2),
  ex('db_skull_crusher', 'French press con manubri', 'Dumbbell Skull Crusher', 'triceps_ext', 'skull_crusher', ['triceps'], [], ['dumbbell', 'flat_bench'], 2),
  ex('close_grip_bench', 'Panca piana presa stretta', 'Close-grip Bench Press', 'close_grip_press', 'bench_press', ['triceps'], ['chest', 'front_delts'], ['barbell', 'flat_bench'], 2),
  ex('triceps_dip', 'Dip per tricipiti', 'Triceps Dip', 'dip', 'dip', ['triceps'], ['chest', 'front_delts'], ['dip_bar'], 2, { cue: 'Busto verticale e gomiti vicini al corpo.' }),
  ex('bench_dip', 'Dip su panca', 'Bench Dip', 'dip', 'bench_dip', ['triceps'], ['front_delts'], ['flat_bench'], 1),
  ex('db_kickback', 'Kickback con manubrio', 'Dumbbell Kickback', 'triceps_ext', 'kickback', ['triceps'], [], DB, 1),
  ex('cable_kickback', 'Kickback ai cavi', 'Cable Kickback', 'triceps_ext', 'kickback', ['triceps'], [], ['cable'], 1, { unilateral: true }),
  ex('triceps_machine', 'Estensioni tricipiti alla macchina', 'Triceps Extension Machine', 'triceps_ext', 'pushdown', ['triceps'], [], ['machine_other'], 1),
  ex('band_pushdown', 'Push-down con elastico', 'Band Pushdown', 'triceps_ext', 'pushdown', ['triceps'], [], ['band'], 1),
  ex('jm_press', 'JM press', 'JM Press', 'close_grip_press', 'skull_crusher', ['triceps'], ['chest'], ['barbell', 'flat_bench'], 3),

  // ======== AVAMBRACCI ========
  ex('wrist_curl', 'Curl per i polsi', 'Wrist Curl', 'wrist', 'wrist_curl', ['forearms'], [], DB, 1),
  ex('reverse_wrist_curl', 'Curl inverso per i polsi', 'Reverse Wrist Curl', 'wrist', 'wrist_curl', ['forearms'], [], DB, 1),
  ex('reverse_curl', 'Curl a presa prona', 'Reverse Curl', 'curl', 'curl_bb', ['forearms', 'biceps'], [], ['ez_bar'], 1),
  ex('farmer_walk', 'Farmer walk', 'Farmer’s Walk', 'carry', 'farmer_walk', ['forearms', 'traps'], ['abs', 'glutes'], DB, 1, { functional: true, tracking: 'time' }),
  ex('dead_hang', 'Sospensione alla sbarra', 'Dead Hang', 'carry', 'pullup', ['forearms'], ['lats'], ['pullup_bar'], 1, { tracking: 'time', stress: ['shoulder'] }),
  ex('plate_pinch', 'Presa dei dischi (plate pinch)', 'Plate Pinch', 'carry', 'farmer_walk', ['forearms'], [], ['other'], 1, { tracking: 'time' }),

  // ======== ADDOME E CORE ========
  ex('plank', 'Plank', 'Plank', 'plank', 'plank', ['abs'], ['obliques', 'glutes'], [], 1, { functional: true }),
  ex('side_plank', 'Plank laterale', 'Side Plank', 'plank', 'side_plank', ['obliques'], ['abs', 'glutes'], [], 1, { unilateral: true }),
  ex('crunch', 'Crunch', 'Crunch', 'crunch', 'crunch', ['abs'], [], ['mat'], 1),
  ex('bicycle_crunch', 'Bicycle crunch', 'Bicycle Crunch', 'crunch', 'crunch', ['abs', 'obliques'], [], ['mat'], 1),
  ex('reverse_crunch', 'Crunch inverso', 'Reverse Crunch', 'leg_raise', 'lying_leg_raise', ['abs'], ['hip_flexors'], ['mat'], 1),
  ex('situp', 'Sit-up', 'Sit-up', 'crunch', 'situp', ['abs'], ['hip_flexors'], ['mat'], 1),
  ex('cable_crunch', 'Crunch ai cavi', 'Cable Crunch', 'crunch', 'cable_crunch', ['abs'], ['obliques'], ['cable'], 1),
  ex('machine_crunch', 'Crunch alla macchina', 'Machine Crunch', 'crunch', 'crunch', ['abs'], [], ['machine_other'], 1),
  ex('hanging_leg_raise', 'Sollevamento gambe alla sbarra', 'Hanging Leg Raise', 'leg_raise', 'hanging_leg_raise', ['abs'], ['hip_flexors', 'forearms'], ['pullup_bar'], 3),
  ex('hanging_knee_raise', 'Sollevamento ginocchia alla sbarra', 'Hanging Knee Raise', 'leg_raise', 'hanging_leg_raise', ['abs'], ['hip_flexors'], ['pullup_bar'], 2),
  ex('captain_chair', 'Leg raise alla sedia romana', 'Captain’s Chair Leg Raise', 'leg_raise', 'hanging_leg_raise', ['abs'], ['hip_flexors'], ['parallel_bars'], 2),
  ex('lying_leg_raise', 'Leg raise a terra', 'Lying Leg Raise', 'leg_raise', 'lying_leg_raise', ['abs'], ['hip_flexors'], ['mat'], 1),
  ex('flutter_kicks', 'Flutter kicks', 'Flutter Kicks', 'leg_raise', 'lying_leg_raise', ['abs'], ['hip_flexors'], ['mat'], 1, { tracking: 'time' }),
  ex('russian_twist', 'Russian twist', 'Russian Twist', 'rotation', 'russian_twist', ['obliques'], ['abs'], ['mat'], 1),
  ex('pallof_press', 'Pallof press', 'Pallof Press', 'rotation', 'chest_press', ['obliques', 'abs'], [], ['cable'], 1, { functional: true }),
  ex('band_pallof', 'Pallof press con elastico', 'Band Pallof Press', 'rotation', 'chest_press', ['obliques', 'abs'], [], ['band'], 1, { functional: true }),
  ex('woodchopper', 'Woodchopper ai cavi', 'Cable Woodchopper', 'rotation', 'straight_arm_pd', ['obliques'], ['abs', 'shoulders'], ['cable'], 1, { functional: true }),
  ex('mountain_climber', 'Mountain climber', 'Mountain Climber', 'conditioning', 'mountain_climber', ['abs'], ['hip_flexors', 'shoulders', 'cardio'], [], 1, { tracking: 'time', functional: true }),
  ex('dead_bug', 'Dead bug', 'Dead Bug', 'core_stability', 'dead_bug', ['abs'], ['hip_flexors'], ['mat'], 1),
  ex('bird_dog', 'Bird dog', 'Bird Dog', 'core_stability', 'bird_dog', ['abs', 'lower_back'], ['glutes'], ['mat'], 1),
  ex('hollow_hold', 'Hollow body hold', 'Hollow Body Hold', 'plank', 'lying_leg_raise', ['abs'], ['hip_flexors'], ['mat'], 2, { tracking: 'time' }),
  ex('ab_wheel', 'Ab wheel rollout', 'Ab Wheel Rollout', 'ab_wheel', 'ab_wheel', ['abs'], ['lats', 'shoulders'], ['ab_wheel'], 3),
  ex('v_up', 'V-up', 'V-up', 'crunch', 'situp', ['abs'], ['hip_flexors'], ['mat'], 2),
  ex('toe_touch', 'Toe touch', 'Toe Touch Crunch', 'crunch', 'crunch', ['abs'], [], ['mat'], 1),
  ex('heel_touch', 'Heel touch', 'Heel Touches', 'crunch', 'crunch', ['obliques'], ['abs'], ['mat'], 1),
  ex('plank_shoulder_tap', 'Plank con tocco spalla', 'Plank Shoulder Tap', 'plank', 'push_up', ['abs', 'obliques'], ['shoulders'], [], 2),
  ex('suitcase_carry', 'Suitcase carry', 'Suitcase Carry', 'carry', 'farmer_walk', ['obliques'], ['forearms', 'traps'], ['dumbbell'], 1, { unilateral: true, functional: true, tracking: 'time' }),
  ex('trx_pike', 'Pike al TRX', 'TRX Pike', 'ab_wheel', 'mountain_climber', ['abs'], ['shoulders', 'hip_flexors'], ['trx'], 3),
  ex('med_ball_slam', 'Med ball slam', 'Medicine Ball Slam', 'conditioning', 'burpee', ['abs', 'full_body'], ['lats', 'shoulders'], ['medicine_ball'], 1, { functional: true }),

  // ======== QUADRICIPITI / GAMBE ========
  ex('back_squat', 'Squat con bilanciere', 'Barbell Back Squat', 'squat', 'squat_bb', ['quads', 'glutes'], ['adductors', 'lower_back', 'abs'], ['barbell', 'squat_rack'], 2),
  ex('front_squat', 'Front squat', 'Barbell Front Squat', 'squat', 'squat_front', ['quads'], ['glutes', 'abs'], ['barbell', 'squat_rack'], 3),
  ex('goblet_squat', 'Goblet squat', 'Goblet Squat', 'squat', 'squat_goblet', ['quads', 'glutes'], ['abs'], DB, 1, { functional: true }),
  ex('kb_goblet_squat', 'Goblet squat con kettlebell', 'Kettlebell Goblet Squat', 'squat', 'squat_goblet', ['quads', 'glutes'], ['abs'], KB, 1),
  ex('bw_squat', 'Squat a corpo libero', 'Bodyweight Squat', 'squat', 'squat_bw', ['quads', 'glutes'], ['adductors'], [], 1, { functional: true }),
  ex('box_squat', 'Box squat', 'Box Squat', 'squat', 'squat_bb', ['quads', 'glutes'], ['hamstrings'], ['barbell', 'squat_rack', 'box'], 2),
  ex('smith_squat', 'Squat alla Smith machine', 'Smith Machine Squat', 'squat', 'squat_bb', ['quads', 'glutes'], [], ['smith'], 1),
  ex('hack_squat', 'Hack squat', 'Hack Squat', 'squat', 'leg_press', ['quads'], ['glutes'], ['hack_squat'], 1),
  ex('pendulum_squat', 'Pendulum squat', 'Pendulum Squat', 'squat', 'leg_press', ['quads'], ['glutes'], ['machine_other'], 1),
  ex('belt_squat', 'Belt squat', 'Belt Squat', 'squat', 'squat_bw', ['quads', 'glutes'], [], ['machine_other'], 1, { stress: ['knee'] }),
  ex('sumo_squat', 'Squat sumo con manubrio', 'Dumbbell Sumo Squat', 'squat', 'squat_goblet', ['quads', 'adductors', 'glutes'], [], DB, 1),
  ex('pistol_squat', 'Pistol squat', 'Pistol Squat', 'squat', 'squat_bw', ['quads', 'glutes'], ['abs'], [], 3, { unilateral: true }),
  ex('sissy_squat', 'Sissy squat', 'Sissy Squat', 'squat', 'squat_bw', ['quads'], [], [], 3, { stress: ['knee'] }),
  ex('wall_sit', 'Wall sit', 'Wall Sit', 'squat', 'wall_sit', ['quads'], ['glutes'], [], 1, { tracking: 'time' }),
  ex('band_squat', 'Squat con elastico', 'Banded Squat', 'squat', 'squat_bw', ['quads', 'glutes'], [], ['band'], 1),
  ex('trx_squat', 'Squat al TRX', 'TRX Squat', 'squat', 'squat_bw', ['quads', 'glutes'], [], ['trx'], 1),
  ex('leg_press', 'Leg press 45°', 'Leg Press', 'leg_press', 'leg_press', ['quads', 'glutes'], ['hamstrings', 'adductors'], ['leg_press'], 1),
  ex('single_leg_press', 'Leg press a una gamba', 'Single-leg Press', 'leg_press', 'leg_press', ['quads', 'glutes'], [], ['leg_press'], 2, { unilateral: true }),
  ex('leg_extension', 'Leg extension', 'Leg Extension', 'knee_extension', 'leg_extension', ['quads'], [], ['leg_extension'], 1),
  ex('lunge_db', 'Affondi con manubri', 'Dumbbell Lunge', 'lunge', 'lunge', ['quads', 'glutes'], ['hamstrings', 'adductors'], DB, 2, { unilateral: true, functional: true }),
  ex('walking_lunge', 'Affondi camminati', 'Walking Lunge', 'lunge', 'lunge', ['quads', 'glutes'], ['hamstrings'], DB, 2, { unilateral: true, functional: true }),
  ex('reverse_lunge', 'Affondi indietro', 'Reverse Lunge', 'lunge', 'lunge', ['glutes', 'quads'], ['hamstrings'], DB, 1, { unilateral: true, cue: 'L’affondo indietro è più gentile per le ginocchia.' }),
  ex('bw_lunge', 'Affondi a corpo libero', 'Bodyweight Lunge', 'lunge', 'lunge', ['quads', 'glutes'], [], [], 1, { unilateral: true }),
  ex('bb_lunge', 'Affondi con bilanciere', 'Barbell Lunge', 'lunge', 'lunge', ['quads', 'glutes'], ['hamstrings', 'abs'], ['barbell', 'squat_rack'], 3, { unilateral: true }),
  ex('split_squat', 'Split squat', 'Split Squat', 'lunge', 'lunge', ['quads', 'glutes'], [], DB, 1, { unilateral: true }),
  ex('bulgarian_split_squat', 'Bulgarian split squat', 'Bulgarian Split Squat', 'lunge', 'bulgarian', ['quads', 'glutes'], ['adductors'], ['dumbbell', 'flat_bench'], 2, { unilateral: true }),
  ex('smith_lunge', 'Affondi alla Smith machine', 'Smith Machine Lunge', 'lunge', 'lunge', ['quads', 'glutes'], [], ['smith'], 1, { unilateral: true }),
  ex('side_lunge', 'Affondi laterali', 'Lateral Lunge', 'lunge', 'side_lunge', ['adductors', 'glutes', 'quads'], [], [], 1, { unilateral: true, functional: true }),
  ex('step_up_db', 'Step-up con manubri', 'Dumbbell Step-up', 'step_up', 'step_up', ['glutes', 'quads'], ['hamstrings'], ['dumbbell', 'box'], 1, { unilateral: true, functional: true }),
  ex('kb_lunge', 'Affondi con kettlebell', 'Kettlebell Lunge', 'lunge', 'lunge', ['quads', 'glutes'], [], KB, 1, { unilateral: true }),
  ex('adductor_machine', 'Adductor machine', 'Hip Adduction Machine', 'hip_adduction', 'hip_abduction', ['adductors'], [], ['machine_other'], 1, { category: 'legs' }),
  ex('cable_adduction', 'Adduzione al cavo', 'Cable Hip Adduction', 'hip_adduction', 'hip_abduction', ['adductors'], [], ['cable'], 1, { unilateral: true, category: 'legs' }),
  ex('copenhagen_plank', 'Copenhagen plank', 'Copenhagen Plank', 'plank', 'side_plank', ['adductors'], ['obliques'], ['flat_bench'], 3, { tracking: 'time', category: 'legs' }),

  // ======== FEMORALI ========
  ex('rdl_bb', 'Stacco rumeno con bilanciere', 'Romanian Deadlift', 'hinge', 'rdl', ['hamstrings', 'glutes'], ['lower_back', 'forearms'], BB, 2),
  ex('rdl_db', 'Stacco rumeno con manubri', 'Dumbbell Romanian Deadlift', 'hinge', 'rdl', ['hamstrings', 'glutes'], ['lower_back'], DB, 1),
  ex('single_leg_rdl', 'Stacco rumeno a una gamba', 'Single-leg RDL', 'hinge', 'rdl', ['hamstrings', 'glutes'], ['abs'], DB, 2, { unilateral: true, functional: true }),
  ex('stiff_leg_deadlift', 'Stacco a gambe tese', 'Stiff-leg Deadlift', 'hinge', 'rdl', ['hamstrings'], ['glutes', 'lower_back'], BB, 2),
  ex('good_morning', 'Good morning', 'Good Morning', 'hinge', 'good_morning', ['hamstrings', 'lower_back'], ['glutes'], ['barbell', 'squat_rack'], 3),
  ex('lying_leg_curl', 'Leg curl sdraiato', 'Lying Leg Curl', 'knee_flexion', 'leg_curl', ['hamstrings'], ['calves'], ['leg_curl'], 1),
  ex('seated_leg_curl', 'Leg curl seduto', 'Seated Leg Curl', 'knee_flexion', 'leg_curl', ['hamstrings'], [], ['leg_curl'], 1),
  ex('standing_leg_curl', 'Leg curl in piedi', 'Standing Leg Curl', 'knee_flexion', 'leg_curl', ['hamstrings'], [], ['machine_other'], 1, { unilateral: true }),
  ex('nordic_curl', 'Nordic curl', 'Nordic Hamstring Curl', 'knee_flexion', 'leg_curl', ['hamstrings'], ['glutes'], ['mat'], 3, { cue: 'Scendi il più lentamente possibile; aiutati con le mani in risalita.' }),
  ex('swiss_ball_curl', 'Leg curl con fitball', 'Stability Ball Leg Curl', 'knee_flexion', 'glute_bridge', ['hamstrings'], ['glutes'], ['other'], 2),
  ex('band_leg_curl', 'Leg curl con elastico', 'Band Leg Curl', 'knee_flexion', 'leg_curl', ['hamstrings'], [], ['band'], 1),
  ex('cable_pull_through', 'Pull-through al cavo', 'Cable Pull-through', 'hinge', 'rdl', ['glutes', 'hamstrings'], [], ['cable'], 1),
  ex('kb_deadlift', 'Stacco con kettlebell', 'Kettlebell Deadlift', 'hinge', 'deadlift', ['hamstrings', 'glutes'], ['lower_back'], KB, 1),

  // ======== GLUTEI ========
  ex('hip_thrust_bb', 'Hip thrust con bilanciere', 'Barbell Hip Thrust', 'hip_thrust', 'hip_thrust', ['glutes'], ['hamstrings', 'quads'], ['barbell', 'flat_bench'], 2),
  ex('hip_thrust_db', 'Hip thrust con manubrio', 'Dumbbell Hip Thrust', 'hip_thrust', 'hip_thrust', ['glutes'], ['hamstrings'], ['dumbbell', 'flat_bench'], 1),
  ex('hip_thrust_machine', 'Hip thrust alla macchina', 'Hip Thrust Machine', 'hip_thrust', 'hip_thrust', ['glutes'], ['hamstrings'], ['hip_thrust_machine'], 1),
  ex('smith_hip_thrust', 'Hip thrust alla Smith machine', 'Smith Machine Hip Thrust', 'hip_thrust', 'hip_thrust', ['glutes'], ['hamstrings'], ['smith', 'flat_bench'], 1),
  ex('single_leg_hip_thrust', 'Hip thrust a una gamba', 'Single-leg Hip Thrust', 'hip_thrust', 'hip_thrust', ['glutes'], ['hamstrings'], ['flat_bench'], 2, { unilateral: true }),
  ex('glute_bridge', 'Ponte glutei', 'Glute Bridge', 'hip_thrust', 'glute_bridge', ['glutes'], ['hamstrings'], ['mat'], 1),
  ex('bb_glute_bridge', 'Ponte glutei con bilanciere', 'Barbell Glute Bridge', 'hip_thrust', 'glute_bridge', ['glutes'], ['hamstrings'], ['barbell', 'mat'], 1),
  ex('band_glute_bridge', 'Ponte glutei con elastico', 'Banded Glute Bridge', 'hip_thrust', 'glute_bridge', ['glutes', 'abductors'], [], ['band', 'mat'], 1),
  ex('cable_kickback_glute', 'Slanci posteriori ai cavi', 'Cable Glute Kickback', 'hip_thrust', 'glute_kickback', ['glutes'], ['hamstrings'], ['cable'], 1, { unilateral: true, stress: [] }),
  ex('donkey_kick', 'Donkey kick', 'Donkey Kick', 'hip_thrust', 'glute_kickback', ['glutes'], [], ['mat'], 1, { unilateral: true, stress: [] }),
  ex('abductor_machine', 'Abductor machine', 'Hip Abduction Machine', 'hip_abduction', 'hip_abduction', ['abductors', 'glutes'], [], ['machine_other'], 1),
  ex('cable_abduction', 'Abduzione al cavo', 'Cable Hip Abduction', 'hip_abduction', 'hip_abduction', ['abductors', 'glutes'], [], ['cable'], 1, { unilateral: true }),
  ex('band_lateral_walk', 'Camminata laterale con elastico', 'Band Lateral Walk', 'hip_abduction', 'side_lunge', ['abductors', 'glutes'], [], ['band'], 1, { functional: true }),
  ex('clamshell', 'Clamshell', 'Clamshell', 'hip_abduction', 'hip_abduction', ['abductors', 'glutes'], [], ['mat'], 1),
  ex('fire_hydrant', 'Fire hydrant', 'Fire Hydrant', 'hip_abduction', 'glute_kickback', ['glutes', 'abductors'], [], ['mat'], 1),
  ex('sumo_deadlift', 'Stacco sumo', 'Sumo Deadlift', 'deadlift', 'deadlift', ['glutes', 'quads', 'adductors'], ['hamstrings', 'lower_back', 'traps'], BB, 3),
  ex('kb_swing', 'Kettlebell swing', 'Kettlebell Swing', 'hinge', 'kb_swing', ['glutes', 'hamstrings'], ['lower_back', 'abs', 'shoulders'], KB, 2, { functional: true, cue: 'È un movimento di anca esplosivo, non un’alzata frontale con le braccia.' }),
  ex('reverse_hyper', 'Reverse hyperextension', 'Reverse Hyperextension', 'back_extension', 'glute_kickback', ['glutes'], ['hamstrings', 'lower_back'], ['machine_other'], 2),
  ex('frog_pump', 'Frog pump', 'Frog Pump', 'hip_thrust', 'glute_bridge', ['glutes'], [], ['mat'], 1),

  // ======== POLPACCI ========
  ex('standing_calf_raise', 'Calf raise in piedi', 'Standing Calf Raise', 'calf', 'calf_raise', ['calves'], [], ['calf_machine'], 1),
  ex('db_calf_raise', 'Calf raise con manubri', 'Dumbbell Calf Raise', 'calf', 'calf_raise', ['calves'], [], DB, 1),
  ex('single_leg_calf_raise', 'Calf raise a una gamba', 'Single-leg Calf Raise', 'calf', 'calf_raise', ['calves'], [], [], 1, { unilateral: true }),
  ex('seated_calf_raise', 'Calf raise da seduto', 'Seated Calf Raise', 'calf', 'seated_calf', ['calves'], [], ['calf_machine'], 1),
  ex('leg_press_calf', 'Calf alla leg press', 'Leg Press Calf Raise', 'calf', 'leg_press', ['calves'], [], ['leg_press'], 1),
  ex('smith_calf_raise', 'Calf raise alla Smith machine', 'Smith Machine Calf Raise', 'calf', 'calf_raise', ['calves'], [], ['smith'], 1),
  ex('bw_calf_raise', 'Calf raise a corpo libero', 'Bodyweight Calf Raise', 'calf', 'calf_raise', ['calves'], [], [], 1),

  // ======== FULL BODY / FUNZIONALI ========
  ex('deadlift', 'Stacco da terra', 'Conventional Deadlift', 'deadlift', 'deadlift', ['hamstrings', 'glutes', 'lower_back'], ['back', 'traps', 'quads', 'forearms'], BB, 3, { category: 'full_body', functional: true }),
  ex('trap_bar_deadlift', 'Stacco con trap bar', 'Trap Bar Deadlift', 'deadlift', 'deadlift', ['quads', 'glutes', 'hamstrings'], ['traps', 'back'], ['other'], 2, { category: 'full_body', functional: true }),
  ex('thruster', 'Thruster', 'Thruster', 'squat', 'thruster', ['quads', 'shoulders'], ['glutes', 'triceps', 'abs'], DB, 2, { category: 'full_body', functional: true }),
  ex('bb_thruster', 'Thruster con bilanciere', 'Barbell Thruster', 'squat', 'thruster', ['quads', 'shoulders'], ['glutes', 'triceps'], BB, 3, { category: 'full_body', functional: true }),
  ex('burpee', 'Burpee', 'Burpee', 'conditioning', 'burpee', ['full_body'], ['chest', 'quads', 'cardio'], [], 2, { category: 'full_body', functional: true }),
  ex('man_maker', 'Man maker', 'Man Maker', 'conditioning', 'burpee', ['full_body'], ['back', 'shoulders', 'quads'], DB, 3, { category: 'full_body', functional: true }),
  ex('kb_clean_press', 'Clean & press con kettlebell', 'Kettlebell Clean and Press', 'overhead_press', 'thruster', ['shoulders', 'glutes'], ['quads', 'triceps', 'abs'], KB, 3, { category: 'full_body', functional: true }),
  ex('turkish_get_up', 'Turkish get-up', 'Turkish Get-up', 'core_stability', 'burpee', ['full_body', 'abs'], ['shoulders', 'glutes'], KB, 3, { category: 'full_body', functional: true, stress: ['shoulder'] }),
  ex('db_snatch', 'Snatch con manubrio', 'Dumbbell Snatch', 'plyo', 'kb_swing', ['full_body', 'glutes'], ['shoulders', 'hamstrings'], DB, 3, { category: 'full_body', functional: true, unilateral: true }),
  ex('wall_ball', 'Wall ball', 'Wall Ball', 'squat', 'thruster', ['quads', 'shoulders'], ['glutes', 'cardio'], ['medicine_ball'], 2, { category: 'full_body', functional: true }),
  ex('box_jump', 'Box jump', 'Box Jump', 'plyo', 'box_jump', ['quads', 'glutes'], ['calves', 'cardio'], ['box'], 2, { category: 'full_body', functional: true, tracking: 'reps' }),
  ex('jump_squat', 'Jump squat', 'Jump Squat', 'plyo', 'jump_squat', ['quads', 'glutes'], ['calves'], [], 2, { functional: true }),
  ex('jumping_lunge', 'Affondi saltati', 'Jumping Lunge', 'plyo', 'lunge', ['quads', 'glutes'], ['calves', 'cardio'], [], 2, { functional: true }),
  ex('broad_jump', 'Salto in lungo da fermo', 'Broad Jump', 'plyo', 'jump_squat', ['glutes', 'quads'], ['calves'], [], 2, { functional: true }),
  ex('bear_crawl', 'Bear crawl', 'Bear Crawl', 'conditioning', 'mountain_climber', ['full_body', 'abs'], ['shoulders', 'quads'], [], 1, { category: 'full_body', functional: true, tracking: 'time' }),
  ex('sled_push', 'Spinta della slitta', 'Sled Push', 'conditioning', 'run', ['quads', 'glutes'], ['calves', 'cardio'], ['other'], 2, { category: 'full_body', functional: true, tracking: 'time' }),
  ex('battle_rope', 'Battle rope', 'Battle Ropes', 'conditioning', 'jump_rope', ['shoulders', 'cardio'], ['abs', 'forearms'], ['other'], 1, { category: 'cardio', functional: true, tracking: 'time' }),
  ex('trx_atomic_push_up', 'Atomic push-up al TRX', 'TRX Atomic Push-up', 'push_up', 'push_up', ['chest', 'abs'], ['triceps'], ['trx'], 3, { functional: true }),

  // ======== CARDIO ========
  ex('run_outdoor', 'Corsa all’aperto', 'Outdoor Run', 'cardio_machine', 'run', ['cardio'], ['quads', 'calves', 'glutes'], [], 1, { tracking: 'cardio' }),
  ex('walk_outdoor', 'Camminata veloce', 'Brisk Walk', 'cardio_machine', 'walk', ['cardio'], ['calves'], [], 1, { tracking: 'cardio' }),
  ex('treadmill_run', 'Corsa sul tapis roulant', 'Treadmill Run', 'cardio_machine', 'run', ['cardio'], ['quads', 'calves'], ['treadmill'], 1),
  ex('treadmill_walk', 'Camminata sul tapis roulant', 'Treadmill Walk', 'cardio_machine', 'walk', ['cardio'], ['calves', 'quads'], ['treadmill'], 1),
  ex('treadmill_intervals', 'Intervalli sul tapis roulant', 'Treadmill Intervals', 'cardio_machine', 'run', ['cardio'], ['quads', 'calves'], ['treadmill'], 2),
  ex('treadmill_incline_walk', 'Camminata in salita sul tapis roulant', 'Incline Treadmill Walk', 'cardio_machine', 'walk', ['cardio'], ['glutes', 'calves'], ['treadmill'], 1),
  ex('bike', 'Cyclette', 'Stationary Bike', 'cardio_machine', 'bike', ['cardio'], ['quads'], ['bike'], 1),
  ex('elliptical', 'Ellittica', 'Elliptical', 'cardio_machine', 'elliptical', ['cardio'], ['quads', 'glutes'], ['elliptical'], 1),
  ex('rower', 'Vogatore', 'Rowing Machine', 'cardio_machine', 'rower', ['cardio'], ['back', 'quads', 'glutes'], ['rower'], 1),
  ex('jump_rope', 'Salto della corda', 'Jump Rope', 'cardio_machine', 'jump_rope', ['cardio'], ['calves'], ['jump_rope'], 1),
  ex('jumping_jack', 'Jumping jack', 'Jumping Jacks', 'conditioning', 'jumping_jack', ['cardio'], ['calves', 'shoulders'], [], 1, { category: 'cardio', tracking: 'time' }),
  ex('high_knees', 'Skip alto', 'High Knees', 'conditioning', 'run', ['cardio'], ['hip_flexors', 'calves'], [], 1, { category: 'cardio', tracking: 'time' }),
  ex('stair_climber', 'Stair climber', 'Stair Climber', 'cardio_machine', 'step_up', ['cardio'], ['glutes', 'quads'], ['machine_other'], 1),
  ex('bike_intervals', 'Cyclette a intervalli', 'Bike Interval Training', 'cardio_machine', 'bike', ['cardio'], ['quads', 'glutes'], ['bike'], 1),
  ex('elliptical_intervals', 'Ellittica a intervalli', 'Elliptical Intervals', 'cardio_machine', 'elliptical', ['cardio'], ['quads', 'glutes'], ['elliptical'], 2),
  ex('rower_intervals', 'Vogatore a intervalli', 'Rowing Intervals', 'cardio_machine', 'rower', ['cardio'], ['back', 'quads'], ['rower'], 2),
  ex('hiit_bike', 'HIIT in cyclette', 'Bike Intervals', 'cardio_machine', 'bike', ['cardio'], ['quads'], ['bike'], 2),

  // ======== MOBILITÀ E STRETCHING ========
  ex('hamstring_stretch', 'Allungamento femorali da seduto', 'Seated Hamstring Stretch', 'stretch', 'stretch_hamstring', ['hamstrings'], ['lower_back'], ['mat'], 1),
  ex('quad_stretch', 'Allungamento quadricipiti in piedi', 'Standing Quad Stretch', 'stretch', 'stretch_quad', ['quads'], ['hip_flexors'], [], 1),
  ex('hip_flexor_stretch', 'Allungamento flessori dell’anca', 'Kneeling Hip Flexor Stretch', 'stretch', 'stretch_hip_flexor', ['hip_flexors'], ['quads'], ['mat'], 1),
  ex('cat_cow', 'Cat-cow', 'Cat-Cow', 'stretch', 'cat_cow', ['lower_back'], ['abs'], ['mat'], 1),
  ex('cobra_stretch', 'Cobra', 'Cobra Stretch', 'stretch', 'cobra', ['abs'], ['lower_back'], ['mat'], 1),
  ex('child_pose', 'Posizione del bambino', 'Child’s Pose', 'stretch', 'child_pose', ['lower_back', 'lats'], ['glutes'], ['mat'], 1),
  ex('arm_circles', 'Circonduzioni delle braccia', 'Arm Circles', 'stretch', 'arm_circles', ['shoulders'], [], [], 1),
  ex('band_dislocates', 'Dislocazioni con elastico', 'Band Shoulder Dislocates', 'stretch', 'arm_circles', ['shoulders'], ['chest'], ['band'], 1),
  ex('hip_circles', 'Circonduzioni dell’anca', 'Hip Circles', 'stretch', 'hip_mobility', ['glutes', 'hip_flexors'], [], [], 1),
  ex('worlds_greatest', 'World’s greatest stretch', 'World’s Greatest Stretch', 'stretch', 'stretch_hip_flexor', ['hip_flexors', 'hamstrings'], ['back'], ['mat'], 1),
  ex('pigeon_stretch', 'Posizione del piccione', 'Pigeon Pose', 'stretch', 'child_pose', ['glutes'], ['hip_flexors'], ['mat'], 2),
  ex('deep_squat_hold', 'Tenuta in squat profondo', 'Deep Squat Hold', 'stretch', 'squat_goblet', ['adductors', 'quads'], ['calves'], [], 1),
  ex('thoracic_rotation', 'Rotazioni toraciche', 'Thoracic Rotations', 'stretch', 'cat_cow', ['back'], ['obliques'], ['mat'], 1),
  ex('calf_stretch', 'Allungamento polpacci al muro', 'Wall Calf Stretch', 'stretch', 'lunge', ['calves'], [], [], 1),
  ex('chest_doorway_stretch', 'Allungamento pettorali alla porta', 'Doorway Chest Stretch', 'stretch', 'front_raise', ['chest'], ['front_delts'], [], 1),
  ex('lat_stretch', 'Allungamento dorsali', 'Lat Stretch', 'stretch', 'child_pose', ['lats'], [], ['mat'], 1),
  ex('glute_bridge_hold', 'Ponte glutei isometrico', 'Glute Bridge Hold', 'stretch', 'glute_bridge', ['glutes'], ['hamstrings'], ['mat'], 1),
  ex('ankle_mobility', 'Mobilità di caviglia', 'Ankle Mobility Drill', 'stretch', 'lunge', ['calves'], [], [], 1),
];

// ---------- Indici e helper ----------
export const EXERCISE_MAP: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined { return EXERCISE_MAP[id]; }

export function contentFor(e: Exercise) {
  const fam = FAMILIES[e.family] ?? FAMILIES.conditioning;
  return {
    description: e.desc ?? fam.description,
    setup: fam.setup,
    steps: fam.steps,
    breathing: fam.breathing,
    mistakes: fam.mistakes,
    tips: e.cue ? [e.cue, ...fam.tips] : fam.tips,
  };
}

/** Nell'esercizio, una categoria "virtuale" (gambe, corpo libero, funzionali) può includerlo oltre alla principale. */
export function inCategory(e: Exercise, c: ExCategory): boolean {
  if (e.category === c) return true;
  if (c === 'legs') return ['quads', 'hamstrings', 'glutes', 'calves', 'legs'].includes(e.category) || e.primary.some((m) => ['quads', 'hamstrings', 'adductors'].includes(m));
  if (c === 'bodyweight') return e.kind === 'bodyweight' || (e.equipment.length > 0 && e.equipment.every((x) => ['mat', 'pullup_bar', 'parallel_bars', 'dip_bar', 'box', 'trx', 'flat_bench'].includes(x)) && e.kind !== 'mobility' && e.family !== 'cardio_machine');
  if (c === 'functional') return !!e.functional;
  if (c === 'core') return e.primary.some((m) => m === 'abs' || m === 'obliques');
  if (c === 'back') return e.primary.some((m) => ['back', 'lats', 'traps', 'lower_back'].includes(m)) && e.category !== 'mobility';
  if (c === 'shoulders') return e.primary.some((m) => ['shoulders', 'front_delts', 'side_delts', 'rear_delts'].includes(m)) && e.category !== 'mobility';
  if (c === 'glutes') return e.primary.includes('glutes') && e.category !== 'mobility';
  return false;
}

/** Varianti = stessa famiglia e stesso muscolo principale. */
export function variantsOf(e: Exercise): Exercise[] {
  return EXERCISES.filter((x) => x.id !== e.id && x.family === e.family && x.primary[0] === e.primary[0]).slice(0, 8);
}

/** Alternative = stesso muscolo principale ma movimento/attrezzo diverso, ordinate per disponibilità. */
export function alternativesOf(e: Exercise, available?: Set<string>): Exercise[] {
  const scored = EXERCISES.filter((x) => x.id !== e.id && x.family !== e.family && x.kind !== 'mobility' && x.primary.some((m) => e.primary.includes(m)))
    .map((x) => {
      let s = 0;
      if (x.primary[0] === e.primary[0]) s += 3;
      if (x.movement === e.movement) s += 2;
      if (available && x.equipment.every((q) => available.has(q))) s += 2;
      return { x, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, 8).map((s) => s.x);
}

export function isAvailable(e: Exercise, equipment: Set<string>): boolean {
  return e.equipment.every((q) => q === 'bodyweight' || equipment.has(q));
}
