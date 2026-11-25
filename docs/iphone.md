# Forma come app iPhone (gratis, senza Mac)

L'app nativa è la stessa Forma del sito, impacchettata con Capacitor. In più ha il **Bluetooth**
(cyclette e tapis roulant), che Safari e la PWA su iPhone non hanno.

- Il file `Forma.ipa` lo compila GitHub su un Mac (workflow `App iPhone`, `.github/workflows/ios.yml`).
- È **non firmato**: lo firma **SideStore** sul telefono con il tuo Apple ID gratuito.
- Con un Apple ID gratuito la firma dura **7 giorni**: SideStore la rinnova dal telefono, senza PC.

Link fisso dell'ultima versione (si aggiorna a ogni modifica su `main`):
https://github.com/jiren38/forma/releases/download/ios-latest/Forma.ipa

## 1. Una volta sola, dal PC Windows

1. Installa **iTunes** dal Microsoft Store (serve solo per i driver dell'iPhone).
2. Scarica **iloader** solo da https://github.com/nab138/iloader/releases (o iloader.app) e installalo.
3. Sull'iPhone: imposta un codice di sblocco (se non c'è già).
4. Collega l'iPhone al PC col cavo, sblocca il telefono e tocca **Autorizza** ("Considera attendibile questo computer").
5. Apri iloader, accedi con il tuo **Apple ID** (va bene quello normale e gratuito) e scegli **Install SideStore**.
   iloader installa SideStore e mette sul telefono il "pairing file", che serve per i rinnovi senza PC.
6. Sull'iPhone: **Impostazioni › Privacy e sicurezza › Modalità sviluppatore** › attivala e riavvia quando richiesto.
7. **Impostazioni › Generale › VPN e gestione dispositivi**: tocca il tuo Apple ID e **Autorizza**.
8. Dall'App Store installa **LocalDevVPN** (gratis). SideStore lo usa per firmare le app dal telefono.

## 2. Installa Forma

1. Sull'iPhone apri il link qui sopra in Safari: `Forma.ipa` finisce in **File › Download**.
2. Attiva **LocalDevVPN**.
3. Apri **SideStore › My Apps**, tocca **+** e scegli `Forma.ipa`.
4. Forma compare nella schermata Home. Accedi con la stessa email e password della versione web: i dati si sincronizzano.

## 3. Ogni settimana (o quando esce una versione nuova)

- **Rinnovo**: attiva LocalDevVPN, apri SideStore › My Apps › **Refresh All**. Fallo prima dei 7 giorni
  (SideStore mostra i giorni rimasti). Se scade, l'app non si apre ma i dati restano: basta rinnovare.
- **Aggiornamento**: riscarica `Forma.ipa` dal link e installalo di nuovo con **+**: sostituisce la vecchia versione
  mantenendo i dati.

## Note

- Con un Apple ID gratuito puoi avere al massimo 3 app firmate attive (SideStore conta come una).
- Il Bluetooth si prova da **Impostazioni › Strumenti sperimentali › Diagnostica Bluetooth**: la prima volta iOS
  chiede il permesso. In questa fase l'app legge soltanto i dati, non invia comandi agli attrezzi.
- I link delle email (conferma account, reset password) si aprono sulla versione web: dopo, accedi nell'app con email e password.
- Il login con Google nell'app non è disponibile (è comunque spento anche sul web).

## Apple Salute (passi, sonno, peso)

Con l'Apple ID gratuito l'app **non può avere il permesso HealthKit**: iloader e SideStore, con un account gratuito, abilitano solo i "gruppi di app" e scartano HealthKit dalla firma (serve l'Apple Developer Program a pagamento). Per questo i dati arrivano da **Comandi Rapidi**, che ha già accesso a Salute:

1. Il comando "Forma Salute" legge passi (ultimi 7 giorni, raggruppati per giorno), sonno (ultimi 2 giorni, fasi singole) e peso (ultimi 30 giorni).
2. Scrive una riga per campione, `passi;<inizio>;<fine>;<valore>` (idem `sonno` e `peso`), e apre `forma://salute?d=<testo codificato>` (dall'app) oppure `https://jiren38.github.io/forma/#/salute/importa?d=…` (da Safari).
3. Forma salva tutto negli archivi esistenti: passi e sonno in Benessere (`WellnessDay.steps`, `sleepHours` con `sleepSource: 'health'`), peso in Corpo e misure (`Measurement.weightSource: 'health'`) e nel profilo. Niente doppioni: il sonno inserito a mano resta, una pesata già presente quel giorno non si duplica, le pesate già importate (anche se poi cancellate) non tornano.

La guida passo passo per creare il comando e l'automazione "quando apro Forma" è nell'app: **Impostazioni › Collegamenti › Apple Salute** (`#/salute`). Lo schema `forma://` richiede l'.ipa compilato da questa versione in poi (reinstallarlo una volta con iloader › Import IPA). Logica e test: `src/lib/health.ts`, `src/test/health.test.ts`.
