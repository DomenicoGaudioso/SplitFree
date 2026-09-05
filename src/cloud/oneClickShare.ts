import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { writeBatch } from "firebase/firestore";
import type { Expense, Group, GroupCloudLink, Person, Settlement } from "@/domain/types";
import { getDefaultCloudProject, isPlaceholderFirebaseConfig } from "@/cloud/defaultConfig";
import { authFor, ensureAuthUser, getExistingAuthUser, type CloudAuthUser } from "./auth";
import { cloudCreateGroup, cloudCreateInvite } from "./cloudGroup";
import { firestoreFor } from "./firestore";
import { buildInviteLink, type InvitePayload } from "./invites";
import { expenseDoc, memberDoc, settlementDoc, type CloudMemberDoc } from "./schema";

export type OneClickShareResult = {
  ok: boolean;
  link?: string;
  remoteId?: string;
  payload?: InvitePayload;
  cloud?: GroupCloudLink;
  error?: string;
};

/**
 * Condivide qualsiasi gruppo (locale o già cloud) con un solo tocco ("1 click"):
 * - Garantisce l'autenticazione immediata (senza blocchi modali).
 * - Se il gruppo è locale, lo converte e migra spese e persone su Firestore.
 * - Genera il link di invito.
 * - Apre direttamente il foglio nativo di condivisione di sistema (WhatsApp, Telegram, SMS, ecc.)
 *   o copia negli appunti su Web/Desktop.
 */
