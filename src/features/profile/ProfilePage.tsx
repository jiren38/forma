import { Link } from 'react-router-dom';
import { UserPen, Dumbbell, Target, Ruler, Moon, Bike, TrendingUp, Sparkles, Bell, Settings, Shield, ChevronRight, LogOut, Cloud, HardDrive, History, Trophy } from 'lucide-react';
import { useBadges, useProfile, useSessions, useSettings, useMeasurements } from '@/app/data';
import { useAuth } from '@/app/auth';
import { completedSessions, sessionStats } from '@/lib/stats';
import { GOAL_INFO, LEVEL_INFO } from '@/lib/labels';
import { bmi } from '@/lib/nutrition';
import { PageHeader } from '@/components/ui';
import { SyncBadge } from '@/components/sync-badge';
import { fmtN, fmtW } from '@/lib/util';

export default function ProfilePage() {
  const p = useProfile()!;
  const s = useSettings();
  const { state, signOut } = useAuth();
  const sessions = useSessions();
  const badges = useBadges();
  const ms = useMeasurements();
  const done = completedSessions(sessions);
  const vol = done.reduce((a, x) => a + sessionStats(x).volume, 0);
  const lastW = ms.filter((m) => m.weightKg).sort((a, b) => a.date.localeCompare(b.date)).pop()?.weightKg ?? p.weightKg;
  const cloud = state.status === 'ready' && state.mode === 'cloud';

  const links = [
    { to: '/profile/edit', icon: UserPen, title: 'Dati personali e obiettivi', sub: 'Età, peso, livello, obiettivi, frequenza, infortuni, alimentazione' },
    { to: '/profile/equipment', icon: Dumbbell, title: 'Attrezzatura e luoghi', sub: p.fullGym ? 'Palestra completa' : `${p.equipment.length} attrezzi selezionati` },
    { to: '/goals', icon: Trophy, title: 'Obiettivi e traguardi', sub: `${badges.length} traguardi sbloccati` },
    { to: '/body', icon: Ruler, title: 'Corpo, misure e foto', sub: 'Peso, circonferenze, foto private' },
    { to: '/progress', icon: TrendingUp, title: 'Progressi', sub: 'Grafici, record, muscoli allenati' },
    { to: '/history', icon: History, title: 'Storico', sub: `${done.length} allenamenti` },
    { to: '/cardio', icon: Bike, title: 'Cardio', sub: 'Corsa, camminata, bici e altro' },
    { to: '/wellness', icon: Moon, title: 'Benessere e recupero', sub: 'Sonno, acqua, energia, indolenzimento' },
    { to: '/coach', icon: Sparkles, title: 'Coach', sub: 'Consigli basati sui tuoi dati' },
    { to: '/notifications', icon: Bell, title: 'Notifiche', sub: 'Promemoria, record, riepiloghi' },
    { to: '/settings', icon: Settings, title: 'Impostazioni', sub: 'Unità, tema, promemoria, backup, account' },
    { to: '/privacy', icon: Shield, title: 'Privacy e dati', sub: 'Come trattiamo i tuoi dati' },
  ];

  return (
    <div className="page stack">
      <PageHeader title="Profilo" right={<SyncBadge />} />
      <section className="card hero pad-lg">
        <div className="row" style={{ gap: 14 }}>
          <div style={{ width: 60, height: 60, borderRadius: 20, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26 }} aria-hidden>{p.name.slice(0, 1).toUpperCase()}</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="ellipsis">{p.name}</h2>
            <div className="small text-2">{LEVEL_INFO[p.level].label} · {p.age} anni · {p.heightCm} cm</div>
            <div className="tiny muted row" style={{ gap: 4, marginTop: 2 }}>{cloud ? <><Cloud size={12} /> {state.status === 'ready' ? state.email ?? 'Account cloud' : ''}</> : <><HardDrive size={12} /> Dati solo su questo dispositivo</>}</div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>{p.goals.map((g) => <span key={g} className="pill accent"><Target size={11} /> {GOAL_INFO[g].label}</span>)}</div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <div className="stat"><span className="v">{done.length}</span><span className="l">allenamenti</span></div>
          <div className="stat"><span className="v">{fmtN(vol / 1000, 1)} t</span><span className="l">volume totale</span></div>
          <div className="stat"><span className="v">{fmtW(lastW, s.units)}</span><span className="l">peso · IMC {fmtN(bmi({ weightKg: lastW, heightCm: p.heightCm }), 1)}</span></div>
        </div>
      </section>
      <div className="settings-group">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="list-item">
            <span className="li-icon"><l.icon size={19} /></span>
            <span className="grow" style={{ minWidth: 0 }}><div className="li-title">{l.title}</div><div className="li-sub ellipsis">{l.sub}</div></span>
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}
      </div>
      <button className="btn block" onClick={() => signOut()}><LogOut size={17} /> {cloud ? 'Esci dall’account' : 'Esci (i dati restano su questo dispositivo)'}</button>
      <p className="tiny muted center">Forma · versione 1.0 · build {__BUILD_ID__.slice(0, 16).replace('T', ' ')}</p>
    </div>
  );
}
