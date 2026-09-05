# SplitFree

App per dividere le spese in stile Splitwise: **gratuita, open source, senza pubblicità**. Al primo avvio colleghi il tuo cloud — **WebDAV (pCloud, Koofr, Nextcloud: consigliato, nessuna registrazione)** oppure Google Drive/OneDrive: i dati dell'app vivono in un file JSON sul *tuo* cloud (nessun server di SplitFree) e il dispositivo tiene solo una cache locale che funziona offline. In più, un gruppo può diventare **condiviso** e sincronizzarsi con le altre persone tramite un file JSON sul cloud dell'amministratore. Funziona su **Android** (APK) e su **Mac** (app desktop), con lo stesso codice.

## Funzionalità

- **I tuoi dati nel tuo cloud**: all'apertura colleghi un server WebDAV (pCloud, Koofr, Nextcloud…) oppure Google Drive/OneDrive (onboarding obbligatorio) e i dati si sincronizzano da soli sul file `splitfree_data.json` del tuo account. Si può anche continuare senza account, con i dati solo sul dispositivo (vedi [I tuoi dati nel tuo cloud](#i-tuoi-dati-nel-tuo-cloud) sotto).
- **Offline di serie**: lo store locale è una cache completa: l'app funziona senza rete e carica le modifiche sul cloud appena torni online.
- **Gruppi locali o condivisi**: un gruppo locale resta solo sul telefono, come sempre; uno condiviso via file vive in un JSON su Telegram (consigliato), WebDAV, Google Drive o OneDrive (vedi [Condividere un gruppo via file](#condividere-un-gruppo-via-file) sotto); il percorso legacy su Firestore resta disponibile (vedi [Gruppi condivisi](#gruppi-condivisi-in-tempo-reale) sotto).
- **Persone locali**: nei gruppi locali sono schede sul dispositivo, non serve che abbiano l'app.
- **Spese con icona automatica**: l'icona (e la categoria) viene dedotta dal titolo. "Pizza da Gino" mostra una pizza, "Benzina" un'auto, "Hotel Bologna" un letto. Si può sempre cambiare a mano.
- **Motore di divisione** con arrotondamento esatto al centesimo (metodo del massimo resto):
  - parti uguali;
  - percentuali;
  - quote (2 a me, 1 a te);
  - importi esatti.
- **Più pagatori** per la stessa spesa.
- **Bilanci** per persona e per gruppo, con "ti devono / devi" in evidenza.
- **Semplificazione dei debiti**: accoppiamento delle coppie e terne a somma zero, poi greedy sul bilancio netto (al più n−1 transazioni). Si può passare in un tocco alla vista "per coppia" con i debiti reali.
- **Rimborsi** registrati e sottratti dai bilanci.
- **Multi‑valuta**: ogni spesa può avere una valuta diversa da quella del gruppo; il tasso viene scaricato da API pubbliche gratuite (open.er‑api.com, con riserva frankfurter.dev), messo in cache e riutilizzato offline, oppure inserito a mano.
- **Statistiche**: andamento mensile (totale e quota personale), ripartizione per categoria e per persona, per gruppo o su tutti i gruppi.
- **Allegati locali**: foto di ricevute (galleria o fotocamera) e PDF, copiati a piena risoluzione nella memoria privata dell'app.
- **Backup manuale**: esportazione e importazione di un file JSON per spostare i dati fra dispositivi (distinto dalla sincronizzazione automatica sul cloud).
- **Tema chiaro/scuro**, interfaccia in italiano.
- **Navigazione in alto**, non in basso: sul telefono i pulsanti di sistema (Android) o l'indicatore gesture (iOS) stanno già in fondo allo schermo. Si passa da una sezione all'altra toccando la barra in alto oppure trascinando il dito a destra o sinistra sul contenuto.
- **Email per ogni persona**: aggiungendo qualcuno a un gruppo (o dalla scheda Persone) va indicata anche la sua email.
- **Notifiche Telegram**: un messaggio sul gruppo Telegram dei partecipanti ogni volta che qualcuno aggiunge una spesa o un rimborso (vedi [Notifiche Telegram](#notifiche-telegram) sotto).

## Download

Le versioni pronte sono nella pagina **[Releases](https://github.com/DomenicoGaudioso/SplitFree/releases)**:

- `SplitFree-vX.Y.Z-android.apk`: da aprire sul telefono (Android chiede di consentire l'installazione da origini sconosciute, perché non passa dal Play Store);
- `SplitFree-vX.Y.Z-macos.dmg`: per Mac con chip Apple (arm64) e Intel (x64); l'app non è firmata, quindi al primo avvio usare tasto destro → Apri.

Ogni tag `v*` pubblicato sul repo fa partire la build e crea la release con i file allegati.

## Stack

| Livello | Scelta |
|---|---|
| UI | React Native + Expo SDK 57, TypeScript strict, Expo Router |
| Stato | Zustand, con salvataggio automatico dopo ogni modifica |
| Dati locali | File JSON nella cartella privata dell'app (Android); localStorage + IndexedDB (web/Mac) — cache offline |
| Dati cloud personale | `splitfree_data.json` su WebDAV (Basic auth) o Google Drive / OneDrive (OAuth2 + PKCE con refresh token) |
| Dati condivisi | Firestore + Firebase Auth, un progetto per amministratore (nessun backend gestito da SplitFree) |
| Motore finanziario | `src/domain/` puro TypeScript, testato con Vitest |
| Grafici | react-native-svg (nessuna libreria di charting) |
| Desktop | Electron che incapsula la build web statica |

Tutti gli importi sono interi in unità minori (centesimi): niente errori in virgola mobile.

## I tuoi dati nel tuo cloud

Al primo avvio l'app chiede di collegare un cloud (onboarding obbligatorio). Da quel momento:

- l'intero archivio (persone, gruppi, spese, rimborsi, impostazioni) è salvato automaticamente nel file **`splitfree_data.json`** sul tuo cloud, ad ogni modifica (debounce di 5s);
- all'apertura, se il file sul cloud è più recente della copia locale, i dati vengono scaricati e sostituiti — così ritrovi tutto su ogni dispositivo;
- **offline** l'app funziona lo stesso: lo store locale è una cache completa e sincronizza appena torna la rete.

Chi preferisce non collegare nulla può toccare **"Continua senza account"**: i dati restano solo sul dispositivo, come prima.

### WebDAV (consigliato): pCloud, Koofr, Nextcloud

La via più semplice: **nessuna registrazione sviluppatore**, bastano username e password del tuo server WebDAV. Nell'onboarding tocca **"Continua con pCloud / WebDAV"**, scegli il preset (o inserisci l'URL a mano) e verifica la connessione.

- **Preset pronti**: pCloud → `https://ewebdav.pcloud.com` · Koofr → `https://app.koofr.net/dav` · Nextcloud → `https://<server>/remote.php/dav/files/<utente>`.
- **App-password consigliata**: pCloud, Koofr e Nextcloud permettono di generare password dedicate per singola app. Usane una invece della password principale: le credenziali WebDAV finiscono nei link di invito dei gruppi condivisi.
- Il file `splitfree_data.json` vive nella cartella **`/SplitFree`** del server, creata automaticamente al primo collegamento.
- Si gestisce tutto da **Impostazioni → Cloud WebDAV**: verifica della connessione, cambio credenziali, disconnessione.

### Google Drive / OneDrive (opzioni avanzate)

Restano disponibili come provider alternativi, ma il login OAuth richiede **una registrazione sviluppatore** (Client ID) configurata in fase di build: vedi sotto. Il login usa OAuth2 con **Authorization Code + PKCE e refresh token** (accesso "completo", si rinnova da solo). Eccezione: su web Google non accetta lo scambio del code senza client secret per i client "Web", quindi lì la sessione Google dura ~1h e va riconnessa dalle Impostazioni.

### Configurare i Client ID (una tantum, per chi compila l'app)

I Client ID OAuth integrati sono segnaposto: per la connessione reale servono applicazioni registrate da te.

- **Google Drive**: su [console.cloud.google.com](https://console.cloud.google.com) crea un progetto, abilita la **Google Drive API**, poi in Credenziali crea un **Client ID OAuth** (tipo "Web application" per la build web/desktop, con redirect URI `splitfree://` e l'origine della build; per Android crea anche un client Android). Imposta la variabile `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in fase di build, oppure incolla l'ID in Impostazioni → Account & Cloud Storage → Opzioni avanzate.
- **OneDrive**: su [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → App registrations → New registration (tipo "Account in qualsiasi directory organizzativa e account Microsoft personali"), piattaforma "Public client/native" con redirect URI `splitfree://`. Imposta `EXPO_PUBLIC_MICROSOFT_CLIENT_ID` oppure incolla l'Application (client) ID nelle Impostazioni.

Il file `splitfree_backup.json` delle versioni precedenti resta disponibile come **backup manuale** (Salva/Ripristina nelle Impostazioni), indipendente dalla sincronizzazione automatica.

## Gruppi condivisi (in tempo reale)

Un gruppo condiviso non ha un server gestito da SplitFree: usa il **progetto Firebase gratuito** (piano Spark, nessuna carta di credito) di chi lo amministra. I membri entrano con il proprio account **Google** o **Microsoft**, tramite Firebase Authentication collegato a quello stesso progetto.

### Passi per l'amministratore (una volta sola)

1. **Crea un progetto** su [console.firebase.google.com](https://console.firebase.google.com) (gratuito).
2. **Attiva Firestore Database** (modalità produzione va bene: le regole sono quelle sotto).
3. **Aggiungi un'app Web** al progetto (icona `</>`): la console mostra uno snippet `firebaseConfig` da copiare.
4. In SplitFree, **Impostazioni → Gruppi condivisi → Collega un progetto Firebase**: incolla quello snippet.
5. **Pubblica le regole di sicurezza**: copia il contenuto di [`firestore.rules`](firestore.rules) nella console (Firestore Database → Regole) e pubblica, oppure con la Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules --project <id-del-progetto>
   ```
6. Per far entrare le persone con **Google**: Authentication → Sign-in method → attiva "Google". La console genera un **Web Client ID**: incollalo nel progetto collegato in SplitFree (Impostazioni → Modifica → "Google Web Client ID").
7. Per farle entrare con **Microsoft** (account personali o aziendali, entrambi gratuiti): crea una [App registration su Azure](https://portal.azure.com) (Microsoft Entra ID → App registrations → New registration, tipo di account "Account in qualsiasi directory organizzativa e account Microsoft personali"), aggiungi come redirect URI `splitfree://` (piattaforma "Web" o "Public client"), poi in Firebase Authentication → Sign-in method → aggiungi provider OIDC personalizzato con id `microsoft.com` e lo stesso Application (client) ID; incolla l'ID anche nel progetto collegato in SplitFree.

Da qui, **Gruppi → Nuovo gruppo → Gruppo condiviso** crea il gruppo su quel progetto, e dal dettaglio del gruppo **Invita persone** genera un link (`splitfree://join?...`) da mandare a chiunque: chi ce l'ha e ha già installato SplitFree lo apre, accede con Google o Microsoft ed entra.

### Cosa succede sotto: schema Firestore

```
groups/{groupId}                     nome, valuta, proprietario
groups/{groupId}/members/{uid}       persone collegate (id = uid Firebase Auth)
groups/{groupId}/expenses/{id}       spese
groups/{groupId}/settlements/{id}    rimborsi
invites/{code}                       inviti (il "code" stesso è il segreto)
```

Le regole (`firestore.rules`) fanno rispettare: solo l'amministratore crea/elimina il gruppo; solo un membro può generare inviti per quel gruppo; ci si aggiunge da soli solo presentando un invito attivo o essendo il proprietario; solo i membri leggono/scrivono spese e rimborsi.

### Limiti di questa prima versione

- Gli **allegati** (foto/PDF delle ricevute) restano solo locali anche nei gruppi condivisi: non vengono sincronizzati agli altri membri.
- Non c'è ancora una schermata per **rinominare** un gruppo condiviso dopo la creazione (il motore lo supporta: `cloudUpdateGroupInfo`).
- Se sei membro di gruppi condivisi su **progetti Firebase di amministratori diversi**, l'accesso è per progetto: potresti dover accedere più di una volta.
- Home e la lista Gruppi mostrano nome/persone dei gruppi condivisi con gli ultimi dati visti (si aggiornano aprendo il dettaglio del gruppo); i bilanci "in tempo reale" veri sono nella schermata di dettaglio.
- L'eliminazione totale di un gruppo condiviso cancella le sue sottocollezioni una per una (Firestore non supporta l'eliminazione ricorsiva lato client in un'unica operazione atomica): in rari casi di connessione interrotta a metà può restare qualche documento orfano.

## Condividere un gruppo via file

Alternativa alla condivisione Firebase (legacy): il gruppo vive in un file **`splitfree_group_<id>.json`** — su **Telegram (consigliato)**, WebDAV, Google Drive o OneDrive — nessun progetto Firebase da configurare, nessun server di SplitFree. Dal menu del gruppo: **Condividi via file** → scegli il provider → l'app carica il file e apre il foglio di condivisione con l'invito (`splitfree://join?...`).

- **Il link è il segreto**: chiunque abbia il link di invito può leggere il gruppo. Non pubblicarlo dove non vuoi estranei. Con Telegram il link contiene il **token del bot**, con WebDAV le **credenziali del server**: chi ce l'ha può leggere E scrivere. (Per WebDAV usa sempre una app-password dedicata, mai la password principale dell'account.)
- **Telegram** *(consigliato)*: il file del gruppo è un **documento pinnato** in un gruppo Telegram, letto e scritto via Bot API con il solo bot token — nessuna registrazione, nessun OAuth, e le notifiche delle spese arrivano nello stesso posto. Vedi [Condividere via Telegram](#condividere-via-telegram-consigliato) sotto.
- **WebDAV**: ogni membro può aggiungere spese e rimborsi appena entra — le credenziali viaggiano nel link, nessun account da collegare. La scrittura passa dal file sul server dell'amministratore con merge last-write-wins.
- **Lettura anonima** (solo Drive/OneDrive): chi riceve l'invito entra e legge senza nessun account (Drive: download diretto del file pubblico; OneDrive: shares API sul link di condivisione).
- **Scrittura con Drive/OneDrive**:
  - **Google Drive**: il file lo modifica solo l'amministratore dal proprio account; gli altri membri leggono e basta (banner "Accesso in sola lettura" nel gruppo).
  - **OneDrive**: ogni membro che collega il proprio account Microsoft dalle Impostazioni può aggiungere spese e rimborsi; la scrittura passa dal file dell'amministratore con merge last-write-wins.
- **Sincronizzazione**: lo store locale è la cache offline. Ogni modifica locale viene caricata sul file con un debounce di 3s (pull → merge → upload, con un retry su conflitto); all'apertura del gruppo l'app scarica e fonde lo stato remoto. Le eliminazioni viaggiano via tombstone (ricordate 30 giorni).
- Gli **allegati** restano locali anche qui, come nei gruppi Firebase.

## Condividere via Telegram (consigliato)

Il percorso più semplice per condividere un gruppo: il file JSON del gruppo è un **documento pinnato** in un gruppo Telegram dedicato e le app lo leggono/scrivono via **Bot API** con il solo bot token. Niente registrazioni sviluppatore, niente OAuth, niente server di SplitFree — e le [notifiche delle spese](#notifiche-telegram) arrivano nella stessa chat.

### Il wizard guidato (niente chat ID da cercare a mano)

Nel gruppo SplitFree: menu **⋯ → Condividi via file → Telegram (consigliato)**. Si apre un wizard in 3 passi:

1. **Il tuo bot**: se non ce l'hai, il wizard apre **@BotFather** (`/newbot` → copia il token); incolli il token e l'app lo verifica. Se l'hai già configurato nelle Impostazioni, questo passo si salta da solo.
2. **Il gruppo Telegram**: il bottone **"Crea il gruppo Telegram col bot"** apre Telegram sul selettore "aggiungi a un gruppo" (i bot non possono creare gruppi da soli): crei un gruppo NUOVO col bot dentro, aggiungi i partecipanti e torni in SplitFree — l'app rileva da sé la chat via `getUpdates` (long polling, ~2 minuti di attesa, annullabile).
3. **Condivisione**: automatica. L'app pubblica il documento pinnato, crea il link d'invito Telegram al gruppo e apre il foglio di condivisione con l'invito SplitFree (che include anche il link Telegram, così chi si unisce entra anche nella chat delle notifiche).

La vecchia via manuale (cercare la Chat ID con @userinfobot o `getUpdates` e incollarla in **Impostazioni → Notifiche Telegram**) resta disponibile come fallback e per le sole notifiche.

### Come funziona

- **Il file è un documento pinnato**: a ogni modifica l'app invia una nuova versione con `sendDocument` (caption `SplitFree · revisione N`) e la pinna silenziosamente. Le vecchie versioni restano nella chat come storico: è una feature.
- **Il link di invito è il segreto del gruppo**: contiene il bot token, quindi chi ce l'ha può leggere e scrivere. Condividilo solo coi partecipanti.
- **Chi si unisce** non configura nulla: apre il link, l'app legge il documento pinnato e può subito aggiungere spese; se l'invito porta anche il link Telegram, compare il bottone per entrare nel gruppo Telegram delle notifiche. Il messageId della versione corrente si scopre dal pin, non serve nell'invito.
- **Corse fra dispositivi**: vale il ciclo pull → merge → push con merge last-write-wins; se due membri pubblicano nello stesso istante, vince l'ultimo pin.

## Notifiche Telegram

Si può ricevere un messaggio su Telegram ogni volta che qualcuno aggiunge una spesa o un rimborso in un gruppo. Non serve nessun server: è l'app stessa a chiamare la Bot API di Telegram dal dispositivo di chi esegue l'azione, con un **bot creato da te**.

### Setup (una volta sola)

1. Apri Telegram e scrivi a **@BotFather** → comando `/newbot` per creare il bot e copiare il **token**.
2. Aggiungi il bot al gruppo Telegram dei partecipanti (o scrivigli in privato, se le notifiche le vuoi solo tu).
3. Trova la **Chat ID**: scrivi a **@userinfobot**, oppure visita `https://api.telegram.org/bot<TOKEN>/getUpdates` dopo aver scritto un messaggio al bot (per i gruppi la Chat ID è negativa, es. `-1001234567890`).
4. In SplitFree: **Impostazioni → Notifiche Telegram** → incolla token e Chat ID, premi **Invia messaggio di prova** per verificare, poi attiva le notifiche.

Il token resta salvato solo sul dispositivo; ogni dispositivo che vuole inviare notifiche va configurato a sé (basta lo stesso bot e la stessa Chat ID).

## Struttura

```
app/                 rotte Expo Router (schermate)
  (tabs)/            Home, Gruppi, Statistiche, Persone, Impostazioni
  onboarding.tsx     collegamento obbligatorio del cloud all'avvio
  group/             dettaglio e editor gruppo
  expense/           editor e dettaglio spesa
  settle/            registrazione rimborso
  person/            editor persona
src/domain/          modello, denaro, split, bilanci, semplificazione, categorie, statistiche
src/cloud/           sync cloud personale (WebDAV/Drive/OneDrive), Firebase, Telegram, token OAuth
src/cloud/fileShare/ condivisione gruppi via file JSON (documento, merge, provider HTTP, sync)
src/store/           store Zustand, persistenza, allegati, tassi, backup
src/ui/              tema e componenti riusabili
tests/               test unitari del motore (Vitest)
desktop/             involucro Electron per macOS/Windows
.github/workflows/   build automatica di APK e app macOS
```

## Sviluppo

```bash
npm install
npm start          # Metro; premi "a" per Android, "w" per il browser
npm test           # motore finanziario
npm run typecheck
```

Su Android si può provare subito con **Expo Go** (scansione del QR), oppure con una development build.

## Build

### Android (APK)

Opzione A, senza toolchain locale: pubblicare un tag (`git tag v0.2.0 && git push origin v0.2.0`): GitHub Actions compila APK e app Mac e li allega a una release. Con **Actions → Build → Run workflow** si ottengono gli stessi file come artefatti, senza release.

Opzione B, con Android Studio installato:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

Opzione C, in cloud con EAS (serve un account Expo):

```bash
npx eas build -p android --profile preview
```

### Mac

Sul Mac (serve solo Node):

```bash
npm install
npm run desktop:build       # esporta la build web e crea il .dmg in desktop/out/
```

Per provare senza impacchettare: `npm run desktop:dev`. Il workflow GitHub `macos` produce lo stesso `.dmg` come artefatto. L'app non è firmata con un certificato Apple: al primo avvio usare tasto destro → Apri.

La stessa build web (`npm run export:web`, cartella `dist/`) può essere servita da qualunque web server e installata come app dal browser.

## Come funziona la semplificazione dei debiti

1. Si calcola il bilancio netto di ogni persona: pagato − dovuto + rimborsi inviati − rimborsi ricevuti.
2. Le coppie con importi uguali e opposti si chiudono con una transazione.
3. Per gruppi piccoli si cercano terne a somma zero (2 transazioni per 3 persone).
4. Il resto viene risolto in modo greedy: il maggior creditore incontra il maggior debitore. Ogni passo azzera almeno una persona, quindi le transazioni sono al più n−1.

Il problema esatto è NP‑difficile; questa strategia è ottima per i casi reali e sempre corretta (i test lo verificano con fuzzing).

## Licenza

MIT. Vedi `LICENSE`.
