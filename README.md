# Forma: fitness, palestra, nutrizione e benessere

Web app mobile-first (responsive anche su desktop) per allenamento, alimentazione, misure corporee, cardio, recupero e coaching. Funziona subito in **modalità locale** (senza account, dati sul dispositivo). Con un progetto **Supabase** diventa multi-dispositivo, con login e sincronizzazione.

---

## 1. Avvio rapido

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm run dev:phone  # come sopra, ma in HTTPS e raggiungibile dal telefono (serve per la fotocamera, vedi 4c)
npm run build      # typecheck + build di produzione in dist/
npm test           # test automatici (vitest)
```

Senza file `.env.local` l'app parte in modalità locale. Con le variabili Supabase compare la schermata di accesso (email/password, Google). Resta disponibile anche “Usa senza account”.

## 2. Architettura

| Livello | Scelta | Perché |
|---|---|---|
| UI | React 18 + TypeScript + Vite, CSS custom (design system in `src/styles/app.css`) | Veloce, tipizzato, nessuna dipendenza UI pesante |
| Routing | `HashRouter`, pagine caricate on demand | Funziona su qualsiasi hosting statico |
| Dati locali | IndexedDB (Dexie), un database per utente, cache in memoria reattiva | Uso offline, salvataggio istantaneo |
| Backend | Supabase: Auth, Postgres con RLS, Storage privato, Edge Functions | Login, sincronizzazione tra dispositivi, sicurezza per utente |
| Sync | `src/db/sync.ts`: invio delle modifiche locali, ricezione incrementale e realtime, vince la modifica più recente | Robusto anche offline |
| AI | Edge Function `coach` con Claude. La chiave resta solo sul server. Fallback: coach locale basato su regole | Nessuna chiave nel browser |
| Animazioni | Motore scheletrico SVG originale (cinematica + IK) con circa 90 pattern di movimento | Nessuna immagine statica, nessun materiale protetto |
| PWA | manifest + service worker | Installabile, funziona offline |

### Struttura delle cartelle
```
src/
  app/          App, gate auth/onboarding, hook dati, attività in background (promemoria, badge, suggerimenti)
  db/           store IndexedDB, client Supabase, motore di sincronizzazione
  data/         database esercizi (~280), contenuti tecnici per famiglia, alimenti (~240)
  lib/          logica pura: generatore programmi, statistiche/record, nutrizione, insight, coach locale
  components/   UI riutilizzabile, grafici SVG, icone attrezzi
  features/     una cartella per area: onboarding, home, workouts, exercises (+ anim), progress,
                nutrition, body, cardio, wellness, coach, goals, profile, auth
supabase/
  migrations/   schema SQL + RLS + bucket foto
  functions/    coach (AI), delete-account
