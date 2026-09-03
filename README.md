# SplitFree

App per dividere le spese in stile Splitwise: **gratuita, open source, senza pubblicità**. Un gruppo può restare **solo locale** (tutto sul dispositivo, come sempre) oppure diventare **condiviso**: allora si sincronizza in tempo reale con le altre persone tramite un progetto Firebase gratuito collegato da chi lo amministra. Funziona su **Android** (APK) e su **Mac** (app desktop), con lo stesso codice.

## Funzionalità

- **Gruppi locali o condivisi**: un gruppo locale resta solo sul telefono, come sempre; uno condiviso vive in tempo reale su Firestore e si invita altra gente con un link (vedi [Gruppi condivisi](#gruppi-condivisi-in-tempo-reale) sotto).
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
- **Backup**: esportazione e importazione di un file JSON per spostare i dati fra dispositivi.
- **Tema chiaro/scuro**, interfaccia in italiano.
- **Navigazione in alto**, non in basso: sul telefono i pulsanti di sistema (Android) o l'indicatore gesture (iOS) stanno già in fondo allo schermo. Si passa da una sezione all'altra toccando la barra in alto oppure trascinando il dito a destra o sinistra sul contenuto.
- **Email per ogni persona**: aggiungendo qualcuno a un gruppo (o dalla scheda Persone) va indicata anche la sua email.

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
| Dati locali | File JSON nella cartella privata dell'app (Android); localStorage + IndexedDB (web/Mac) |
| Dati condivisi | Firestore + Firebase Auth, un progetto per amministratore (nessun backend gestito da SplitFree) |
| Motore finanziario | `src/domain/` puro TypeScript, testato con Vitest |
| Grafici | react-native-svg (nessuna libreria di charting) |
| Desktop | Electron che incapsula la build web statica |

Tutti gli importi sono interi in unità minori (centesimi): niente errori in virgola mobile.

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

## Struttura

```
app/                 rotte Expo Router (schermate)
  (tabs)/            Home, Gruppi, Statistiche, Persone, Impostazioni
  group/             dettaglio e editor gruppo
  expense/           editor e dettaglio spesa
  settle/            registrazione rimborso
  person/            editor persona
src/domain/          modello, denaro, split, bilanci, semplificazione, categorie, statistiche
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
