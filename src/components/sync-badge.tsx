import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, HardDrive, AlertCircle } from 'lucide-react';
import { syncEngine, type SyncStatus } from '@/db/sync';
import { useAuth } from '@/app/auth';
import { Link } from 'react-router-dom';

export function useSyncStatus() {
  const [s, setS] = useState<{ status: SyncStatus; lastSync?: string; error?: string }>({ status: syncEngine.status });
  useEffect(() => syncEngine.subscribe((status, info) => setS({ status, lastSync: info?.lastSync, error: info?.error })), []);
  return s;
}

export function SyncBadge() {
  const { state } = useAuth();
  const s = useSyncStatus();
  if (state.status !== 'ready') return null;
  if (state.mode === 'local') return <Link to="/settings" className="icon-btn" title="Modalità locale: dati solo su questo dispositivo" aria-label="Modalità locale"><HardDrive size={18} /></Link>;
  const icon = s.status === 'syncing' ? <RefreshCw size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : s.status === 'offline' ? <CloudOff size={18} /> : s.status === 'error' ? <AlertCircle size={18} color="var(--danger)" /> : <Cloud size={18} />;
  const label = s.status === 'syncing' ? 'Sincronizzazione…' : s.status === 'offline' ? 'Offline: i dati verranno sincronizzati appena torni online' : s.status === 'error' ? `Errore di sincronizzazione: ${s.error ?? ''}` : 'Sincronizzato';
  return <button className="icon-btn" title={label} aria-label={label} onClick={() => syncEngine.sync()}>{icon}</button>;
}
