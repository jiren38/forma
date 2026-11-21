/** Ricerca online dei prodotti confezionati (Open Food Facts), automatica dopo una pausa nella digitazione. */
import { useEffect, useRef, useState } from 'react';
import { searchOffProducts } from '@/lib/off-search';
import type { Food } from '@/lib/types';

export type OnlineState = { loading: boolean; results: Food[]; error?: string } | null;

export function useOnlineSearch(q: string) {
  const [off, setOff] = useState<OnlineState>(null);
  const term0 = useRef('');
  async function run(auto = false) {
    const term = q.trim();
    if (term.length < 2 || /^\d{8,14}$/.test(term)) return;
    if (term0.current === term && off && !off.error) return;
    term0.current = term;
    setOff({ loading: true, results: [] });
    const r = await searchOffProducts(term);
    if (term0.current !== term) return; // nel frattempo la ricerca è cambiata
    if (r.status === 'ok') setOff({ loading: false, results: r.foods.slice(0, 30) });
    else setOff({ loading: false, results: [], error: auto && r.kind === 'throttled' ? undefined : r.message });
  }
  useEffect(() => {
    setOff(null); term0.current = '';
    const term = q.trim();
    if (term.length < 3 || /^\d+$/.test(term)) return;
    const t = setTimeout(() => { void run(true); }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return { off, retry: () => { term0.current = ''; void run(); } };
}
