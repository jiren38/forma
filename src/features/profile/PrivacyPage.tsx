import { Link } from 'react-router-dom';
import { Shield, Database, Lock, Sparkles, Camera, Download, Trash2, Globe } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useAuth } from '@/app/auth';

export default function PrivacyPage() {
  const { state } = useAuth();
  const cloud = state.status === 'ready' && state.mode === 'cloud';
  const items = [
    { icon: Database, title: 'Dove sono i tuoi dati', text: cloud ? 'Sul tuo dispositivo (per l’uso offline) e nel database cloud collegato al tuo account. Ogni riga è associata al tuo identificativo e le regole di sicurezza del database (Row Level Security) impediscono a chiunque altro di leggerla o modificarla.' : 'Solo su questo dispositivo, nel database del browser. Nessun dato viene inviato a server esterni. Se cancelli i dati del browser li perdi: esporta un backup regolarmente.' },
    { icon: Lock, title: 'Cosa usiamo e perché', text: 'Età, sesso, altezza, peso, livello, obiettivi, infortuni e attrezzatura servono esclusivamente a personalizzare allenamenti, stime nutrizionali e consigli. Non vendiamo né condividiamo i tuoi dati e non mostriamo pubblicità.' },
    { icon: Camera, title: 'Foto progressi', text: cloud ? 'Salvate sul dispositivo e in uno spazio di archiviazione privato accessibile solo al tuo account. Non vengono analizzate né condivise.' : 'Salvate solo sul dispositivo. Non vengono analizzate né condivise.' },
    { icon: Sparkles, title: 'Coach AI', text: cloud ? 'Quando scrivi al coach AI, un riepilogo dei tuoi dati di allenamento, alimentazione e benessere viene inviato al servizio di intelligenza artificiale tramite il nostro server per generare la risposta. Il coach non modifica mai le schede senza la tua conferma.' : 'In modalità senza account il coach funziona interamente sul dispositivo, senza inviare dati.' },
    { icon: Globe, title: 'Servizi esterni', text: 'La ricerca online degli alimenti confezionati usa Open Food Facts (database aperto) e invia solo il testo cercato o il codice a barre. I caratteri tipografici sono caricati da Google Fonts.' },
    { icon: Download, title: 'Portabilità', text: 'Puoi esportare in qualsiasi momento tutti i tuoi dati (JSON) e lo storico allenamenti (CSV) dalle Impostazioni.' },
    { icon: Trash2, title: 'Cancellazione', text: 'Puoi eliminare account e dati in modo definitivo dalle Impostazioni. L’eliminazione rimuove dati, foto e account dal cloud e dal dispositivo.' },
    { icon: Shield, title: 'Salute', text: 'Forma non è un dispositivo medico. Stime, programmi e consigli hanno carattere generale e non sostituiscono medici, fisioterapisti, dietisti o nutrizionisti.' },
  ];
  return (
    <div className="page stack">
      <PageHeader title="Privacy e dati" back />
      {items.map((it) => (
        <section key={it.title} className="card row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <span className="li-icon" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><it.icon size={19} /></span>
          <div><h3>{it.title}</h3><p className="small text-2" style={{ marginTop: 4, lineHeight: 1.6 }}>{it.text}</p></div>
        </section>
      ))}
      <Link to="/settings" className="btn block">Vai alle impostazioni dei dati</Link>
    </div>
  );
}
