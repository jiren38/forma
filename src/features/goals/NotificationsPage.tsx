import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, Trophy, Sparkles, Calendar, Medal, Info, Settings } from 'lucide-react';
import { useNotifications } from '@/app/data';
import { store } from '@/db/store';
import { PageHeader, Empty, Confirm, useToast } from '@/components/ui';
import type { AppNotification } from '@/lib/types';

const ICON: Record<AppNotification['kind'], React.ReactNode> = {
  pr: <Trophy size={18} color="#ffb020" />, coach: <Sparkles size={18} />, reminder: <Bell size={18} />, summary: <Calendar size={18} />, badge: <Medal size={18} />, system: <Info size={18} />,
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
}

export default function NotificationsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const list = useNotifications().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [clear, setClear] = useState(false);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied');
  const unread = list.filter((n) => !n.read);

  return (
    <div className="page stack">
      <PageHeader title="Notifiche" back right={<button className="icon-btn" onClick={() => nav('/settings')} aria-label="Impostazioni promemoria"><Settings size={19} /></button>} />
      {supported && perm !== 'granted' && (
        <div className="banner">
          <Bell size={18} />
          <span className="grow">{perm === 'denied' ? 'Le notifiche di sistema sono bloccate nel browser: puoi riattivarle dalle impostazioni del sito. Le trovi comunque tutte qui.' : 'Attiva le notifiche di sistema per ricevere promemoria e record anche quando l’app è in background.'}
            {perm === 'default' && <><br /><button className="btn sm primary" style={{ marginTop: 8 }} onClick={async () => { const p = await Notification.requestPermission(); setPerm(p); toast(p === 'granted' ? 'Notifiche attivate' : 'Permesso non concesso', p === 'granted' ? 'success' : 'info'); }}>Attiva notifiche</button></>}
          </span>
        </div>
      )}
      {list.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" disabled={!unread.length} onClick={async () => { for (const n of unread) await store.put('notifications', n.id, { ...n, read: true }); }}><CheckCheck size={15} /> Segna tutte come lette</button>
          <button className="btn sm ghost" onClick={() => setClear(true)}><Trash2 size={15} /> Svuota</button>
        </div>
      )}
      {list.length === 0 ? <Empty icon={<Bell />} title="Nessuna notifica" text="Qui troverai record personali, traguardi, suggerimenti del coach, promemoria e riepiloghi settimanali." /> : (
        <div className="settings-group">
          {list.map((n) => (
            <button key={n.id} className="list-item" onClick={async () => { if (!n.read) await store.put('notifications', n.id, { ...n, read: true }); if (n.link) nav(n.link); }} style={{ alignItems: 'flex-start' }}>
              <span className="li-icon">{ICON[n.kind]}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <div className="li-title" style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</div>
                <div className="small text-2">{n.body}</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{ago(n.createdAt)}</div>
              </span>
              {!n.read && <span style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--accent)', marginTop: 8, flexShrink: 0 }} aria-label="Non letta" />}
            </button>
          ))}
        </div>
      )}
      <Confirm open={clear} onClose={() => setClear(false)} danger confirmLabel="Svuota" title="Eliminare tutte le notifiche?" onConfirm={async () => { for (const n of list) await store.remove('notifications', n.id); toast('Notifiche eliminate'); }} />
    </div>
  );
}
