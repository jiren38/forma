/**
 * Architettura visiva di Forma: le sezioni dell'app, i loro colori, le funzioni che contengono
 * e i metadati di ogni pagina (sezione, breadcrumb, descrizione).
 * Navigazione, Esplora, sidebar, intestazioni e illustrazioni leggono tutti da qui.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Dumbbell, Library, HeartPulse, Apple, LineChart, Moon, Sparkles, Home, Compass, User,
} from 'lucide-react';

export type SectionKey = 'home' | 'explore' | 'training' | 'exercises' | 'cardio' | 'nutrition' | 'progress' | 'wellness' | 'coach' | 'profile';

export interface SectionLink { label: string; to: string; desc?: string }

export interface Section {
  key: SectionKey;
  label: string;
  /** Una riga sotto al titolo nelle card di Esplora. */
  tagline: string;
  /** Pagina principale della sezione. */
  to: string;
  icon: LucideIcon;
  /** Variabile CSS del colore della sezione (definita in app.css per tema chiaro e scuro). */
  color: string;
  links: SectionLink[];
}

export const SECTIONS: Record<SectionKey, Section> = {
  home: { key: 'home', label: 'Home', tagline: 'Il tuo centro di controllo', to: '/', icon: Home, color: 'var(--c-training)', links: [] },
  explore: { key: 'explore', label: 'Esplora', tagline: 'Tutte le funzioni di Forma', to: '/explore', icon: Compass, color: 'var(--c-training)', links: [] },
  training: {
    key: 'training', label: 'Allenamento', tagline: 'Schede, programmi e sessioni in palestra', to: '/workouts', icon: Dumbbell, color: 'var(--c-training)',
    links: [
      { label: 'I miei allenamenti', to: '/workouts' },
      { label: 'Schede automatiche', to: '/workouts/generate' },
      { label: 'Crea workout', to: '/workouts?new=1' },
      { label: 'Programma settimanale', to: '/workouts?focus=programs' },
      { label: 'Allenamento in corso', to: '/workout/live' },
      { label: 'Storico sessioni', to: '/history' },
    ],
  },
  exercises: {
    key: 'exercises', label: 'Esercizi', tagline: 'Enciclopedia con animazioni e tecnica', to: '/exercises', icon: Library, color: 'var(--c-exercises)',
    links: [
      { label: 'Libreria', to: '/exercises?view=all' },
      { label: 'Categorie muscolari', to: '/exercises' },
      { label: 'Preferiti', to: '/exercises?cat=fav' },
      { label: 'Recenti', to: '/exercises?cat=recent' },
      { label: 'Mobilità', to: '/exercises?cat=mobility' },
    ],
  },
  cardio: {
    key: 'cardio', label: 'Cardio', tagline: 'Tapis roulant, cyclette, intervalli e corsa', to: '/cardio', icon: HeartPulse, color: 'var(--c-cardio)',
    links: [
      { label: 'Registra attività', to: '/cardio?new=1' },
      { label: 'Storico cardio', to: '/cardio' },
      { label: 'Progressi cardio', to: '/progress?tab=cardio' },
      { label: 'Macchine cardio', to: '/exercises?cat=cardio' },
    ],
  },
  nutrition: {
    key: 'nutrition', label: 'Nutrizione', tagline: 'Diario, scanner, ricette e spesa', to: '/nutrition', icon: Apple, color: 'var(--c-nutrition)',
    links: [
      { label: 'Diario alimentare', to: '/nutrition' },
      { label: 'Scanner codice a barre', to: '/nutrition/scan' },
      { label: 'I miei prodotti', to: '/nutrition/foods' },
      { label: 'Cerca alimenti', to: '/nutrition/add' },
      { label: 'Ricette', to: '/nutrition/recipes' },
      { label: 'Piano pasti', to: '/nutrition/plan' },
      { label: 'Lista della spesa', to: '/nutrition/shopping' },
      { label: 'Obiettivi e macro', to: '/nutrition/targets' },
    ],
  },
  progress: {
    key: 'progress', label: 'Progressi', tagline: 'Carichi, record, peso, misure e foto', to: '/progress', icon: LineChart, color: 'var(--c-progress)',
    links: [
      { label: 'Grafici e carichi', to: '/progress' },
      { label: 'Record personali', to: '/progress?tab=records' },
      { label: 'Peso e misure', to: '/body' },
      { label: 'Foto progressi', to: '/body?tab=photos' },
      { label: 'Bilancio calorico', to: '/energy' },
      { label: 'Storico allenamenti', to: '/history' },
      { label: 'Traguardi', to: '/goals' },
    ],
  },
  wellness: {
    key: 'wellness', label: 'Benessere', tagline: 'Sonno, idratazione e recupero', to: '/wellness', icon: Moon, color: 'var(--c-wellness)',
    links: [
      { label: 'Sonno', to: '/wellness' },
      { label: 'Idratazione', to: '/wellness' },
      { label: 'Recupero', to: '/wellness' },
      { label: 'Mobilità', to: '/exercises?cat=mobility' },
    ],
  },
  coach: {
    key: 'coach', label: 'Personal Trainer AI', tagline: 'Chat, analisi e consigli sui tuoi dati', to: '/coach', icon: Sparkles, color: 'var(--c-coach)',
    links: [
      { label: 'Chat con il coach', to: '/coach' },
      { label: 'Suggerimenti', to: '/coach' },
    ],
  },
  profile: { key: 'profile', label: 'Profilo', tagline: 'Dati, attrezzatura e impostazioni', to: '/profile', icon: User, color: 'var(--c-training)', links: [] },
};

/** Ordine delle sezioni nella pagina Esplora e nella sidebar. */
export const EXPLORE_ORDER: SectionKey[] = ['training', 'exercises', 'cardio', 'nutrition', 'progress', 'wellness', 'coach'];

