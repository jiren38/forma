import { useState } from 'react';
import { Mail, Lock, Smartphone } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { BrandMark } from '@/components/brand';
import { Segmented } from '@/components/ui';


/** Il login con Google compare solo se il provider è stato attivato su Supabase. */
const googleLogin = import.meta.env.VITE_GOOGLE_LOGIN === '1';

export default function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPw = password.length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!validEmail) return setErr('Inserisci un indirizzo email valido.');
    if (mode === 'signup' && !validPw) return setErr('La password deve avere almeno 8 caratteri.');
    setBusy(true);
    try {
      if (mode === 'login') await auth.signInEmail(email.trim(), password);
      else {
        const r = await auth.signUpEmail(email.trim(), password);
        if (r.needsConfirm) setInfo('Ti abbiamo inviato un’email di conferma. Apri il link per attivare l’account, poi accedi.');
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="auth-card stack">
        <div className="col" style={{ alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <BrandMark size={52} />
          <h1 style={{ fontSize: 30 }}>Forma</h1>
          <p className="muted center">Il tuo personal trainer digitale: allenamenti, progressi, nutrizione e benessere sincronizzati su tutti i dispositivi.</p>
        </div>
        <div className="card pad-lg stack">
          <Segmented value={mode} onChange={(v) => { setMode(v); setErr(null); setInfo(null); }} options={[{ value: 'login', label: 'Accedi' }, { value: 'signup', label: 'Registrati' }]} label="Accesso o registrazione" />
          <form className="stack-sm" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="input-group"><span className="prefix"><Mail size={18} /></span><input id="email" className="input with-prefix" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" /></div>
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <div className="input-group"><span className="prefix"><Lock size={18} /></span><input id="pw" className="input with-prefix" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Almeno 8 caratteri' : '••••••••'} /></div>
            </div>
            {err && <div className="error-text" role="alert">{err}</div>}
            {info && <div className="banner">{info}</div>}
            <button className="btn primary block lg" disabled={busy} type="submit">{busy ? <span className="spinner" /> : mode === 'login' ? 'Accedi' : 'Crea account'}</button>
            {mode === 'login' && (
              <button type="button" className="btn ghost block sm" onClick={async () => {
                setErr(null);
                if (!validEmail) return setErr('Inserisci la tua email per ricevere il link di reset.');
                try { await auth.resetPassword(email.trim()); setInfo('Se l’email è registrata riceverai un link per reimpostare la password.'); } catch (e: any) { setErr(e.message); }
              }}>Password dimenticata?</button>
            )}
          </form>
          {googleLogin && <>
          <div className="divider">oppure</div>
          <button className="btn block" onClick={async () => { setErr(null); try { await auth.signInGoogle(); } catch (e: any) { setErr(e.message); } }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continua con Google
          </button>
          </>}
        </div>
        <button className="btn ghost block" onClick={() => auth.useLocal()}>
          <Smartphone size={18} /> Usa senza account (solo su questo dispositivo)
        </button>
        <p className="tiny muted center">Senza account i dati restano solo in questo browser e non vengono sincronizzati. Potrai importarli in un account in seguito.</p>
      </div>
    </div>
  );
}