```

Per aggiungere un esercizio basta una riga in `src/data/exercises.ts` (eredita la tecnica dalla famiglia). Per un nuovo tipo di dato si aggiunge una collezione in `store.ts` e alla lista della migrazione SQL.

## 3. Cosa è stato fatto (fasi 1-10)

1. **Analisi e architettura**: local-first + Supabase, schema e sicurezza.
2. **Design system**: tema scuro antracite con accento lime, tema chiaro e di sistema, animazioni fluide, navigazione inferiore (Home, Allenamenti, Esercizi, Nutrizione, Profilo) che diventa laterale su desktop.
3. **Onboarding** in 10 passi con barra di avanzamento: dati personali, livello, obiettivi multipli, frequenza/tempo/giorni, split, infortuni (solo segnalazioni prudenti), muscoli focus/meno allenati, preferenze, attività quotidiana, alimentazione, **attrezzatura con icone** (casa, aperto, palestra, personalizzata, “Palestra completa”). Tutto modificabile dal profilo.
4. **Libreria esercizi**:
   - 17 categorie
   - ricerca (italiano/inglese, muscoli, attrezzi)
   - filtri per muscolo primario e secondario, attrezzo, difficoltà, movimento, tipo, “solo con la mia attrezzatura”
   - preferiti, recenti, varianti e alternative
   - scheda completa con animazione controllabile (play/pausa, velocità, scorrimento, fasi) e muscoli evidenziati
   - storico personale e record per ogni esercizio
5. **Allenamenti**:
   - generatore di programmi personalizzati (obiettivi, livello, giorni, minuti, attrezzatura, focus, infortuni, storico)
   - schede manuali: aggiunta dalla libreria, riordino, serie, ripetizioni, recupero, carico, note, sostituzione, duplicazione
   - programmi settimanali
6. **Allenamento live**:
   - animazione per esercizio
   - kg/ripetizioni/RPE o RIR con valori precedenti
   - timer di recupero automatico (modificabile, saltabile, con suono e vibrazione)
   - serie di riscaldamento, drop e a cedimento
   - aggiunta, rimozione e sostituzione di esercizi, note
   - record mostrati in tempo reale
   - pausa e ripresa, schermo sempre acceso
   - salvataggio continuo con backup di emergenza (ripristino dopo chiusura improvvisa)
   - riepilogo finale con confronto con la sessione precedente
7. **Progressi**: storico, allenamenti settimanali e mensili, volume, minuti, costanza (heatmap), progressione per esercizio (1RM stimato, carico, volume, ripetizioni), evoluzione della forza, serie per muscolo, record.
8. **Nutrizione**:
   - stima di BMR/TDEE/calorie/macro con spiegazione, modificabile
   - diario per pasti, con modifica, copia dal giorno prima, pasti salvati e inserimento rapido
   - database alimenti locale, ricerca online Open Food Facts (anche per codice a barre)
   - alimenti personalizzati e preferiti, ricette con calcolo per porzione
   - piano pasti settimanale e lista della spesa automatica
9. **Corpo**: peso, vita, petto, braccia, cosce, fianchi, massa grassa, grafici con obiettivo, **foto private** (locale e Storage privato) con confronto.
10. **Cardio**: 8 attività, durata, distanza, velocità, kcal stimate (MET), frequenza cardiaca, statistiche settimanali e mensili.
11. **Benessere**: sonno (orari, ore, qualità, note), acqua con promemoria, energia, stress, umore, indolenzimento per muscolo, diario del recupero, punteggio di prontezza e indicazioni prudenti.
12. **Coach**:
    - AI con i dati reali dell'utente
    - propone modifiche alle schede che si applicano solo se le accetti
    - coach locale per la modalità offline
    - suggerimenti automatici di progressione e scarico
13. **Notifiche e traguardi**: promemoria (allenamento, pesata, acqua, riposo), record, riepilogo settimanale, obiettivi settimanali e mensili, 14 traguardi sobri.
14. **Profilo e impostazioni**: kg/lb, tema, recupero predefinito, obiettivi acqua e sonno, export JSON e CSV, ripristino backup, importazione dei dati locali nell'account, sincronizzazione manuale, logout, eliminazione account con conferma, pagina privacy.

### Test eseguiti
- `npm test`: 35 test. 18 su generatore, record, statistiche, nutrizione, progressione, readiness, badge, coach, salvataggio e chiusura della sessione, persistenza e importazione. 17 sullo scanner: cifre di controllo, UPC-E/UPC-A, lettura di Open Food Facts (anche liquidi in ml, kJ, sodio, dati mancanti), calcolo per quantità, cache locale senza duplicati, prodotto creato a mano, aggiunta al diario, correzioni dell'utente.
- Test end-to-end nel browser (Playwright, 41 controlli):
  - onboarding completo e tutte le 25 schermate raggiungibili su mobile, senza overflow orizzontale
  - allenamento completo (serie, timer, conclusione, riepilogo, storico)
  - diario alimentare, ricerca esercizi, misura del peso, coach
  - creazione di una scheda manuale, persistenza dopo ricarica
  - schermate desktop e tema chiaro
  - **0 errori in console**
- Test end-to-end dello scanner (Playwright, 25 controlli) con la fotocamera simulata di Chromium e Open Food Facts simulato: lettura dei quattro formati, prodotto trovato, liquido in ml, prodotto non trovato e creato a mano, seconda scansione senza rete, codice digitato, preferiti, più aggiunti, ricerca per marca, aggiunta dallo storico, persistenza dopo ricarica, permesso della fotocamera negato, nessun overflow orizzontale.

## 4. Configurare il backend (Supabase)

Ti servono: **un account Supabase** (piano gratuito sufficiente per iniziare) e, per il coach AI, **una chiave API Anthropic**.

1. Crea un progetto su https://supabase.com.
2. *SQL Editor*: esegui `supabase/migrations/20261118000000_init.sql`. Crea la tabella `user_docs` con RLS (ogni utente vede solo i propri dati), il realtime e il bucket privato `progress-photos`.
3. *Project Settings → API*: copia **Project URL** e **anon public key** in `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<progetto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
4. *Authentication → URL Configuration*: imposta il dominio su cui pubblicherai l'app (Site URL e Redirect URLs).
5. **Google (facoltativo)**: imposta `VITE_GOOGLE_LOGIN=1` nella build per mostrare il pulsante, poi crea un OAuth Client ID su Google Cloud Console, con redirect `https://<progetto>.supabase.co/auth/v1/callback`. Poi inserisci Client ID e Secret in *Authentication → Providers → Google*.
6. **Edge Functions** (con la Supabase CLI):
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase functions deploy coach
   supabase functions deploy delete-account
   supabase secrets set ANTHROPIC_API_KEY=<la tua chiave>
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili nelle funzioni.
7. `npm run build` e pubblica `dist/` su un hosting statico (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

Senza la chiave Anthropic l'app funziona comunque: il coach usa l'analisi locale.

## 4b. Animazioni realistiche (GymVisual o altre con licenza)

Ogni esercizio può mostrare una GIF, WebP o MP4 acquistata al posto dell'animazione stickman. Gli esercizi senza file continuano a usare lo stickman, e nella scheda dell'esercizio si può passare alla vista "Schematica".

1. Acquista le GIF senza watermark da GymVisual (la licenza copre solo i file acquistati, non le anteprime).
2. `node scripts/import-media.mjs --modello` crea `media-mappa.csv` con i 280 esercizi. Nella colonna `nome_file` scrivi il nome del file acquistato.
3. `node scripts/import-media.mjs <cartella-con-le-gif> media-mappa.csv` copia i file in `public/media/exercises/` e aggiorna `manifest.json`.
4. `npm run build` (oppure `npm run dev`).

## 4c. Scanner alimentare (codice a barre)

Da **Nutrizione → Scansiona prodotto**, oppure dall'icona accanto alla ricerca alimenti. Legge EAN-13, EAN-8, UPC-A e UPC-E, cerca il prodotto su Open Food Facts e lo aggiunge al diario con la quantità scelta (grammi, ml, porzioni o confezione).

**Configurazione esterna: nessuna.** Open Food Facts è gratuito e non richiede chiavi né account. Limiti da conoscere:
- circa 15 ricerche di prodotto al minuto per indirizzo IP. I prodotti già consultati restano salvati sul dispositivo e non vengono richiesti di nuovo (aggiornamento automatico dopo 30 giorni, o con il pulsante "Aggiorna");
- i dati sono compilati da volontari (licenza ODbL, foto CC BY-SA): l'app non stima mai i valori mancanti, li mostra come "n.d.". Puoi correggerli o completarli e la tua versione prevale.

**La fotocamera funziona solo in HTTPS o su `localhost`.** Sul computer basta `npm run dev`. Per il telefono:

1. Computer e telefono sulla **stessa rete Wi-Fi**.
2. Sul computer: `npm run dev:phone`. Il terminale mostra un indirizzo tipo `Network: https://192.168.1.23:5173/`. Se il sistema chiede di consentire le connessioni in entrata a Node, accetta.
3. Sul telefono apri quell'indirizzo. Il certificato è generato in locale, quindi il browser avvisa che la connessione non è privata:
   - **iPhone (Safari)**: "Mostra dettagli" → "visita questo sito web" → conferma;
   - **Android (Chrome)**: "Avanzate" → "Procedi su 192.168.… (non sicuro)".
4. Nutrizione → Scansiona prodotto → consenti la fotocamera.

Con il certificato locale il funzionamento offline (service worker) non si attiva: è normale e non riguarda lo scanner. Per una versione stabile da installare sul telefono, pubblica `dist/` su un hosting statico con HTTPS (per esempio trascinando la cartella su Netlify Drop: certificato valido, nessuna configurazione).

**Telefono e computer con gli stessi dati**: senza Supabase ogni dispositivo ha il proprio archivio locale. Con Supabase configurato (sezione 4) prodotti scansionati, prodotti creati da te, preferiti e diario si sincronizzano tra i dispositivi dello stesso account, senza duplicati, e sono inclusi nel backup JSON. Per il login con Google dal telefono in rete locale aggiungi anche l'indirizzo `https://192.168.…:5173` tra i Redirect URLs di Supabase.

**Lettura dei codici**: dove il browser lo offre (Chrome su Android e macOS) si usa il lettore nativo `BarcodeDetector`, altrimenti (iPhone, Firefox, Windows) la libreria open source ZXing, con un lettore UPC-E riscritto perché quello della libreria non funziona. Torcia e zoom compaiono solo se la fotocamera li supporta (su iPhone Safari la torcia non è controllabile dal browser; lo zoom resta disponibile in versione digitale). Se la fotocamera non è disponibile si può sempre digitare il codice.

## 4d. App iPhone nativa (Capacitor + SideStore)

`ios/` contiene il progetto Xcode generato da Capacitor (`capacitor.config.ts`, cartella web `dist/`).
Il workflow `.github/workflows/ios.yml` compila su macOS un `Forma.ipa` non firmato e, su `main`, lo pubblica
nella release `ios-latest`. Il Bluetooth passa da `src/lib/ble` (Web Bluetooth nel browser, plugin
`@capacitor-community/bluetooth-le` nell'app). Installazione sul telefono: [docs/iphone.md](docs/iphone.md).

Dopo una modifica al codice web non serve toccare `ios/`: il workflow esegue `npm run build` e `npx cap sync ios`.

## 5. Cosa manca o è da completare

- **Notifiche push con app chiusa**: oggi i promemoria arrivano con app aperta o installata e attiva. Per le push vere servono un servizio Web Push (chiavi VAPID) e una funzione pianificata lato server.
- **Login con Apple**: non incluso (richiede un account Apple Developer a pagamento).
- **Integrazioni con smartwatch e Health** (Apple Health, Google Fit, Garmin): non previste in una web app, richiedono un'app nativa o API di terze parti.
- **Database alimenti**: circa 240 alimenti di base con valori medi, più Open Food Facts online. Per un archivio molto ampio e verificato servirebbe una banca dati con licenza.
- **Animazioni**: stickman originali e schematici, sostituibili con GIF realistiche acquistate (sezione 4b).
- Traduzione in altre lingue (oggi solo italiano), test su più browser e dispositivi reali, test di carico della sincronizzazione.

## 6. Note di sicurezza e salute
- Nessuna chiave segreta nel frontend. La chiave anon di Supabase è pubblica per design, la protezione è data dalle policy RLS.
- Le foto sono in un bucket privato, in una cartella per utente.
- Stime nutrizionali, programmi e consigli sono indicativi e non sostituiscono medici, fisioterapisti o nutrizionisti. L'app lo ricorda nei punti rilevanti.