export async function shareGroupOneClick(params: {
  group: Group;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  self: Person | null | undefined;
  onCloudLinked?: (updatedGroup: Group) => void;
  skipNativeShare?: boolean;
}): Promise<OneClickShareResult> {
  const { group, people, expenses, settlements, self, onCloudLinked, skipNativeShare } = params;

  try {
    const defaultProj = getDefaultCloudProject();
    const config = group.cloud?.config ?? defaultProj.config;
    const googleClientId = group.cloud?.googleClientId ?? defaultProj.googleClientId;
    const microsoftClientId = group.cloud?.microsoftClientId ?? defaultProj.microsoftClientId;

    // 0. Controlli preventivi: senza un progetto Firebase reale e una sessione
    //    autenticata sul server, ogni scrittura fallirebbe più avanti con
    //    errori crittici ("API key not valid" / "Missing or insufficient
    //    permissions"). Meglio bloccare subito con istruzioni chiare.
    if (isPlaceholderFirebaseConfig(config)) {
      return {
        ok: false,
        error:
          "Il progetto cloud predefinito non è configurato: la condivisione richiede un progetto Firebase reale. " +
          "Vai in Impostazioni → Progetti cloud e inserisci la configurazione del tuo progetto Firebase " +
          "(apiKey, projectId, appId…), poi riprova.",
      };
    }

    // 1. Assicura che ci sia una sessione attiva
    let authUser: CloudAuthUser | null = getExistingAuthUser(config);
    if (!authUser) {
      authUser = await ensureAuthUser(config, self?.name || "Utente");
    }

    // La sessione deve esistere davvero su Firebase Auth: gli accessi locali
    // di riserva (ospite/account senza Firebase) producono un uid non
    // riconosciuto dal server e ogni scrittura verrebbe negata.
    const firebaseSession = authFor(config).currentUser;
    if (!firebaseSession) {
      return {
        ok: false,
        error:
          "Nessuna sessione cloud attiva sul server. Verifica la configurazione del progetto Firebase " +
          "(Impostazioni → Progetti cloud) e che nel progetto sia attivo almeno un metodo di accesso " +
          "(anonimo o email/password), poi riprova.",
      };
    }
    // Usa sempre l'uid reale della sessione Firebase, anche se in memoria
    // c'è un profilo locale di riserva con un uid diverso.
    if (firebaseSession.uid !== authUser.uid) {
      authUser = {
        uid: firebaseSession.uid,
        name: firebaseSession.displayName ?? authUser.name,
        email: firebaseSession.email ?? authUser.email,
        photoUrl: firebaseSession.photoURL ?? authUser.photoUrl,
        provider: authUser.provider,
        isAnonymous: firebaseSession.isAnonymous,
      };
    }

    let cloudLink: GroupCloudLink;

    if (group.cloud) {
      cloudLink = group.cloud;
    } else {
      // 2. Gruppo locale -> Creazione su Firestore e migrazione istantanea
      const createdLink = await cloudCreateGroup(config, authUser.uid, {
        name: group.name,
        emoji: group.emoji,
        description: group.description,
        currency: group.currency,
        memberIds: group.memberIds,
        selfName: self?.name || authUser.name || "Io",
        selfColor: self?.color || "#4F46E5",
      });

      cloudLink = {
        ...createdLink,
        googleClientId,
        microsoftClientId,
      };

      const db = firestoreFor(config);
      const batch = writeBatch(db);

      // Pre-popola i membri locali nel gruppo remoto per preservare nomi e colori
      const selfId = self?.id;
      for (const p of people) {
        if (p.isSelf || p.id === selfId) {
          // L'utente corrente è già registrato come ownerUid da cloudCreateGroup
          continue;
        }
        if (group.memberIds.includes(p.id)) {
          const mDocRef = memberDoc(db, cloudLink.remoteId, p.id);
          const memberData: CloudMemberDoc = {
            name: p.name,
            color: p.color,
            email: p.email,
            joinedAt: p.createdAt || new Date().toISOString(),
          };
          batch.set(mDocRef, memberData);
        }
      }

      // Migra le spese esistenti del gruppo locale
      const remapId = (pid: string) => (pid === selfId ? authUser.uid : pid);

      for (const exp of expenses) {
        if (exp.groupId !== group.id) continue;
        const eRef = expenseDoc(db, cloudLink.remoteId, exp.id);
        batch.set(eRef, {
          title: exp.title,
          notes: exp.notes || "",
          categoryId: exp.categoryId,
          date: exp.date,
          currency: exp.currency,
          amountMinor: exp.amountMinor,
          exchangeRate: exp.exchangeRate,
          splitMethod: exp.splitMethod,
          payers: exp.payers.map((py) => ({ ...py, personId: remapId(py.personId) })),
          splits: exp.splits.map((sp) => ({ ...sp, personId: remapId(sp.personId) })),
          createdAt: exp.createdAt || new Date().toISOString(),
          updatedAt: exp.updatedAt || new Date().toISOString(),
        });
      }

      // Migra i rimborsi esistenti
      for (const st of settlements) {
        if (st.groupId !== group.id) continue;
        const sRef = settlementDoc(db, cloudLink.remoteId, st.id);
        batch.set(sRef, {
          fromPersonId: remapId(st.fromPersonId),
          toPersonId: remapId(st.toPersonId),
          amountMinor: st.amountMinor,
          date: st.date,
          note: st.note || "",
          createdAt: st.createdAt || new Date().toISOString(),
        });
      }

      // Esegui la scrittura atomica su Firestore
      await batch.commit();

      // Notifica e aggiorna lo store locale
      const updatedGroup: Group = {
        ...group,
        cloud: cloudLink,
        updatedAt: new Date().toISOString(),
      };
      if (onCloudLinked) {
        onCloudLinked(updatedGroup);
      }
    }

    // 3. Genera invito
    const payload = await cloudCreateInvite(
      cloudLink,
      authUser.uid,
      group.name,
      group.emoji,
      group.currency
    );
    const link = buildInviteLink(payload);

    // 4. Esecuzione condivisione "1 click"
    if (!skipNativeShare) {
      const shareMessage = `Unisciti al gruppo "${group.name}" su SplitFree per dividere le spese in tempo reale:\n${link}`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(link);
      } else {
        try {
          await Share.share({
            message: shareMessage,
            title: `Invito a ${group.name} (SplitFree)`,
          });
        } catch {
          // L'utente ha chiuso il foglio di condivisione di sistema senza errori
        }
      }
    }

    return {
      ok: true,
      link,
      remoteId: cloudLink.remoteId,
      payload,
      cloud: cloudLink,
    };
  } catch (err) {
    const raw = String(err);
    if (raw.includes("permission-denied") || raw.includes("Missing or insufficient permissions")) {
      return {
        ok: false,
        error:
          "Permessi insufficienti sul database cloud. Pubblica le regole aggiornate (file firestore.rules) " +
          "nella console Firebase del progetto: Firestore Database → Regole.",
      };
    }
    if (raw.includes("api-key-not-valid") || raw.includes("API key not valid")) {
      return {
        ok: false,
        error:
          "Chiave API Firebase non valida. Controlla la configurazione del progetto in Impostazioni → Progetti cloud.",
      };
    }
    return {
      ok: false,
      error: `Impossibile condividere nel cloud: ${raw}`,
    };
  }
}