interface RouteMeta { section: SectionKey; desc?: string; crumb?: string }

/** Metadati per pagina: la regola più specifica che corrisponde vince (ordine = priorità). */
const ROUTES: [RegExp, RouteMeta][] = [
  [/^\/workouts\/generate/, { section: 'training', crumb: 'Schede automatiche', desc: 'Un programma su misura per obiettivo, livello, tempo e attrezzatura. Puoi modificare tutto dopo.' }],
  [/^\/workouts\/template\//, { section: 'training', crumb: 'Scheda', desc: 'Esercizi, serie, ripetizioni, recuperi e cardio della scheda.' }],
  [/^\/workouts\/program\//, { section: 'training', crumb: 'Programma', desc: 'Assegna una scheda a ogni giorno della settimana.' }],
  [/^\/workouts/, { section: 'training', desc: 'Le tue schede, i programmi settimanali e l’accesso rapido alle sessioni.' }],
  [/^\/session\//, { section: 'training', crumb: 'Sessione' }],
  [/^\/history/, { section: 'training', crumb: 'Storico', desc: 'Tutte le sessioni completate, dalla più recente.' }],
  [/^\/exercises\/./, { section: 'exercises', crumb: 'Esercizio' }],
  [/^\/exercises/, { section: 'exercises', desc: 'Animazioni dimostrative, muscoli coinvolti, tecnica ed errori da evitare.' }],
  [/^\/cardio/, { section: 'cardio', desc: 'Corsa, tapis roulant, cyclette e altre attività registrate fuori dalle schede.' }],
  [/^\/nutrition\/add/, { section: 'nutrition', crumb: 'Cerca alimenti', desc: 'Cerca nel database, nei tuoi alimenti o scansiona un codice a barre.' }],
  [/^\/nutrition\/recipes/, { section: 'nutrition', crumb: 'Ricette', desc: 'Ricette con valori nutrizionali calcolati dagli ingredienti.' }],
  [/^\/nutrition\/plan/, { section: 'nutrition', crumb: 'Piano pasti', desc: 'Organizza i pasti della settimana e genera la lista della spesa.' }],
  [/^\/nutrition\/shopping/, { section: 'nutrition', crumb: 'Spesa', desc: 'Gli ingredienti del piano pasti, raggruppati e da spuntare.' }],
  [/^\/nutrition\/targets/, { section: 'nutrition', crumb: 'Obiettivi', desc: 'Calorie e macronutrienti calcolati dal tuo profilo, modificabili.' }],
  [/^\/nutrition\/foods\/add/, { section: 'nutrition', crumb: 'Aggiungi prodotti', desc: 'Cerca nell’app o online e salva nei tuoi prodotti.' }],
  [/^\/nutrition\/foods/, { section: 'nutrition', crumb: 'I miei prodotti', desc: 'Il tuo catalogo: prodotti scansionati, cercati o creati da te.' }],
  [/^\/nutrition\/scanned/, { section: 'nutrition', crumb: 'I miei prodotti' }],
  [/^\/nutrition\/product\//, { section: 'nutrition', crumb: 'Prodotto' }],
  [/^\/nutrition/, { section: 'nutrition', desc: 'Il diario di oggi, le calorie e i macronutrienti.' }],
  [/^\/energy/, { section: 'progress', crumb: 'Bilancio calorico' }],
  [/^\/body/, { section: 'progress', crumb: 'Corpo e misure', desc: 'Peso, circonferenze e foto per vedere la trasformazione nel tempo.' }],
  [/^\/progress/, { section: 'progress', desc: 'Carichi, volumi, record personali e statistiche cardio.' }],
  [/^\/goals/, { section: 'progress', crumb: 'Traguardi', desc: 'Obiettivi settimanali e mensili e i traguardi sbloccati.' }],
  [/^\/wellness/, { section: 'wellness', desc: 'Sonno, idratazione, energia e indolenzimento: il recupero fa parte dei progressi.' }],
  [/^\/coach/, { section: 'coach' }],
  [/^\/notifications/, { section: 'home', crumb: 'Notifiche', desc: 'Traguardi, suggerimenti di progressione e promemoria.' }],
  [/^\/profile\/edit/, { section: 'profile', crumb: 'Modifica', desc: 'Dati fisici, obiettivi e preferenze di allenamento.' }],
  [/^\/profile\/equipment/, { section: 'profile', crumb: 'Attrezzatura' }],
  [/^\/profile/, { section: 'profile', desc: 'Il tuo account, i dati e le preferenze.' }],
  [/^\/settings/, { section: 'profile', crumb: 'Impostazioni', desc: 'Tema, unità di misura, promemoria e obiettivi.' }],
  [/^\/diagnostics\/bluetooth/, { section: 'profile', crumb: 'Diagnostica Bluetooth' }],
  [/^\/privacy/, { section: 'profile', crumb: 'Privacy', desc: 'Esporta, importa o elimina i tuoi dati.' }],
  [/^\/explore/, { section: 'explore' }],
];

export function routeMeta(pathname: string): RouteMeta {
  for (const [re, m] of ROUTES) if (re.test(pathname)) return m;
  return { section: 'home' };
}

/** Sezione evidenziata nella barra inferiore (5 voci). */
export function tabFor(pathname: string): 'home' | 'explore' | 'training' | 'nutrition' | 'profile' {
  if (pathname === '/') return 'home';
  const s = routeMeta(pathname).section;
  if (s === 'training') return 'training';
  if (s === 'nutrition') return 'nutrition';
  if (s === 'profile') return 'profile';
  if (s === 'home') return 'home';
  return 'explore';
}
