# SplitFree

App per dividere le spese in stile Splitwise: **gratuita, open source, senza pubblicità, senza account e senza cloud**. Tutto resta sul dispositivo. Funziona su **Android** (APK) e su **Mac** (app desktop), con lo stesso codice.

## Funzionalità

- **Gruppi e persone locali**: vacanze, coinquilini, cene. Le persone sono schede locali, non serve che abbiano l'app.
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

## Stack

| Livello | Scelta |
|---|---|
| UI | React Native + Expo SDK 57, TypeScript strict, Expo Router |
| Stato | Zustand, con salvataggio automatico dopo ogni modifica |
| Dati | File JSON nella cartella privata dell'app (Android); localStorage + IndexedDB (web/Mac) |
| Motore finanziario | `src/domain/` puro TypeScript, testato con Vitest |
| Grafici | react-native-svg (nessuna libreria di charting) |
| Desktop | Electron che incapsula la build web statica |

Tutti gli importi sono interi in unità minori (centesimi): niente errori in virgola mobile.

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

Opzione A, senza toolchain locale: su GitHub, **Actions → Build → Run workflow**. Il job `android` produce `SplitFree-android-apk` (firmato con la chiave di debug, installabile direttamente). Lo stesso avviene automaticamente pubblicando un tag `v*`.

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
