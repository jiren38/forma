/**
 * Registro centralizzato delle immagini di Forma.
 *
 * Ogni chiave descrive cosa rappresenta l'immagine e come mostrarla:
 * - `art`: illustrazione originale vettoriale (sempre disponibile, offline, nessun peso aggiuntivo).
 * - `photo` (facoltativo): una fotografia con licenza. Se presente viene mostrata al posto dell'illustrazione,
 *   con l'illustrazione come ripiego se il file non si carica.
 *
 * Per sostituire o aggiungere una foto:
 *   1. salva il file ottimizzato (WebP/AVIF, lato lungo ≤ 1200 px, < 150 KB) in `public/media/visuals/`;
 *   2. compila `photo` qui sotto con percorso, testo alternativo, autore e licenza (es. Unsplash License, Pexels License).
 * Nessun componente va modificato: Esplora, Home, intestazioni e libreria leggono tutto da questo file.
 */
import type { ExCategory } from '@/data/exercises';
import type { MuscleGroup } from '@/lib/types';

export interface Photo { src: string; alt: string; credit: string; license: string; position?: string }

export type ArtSpec =
  | { kind: 'figure'; pattern: string; muscles?: MuscleGroup[]; phase?: number; scene?: 'gym' | 'track' | 'studio' }
  | { kind: 'food' }
  | { kind: 'chart' }
  | { kind: 'calm' }
  | { kind: 'neural' }
  | { kind: 'rings' };

export interface Visual {
  art: ArtSpec;
  /** Colore principale (variabile CSS) e secondario per il gradiente. */
  color: string;
  color2: string;
  photo?: Photo;
}

export type VisualKey =
  | 'training' | 'exercises' | 'cardio' | 'nutrition' | 'progress' | 'wellness' | 'coach'
  | 'home' | 'rest' | 'empty_program' | 'generate' | 'profile';

export const VISUALS: Record<VisualKey, Visual> = {
  training: { art: { kind: 'figure', pattern: 'squat_bb', muscles: ['quads', 'glutes'], phase: 0.45, scene: 'gym' }, color: 'var(--c-training)', color2: '#3a5a00' },
  exercises: { art: { kind: 'figure', pattern: 'curl', muscles: ['biceps'], phase: 0.5, scene: 'studio' }, color: 'var(--c-exercises)', color2: '#3b1f7a' },
  cardio: { art: { kind: 'figure', pattern: 'run', muscles: ['calves', 'quads'], phase: 0.3, scene: 'track' }, color: 'var(--c-cardio)', color2: '#063a5c' },
  nutrition: { art: { kind: 'food' }, color: 'var(--c-nutrition)', color2: '#6b2a00' },
  progress: { art: { kind: 'chart' }, color: 'var(--c-progress)', color2: '#5c0a36' },
  wellness: { art: { kind: 'calm' }, color: 'var(--c-wellness)', color2: '#04443c' },
  coach: { art: { kind: 'neural' }, color: 'var(--c-coach)', color2: '#1a1f6b' },
  home: { art: { kind: 'rings' }, color: 'var(--c-training)', color2: '#2a3d00' },
  rest: { art: { kind: 'figure', pattern: 'child_pose', muscles: ['lower_back'], phase: 0.5, scene: 'studio' }, color: 'var(--c-wellness)', color2: '#04443c' },
  empty_program: { art: { kind: 'figure', pattern: 'deadlift', muscles: ['hamstrings', 'glutes', 'back'], phase: 0.55, scene: 'gym' }, color: 'var(--c-training)', color2: '#3a5a00' },
  generate: { art: { kind: 'figure', pattern: 'bench_press', muscles: ['chest'], phase: 0.5, scene: 'gym' }, color: 'var(--c-training)', color2: '#3a5a00' },
  profile: { art: { kind: 'rings' }, color: 'var(--c-training)', color2: '#2a3d00' },
};

/** Illustrazione rappresentativa per ogni categoria della libreria esercizi. */
export const CATEGORY_VISUAL: Record<ExCategory, { pattern: string; muscles: MuscleGroup[]; phase: number; hint: string }> = {
  chest: { pattern: 'bench_press', muscles: ['chest'], phase: 0.5, hint: 'Panca, croci, dip' },
  back: { pattern: 'pullup', muscles: ['back', 'lats'], phase: 0.5, hint: 'Trazioni, rematori, lat machine' },
  shoulders: { pattern: 'ohp', muscles: ['shoulders'], phase: 0.5, hint: 'Lento avanti, alzate' },
  biceps: { pattern: 'curl', muscles: ['biceps'], phase: 0.5, hint: 'Curl con bilanciere e manubri' },
  triceps: { pattern: 'pushdown', muscles: ['triceps'], phase: 0.5, hint: 'Push down, french press' },
  forearms: { pattern: 'farmer_walk', muscles: ['forearms'], phase: 0.3, hint: 'Presa e polsi' },
  core: { pattern: 'crunch', muscles: ['abs'], phase: 0.5, hint: 'Crunch, plank, rotazioni' },
  quads: { pattern: 'squat_front', muscles: ['quads'], phase: 0.5, hint: 'Squat, leg extension' },
  hamstrings: { pattern: 'rdl', muscles: ['hamstrings'], phase: 0.5, hint: 'Stacchi rumeni, leg curl' },
  glutes: { pattern: 'hip_thrust', muscles: ['glutes'], phase: 0.5, hint: 'Hip thrust, ponte, slanci' },
  calves: { pattern: 'calf_raise', muscles: ['calves'], phase: 0.5, hint: 'Calf in piedi e seduto' },
  legs: { pattern: 'lunge', muscles: ['quads', 'glutes'], phase: 0.5, hint: 'Affondi, squat, pressa' },
  full_body: { pattern: 'thruster', muscles: ['quads', 'shoulders'], phase: 0.6, hint: 'Movimenti completi' },
  cardio: { pattern: 'run', muscles: ['calves', 'quads'], phase: 0.3, hint: 'Corsa, bici, vogatore' },
  mobility: { pattern: 'stretch_hip_flexor', muscles: ['hip_flexors'], phase: 0.5, hint: 'Allungamento e mobilità' },
  bodyweight: { pattern: 'push_up', muscles: ['chest', 'triceps'], phase: 0.5, hint: 'Senza attrezzi' },
  functional: { pattern: 'kb_swing', muscles: ['glutes', 'hamstrings'], phase: 0.6, hint: 'Kettlebell, salti, trasporti' },
};

/** Categorie mostrate in evidenza (card grandi) nella libreria; le altre compaiono come card compatte. */
export const FEATURED_CATEGORIES: ExCategory[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'glutes', 'cardio'];

/** Colore d'accento di ogni categoria, per variare le card senza perdere coerenza. */
export const CATEGORY_TINT: Partial<Record<ExCategory, string>> = {
  chest: '#ff7a59', back: '#7c9cff', shoulders: '#ffc145', biceps: '#c6f432', triceps: '#ff6fae', legs: '#4fe3c1',
  core: '#ffd166', glutes: '#f472b6', cardio: '#38bdf8', mobility: '#2dd4bf', quads: '#4fe3c1', hamstrings: '#60a5fa',
  calves: '#a78bfa', forearms: '#fbbf24', full_body: '#c6f432', bodyweight: '#fb923c', functional: '#f87171',
};
