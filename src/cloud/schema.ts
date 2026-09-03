import { collection, doc, type Firestore } from "firebase/firestore";

/**
 * Percorsi delle collezioni Firestore. Struttura:
 *
 * groups/{groupId}                     dati del gruppo (nome, valuta, proprietario)
 * groups/{groupId}/members/{uid}       persone collegate (id = uid Firebase Auth)
 * groups/{groupId}/expenses/{id}       spese
 * groups/{groupId}/settlements/{id}    rimborsi
 * invites/{code}                       inviti (collezione separata: il "code" stesso
 *                                       è il segreto, nessuno può elencarli senza saperlo)
 */

export const groupsCol = (db: Firestore) => collection(db, "groups");
export const groupDoc = (db: Firestore, groupId: string) => doc(db, "groups", groupId);
export const membersCol = (db: Firestore, groupId: string) => collection(db, "groups", groupId, "members");
export const memberDoc = (db: Firestore, groupId: string, uid: string) => doc(db, "groups", groupId, "members", uid);
export const expensesCol = (db: Firestore, groupId: string) => collection(db, "groups", groupId, "expenses");
export const expenseDoc = (db: Firestore, groupId: string, id: string) => doc(db, "groups", groupId, "expenses", id);
export const settlementsCol = (db: Firestore, groupId: string) => collection(db, "groups", groupId, "settlements");
export const settlementDoc = (db: Firestore, groupId: string, id: string) =>
  doc(db, "groups", groupId, "settlements", id);
export const invitesCol = (db: Firestore) => collection(db, "invites");
export const inviteDoc = (db: Firestore, code: string) => doc(db, "invites", code);

export type CloudGroupDoc = {
  name: string;
  emoji: string;
  description: string;
  currency: string;
  ownerUid: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CloudMemberDoc = {
  name: string;
  color: string;
  email: string | null;
  joinedAt: string;
};

export type CloudInviteDoc = {
  groupId: string;
  groupName: string;
  createdByUid: string;
  createdAt: string;
  active: boolean;
};
