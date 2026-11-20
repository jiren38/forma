import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudEnabled, supabase } from '@/db/supabase';
import { store } from '@/db/store';
import { syncEngine } from '@/db/sync';
import { authRedirectUrl } from '@/lib/native';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'ready'; mode: 'cloud' | 'local'; userId: string; email?: string | null };

interface AuthApi {
  state: AuthState;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  signInGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  useLocal: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);
const LOCAL_FLAG = 'forma.localMode';

function readFlag() { try { return localStorage.getItem(LOCAL_FLAG) === '1'; } catch { return false; } }
function writeFlag(v: boolean) { try { v ? localStorage.setItem(LOCAL_FLAG, '1') : localStorage.removeItem(LOCAL_FLAG); } catch { /* ignore */ } }

const ERR: Record<string, string> = {
  'Invalid login credentials': 'Email o password non corretti.',
  'Email not confirmed': 'Conferma prima il tuo indirizzo email (controlla la posta).',
  'User already registered': 'Esiste già un account con questa email.',
  'Password should be at least 6 characters': 'La password deve avere almeno 6 caratteri.',
};
const tr = (m: string) => ERR[m] ?? m;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  async function enter(mode: 'cloud' | 'local', userId: string, email?: string | null) {
    await store.open(mode === 'local' ? 'local' : userId);
    if (mode === 'cloud') syncEngine.start(userId); else syncEngine.stop();
    setState({ status: 'ready', mode, userId, email });
  }

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      if (cloudEnabled && supabase) {
        const { data } = await supabase.auth.getSession();
        const s: Session | null = data.session;
        if (s) await enter('cloud', s.user.id, s.user.email);
        else if (readFlag()) await enter('local', 'local');
        else setState({ status: 'signedOut' });
        const { data: sub } = supabase.auth.onAuthStateChange(async (ev, session) => {
          if (ev === 'SIGNED_IN' && session) {
            if (store.userKey !== session.user.id) { writeFlag(false); await enter('cloud', session.user.id, session.user.email); }
          } else if (ev === 'SIGNED_OUT') {
            syncEngine.stop(); store.close(); setState(readFlag() ? { status: 'signedOut' } : { status: 'signedOut' });
          }
        });
        unsub = () => sub.subscription.unsubscribe();
      } else {
        // backend non configurato: l'app funziona in modalità locale
        await enter('local', 'local');
      }
    })().catch((e) => { console.error(e); setState({ status: 'signedOut' }); });
    return () => unsub?.();
  }, []);

  const api: AuthApi = {
    state,
    async signInEmail(email, password) {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw new Error(tr(error.message));
    },
    async signUpEmail(email, password) {
      const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
      if (error) throw new Error(tr(error.message));
      return { needsConfirm: !data.session };
    },
    async signInGoogle() {
      const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } });
      if (error) throw new Error(tr(error.message));
    },
    async resetPassword(email) {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
      if (error) throw new Error(tr(error.message));
    },
    async useLocal() { writeFlag(true); await enter('local', 'local'); },
    async signOut() {
      if (state.status === 'ready' && state.mode === 'cloud') {
        await syncEngine.sync().catch(() => {});
        syncEngine.stop();
        await supabase!.auth.signOut();
        store.close();
      } else {
        writeFlag(false);
        store.close();
      }
      setState(cloudEnabled ? { status: 'signedOut' } : { status: 'loading' });
      if (!cloudEnabled) await enter('local', 'local');
    },
    async deleteAccount() {
      if (state.status !== 'ready') return;
      if (state.mode === 'cloud') {
        const { error } = await supabase!.functions.invoke('delete-account', { body: {} });
        if (error) throw new Error('Impossibile eliminare l’account: verifica che la funzione "delete-account" sia stata pubblicata su Supabase.');
        syncEngine.stop();
        await store.wipeLocal();
        await supabase!.auth.signOut();
        setState({ status: 'signedOut' });
      } else {
        await store.wipeLocal();
        writeFlag(false);
        if (cloudEnabled) setState({ status: 'signedOut' }); else await enter('local', 'local');
      }
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider mancante');
  return c;
}
